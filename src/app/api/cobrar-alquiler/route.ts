import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { cuotaDelMes, formatoBs, redondear } from '@/lib/esquemaPago'
import { espacioDe, esDelEspacio } from '@/lib/espacioServidor'
import { mesDeCobro, esCobroDeAlquiler } from '@/lib/cobros'
import { recalcularAlertaCobro } from '@/lib/alertasServidor'

export const dynamic = 'force-dynamic'

// POST { alquilerId, mes: 'YYYY-MM', monto?, fecha?, medio?, explicacion? }
// Registra el cobro de la cuota de un mes como INGRESO.
// - Sin monto: cobra todo lo que falta de esa cuota.
// - Con un monto menor a lo que falta: es un PAGO PARCIAL. Pide una
//   explicación y deja una alerta para tratar en la reunión familiar.
// - Se pueden registrar varios pagos para el mismo mes hasta completarlo
//   (al completarse, la alerta queda "saldada").
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)

  try {
    const body = await req.json()
    const { alquilerId, mes } = body
    if (!alquilerId || !/^\d{4}-\d{2}$/.test(mes || '')) return NextResponse.json({ error: 'Faltan datos (alquiler y período).' }, { status: 400 })

    const db = getDb()
    const alqDoc = await db.collection('alquileres').doc(alquilerId).get()
    if (!alqDoc.exists) return NextResponse.json({ error: 'Ese alquiler no existe.' }, { status: 404 })
    const alquiler = { id: alqDoc.id, ...alqDoc.data() } as any
    if (!esDelEspacio(alquiler, esp)) return NextResponse.json({ error: 'Ese alquiler no existe.' }, { status: 404 })

    const cuota = cuotaDelMes(alquiler, mes)
    if (!cuota) return NextResponse.json({ error: 'Según el contrato, este alquiler no tiene cuota en ese mes (está fuera del plazo).' }, { status: 400 })

    const previos = (await db.collection('movimientos').where('alquilerId', '==', alquilerId).get()).docs
      .map((d) => d.data())
      .filter((m) => esCobroDeAlquiler(m, alquilerId) && mesDeCobro(m) === mes)
    const yaPagado = redondear(previos.reduce((s, m) => s + Number(m.monto || 0), 0))
    const pendiente = redondear(cuota.monto - yaPagado)
    if (pendiente <= 0.009) return NextResponse.json({ error: `La cuota de ${cuota.etiqueta.toLowerCase()} ya está pagada completa.` }, { status: 409 })

    const monto = body.monto !== undefined && body.monto !== null && body.monto !== '' ? redondear(Number(body.monto)) : pendiente
    if (!(monto > 0)) return NextResponse.json({ error: 'El monto tiene que ser mayor a cero.' }, { status: 400 })
    if (monto > pendiente + 0.009) {
      return NextResponse.json({ error: `Para ${cuota.etiqueta.toLowerCase()} faltan ${formatoBs(pendiente)}. Si pagó de más, registrá el resto en el mes siguiente.` }, { status: 400 })
    }
    const parcial = monto < pendiente - 0.009
    const explicacion = String(body.explicacion || '').trim().slice(0, 1000)
    if (parcial && explicacion.length < 5) {
      return NextResponse.json({ error: 'Es un pago parcial: escribí la explicación (por qué no pagó todo y cuándo completa).' }, { status: 400 })
    }
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '') ? body.fecha : new Date().toISOString().slice(0, 10)
    const medio = ['efectivo', 'transferencia', 'qr'].includes(body.medio) ? body.medio : null
    const saldo = redondear(pendiente - monto)

    const detalle =
      cuota.tipo === 'proporcional_inicio'
        ? ` — proporcional ${cuota.dias} días (ingreso)`
        : cuota.tipo === 'proporcional_fin'
        ? ` — proporcional ${cuota.dias} días (salida)`
        : ''
    const ref = await db.collection('movimientos').add({
      espacio: esp.id,
      moneda: esp.moneda,
      tipo: 'ingreso',
      monto,
      categoria: 'Alquiler',
      descripcion: `Alquiler ${alquiler.inquilinoNombre} · ${cuota.etiqueta}${detalle}${parcial ? ` · pago parcial (faltan ${formatoBs(saldo)})` : yaPagado > 0 ? ' · completa el saldo' : ''}`,
      fecha, // fecha real en que entró la plata
      mesCuota: mes, // mes de la cuota que paga
      parcial,
      saldoCuota: saldo,
      medio,
      nota: explicacion,
      propiedadId: alquiler.propiedadId,
      unidadId: alquiler.unidadId,
      alquilerId,
      registradoPor: chequeo.usuario.uid,
      registradoPorNombre: chequeo.perfil.nombre,
      creadoEn: new Date().toISOString(),
    })

    await recalcularAlertaCobro(alquilerId, mes, {
      crear: parcial,
      explicacion: explicacion ? { fecha, monto, texto: explicacion, porNombre: chequeo.perfil.nombre, movimientoId: ref.id } : undefined,
    })

    return NextResponse.json(
      {
        id: ref.id,
        monto,
        parcial,
        saldo,
        texto: parcial
          ? `${formatoBs(monto)} de ${formatoBs(pendiente)} (${cuota.etiqueta}). Faltan ${formatoBs(saldo)}: quedó una alerta para la reunión familiar.`
          : `${formatoBs(monto)} (${cuota.etiqueta}${detalle})${yaPagado > 0 ? ': cuota completa' : ''}.`,
      },
      { status: 201 }
    )
  } catch (err: any) {
    console.error('POST /api/cobrar-alquiler', err)
    return NextResponse.json({ error: err?.message || 'No se pudo registrar el cobro.' }, { status: 500 })
  }
}
