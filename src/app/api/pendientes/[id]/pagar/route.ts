import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, esDelEspacio } from '@/lib/espacioServidor'
import { vencimientoVigente } from '@/lib/pendientes'
import { formatoBs } from '@/lib/esquemaPago'

export const dynamic = 'force-dynamic'

// POST { fecha?, monto? } — registra el pago: crea el GASTO en
// movimientos (con la categoría, la propiedad y el espacio del
// pendiente) y lo marca como pagado. Si no viene monto, se usa el del
// vencimiento que corresponde a la fecha de pago (1.º o 2.º).
// POST { deshacer: true } — anula el pago (borra el gasto).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)

  try {
    const { fecha, monto, deshacer } = await req.json()
    const db = getDb()
    const ref = db.collection('pendientes').doc(params.id)

    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists || !esDelEspacio(snap.data(), esp)) throw new ErrorPago(404, 'No se encontró (o es de otro espacio).')
      const p = snap.data()!

      if (deshacer) {
        if (p.estado !== 'pagado') throw new ErrorPago(400, 'No estaba pagado.')
        if (p.pago?.movimientoId) tx.delete(db.collection('movimientos').doc(p.pago.movimientoId))
        tx.set(ref, { estado: 'pendiente', pago: null }, { merge: true })
        return { deshecho: true }
      }
      if (p.estado === 'pagado') throw new ErrorPago(409, 'Ya está pagado.')
      if (p.estado === 'anulado') throw new ErrorPago(400, 'Está anulado: reactivalo primero.')

      const fechaPago = /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : new Date().toISOString().slice(0, 10)
      const vig = vencimientoVigente(p as any, fechaPago)
      const montoPagado = Number(monto) > 0 ? Number(monto) : vig?.vencimiento.monto || 0
      if (!(montoPagado > 0)) throw new ErrorPago(400, 'Falta el monto pagado.')

      let lugar = ''
      if (p.unidadId) {
        const u = await tx.get(db.collection('unidades').doc(p.unidadId))
        lugar = u.data()?.nombre || ''
      }

      const movRef = db.collection('movimientos').doc()
      tx.set(movRef, {
        espacio: p.espacio || 'familia',
        moneda: p.moneda || esp.moneda,
        tipo: 'gasto',
        monto: montoPagado,
        categoria: p.categoria || 'Expensas',
        descripcion: `${p.titulo}${vig ? ` · ${vig.vencidoTodo ? 'pagado fuera de término' : `${vig.vencimiento.numero}.º vencimiento`}` : ''}${p.proveedor ? ` · ${p.proveedor}` : ''}${lugar && !String(p.titulo).includes(lugar) ? ` · ${lugar}` : ''}`,
        fecha: fechaPago,
        propiedadId: p.propiedadId || null,
        unidadId: p.unidadId || null,
        pendienteId: params.id,
        comprobanteUrl: p.documentoUrl || null,
        registradoPor: chequeo.usuario.uid,
        registradoPorNombre: chequeo.perfil.nombre,
        creadoEn: new Date().toISOString(),
      })
      tx.set(
        ref,
        { estado: 'pagado', pago: { fecha: fechaPago, monto: montoPagado, movimientoId: movRef.id, vencimientoNumero: vig && !vig.vencidoTodo ? vig.vencimiento.numero : null } },
        { merge: true }
      )
      return { movimientoId: movRef.id, texto: `${formatoBs(montoPagado).replace(/^Bs /, '')} el ${fechaPago.split('-').reverse().join('/')}` }
    })
    return NextResponse.json(resultado, { status: 201 })
  } catch (err: any) {
    if (err instanceof ErrorPago) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/pendientes/[id]/pagar', err)
    return NextResponse.json({ error: err?.message || 'No se pudo registrar el pago.' }, { status: 500 })
  }
}

class ErrorPago extends Error {
  status: number
  constructor(status: number, m: string) {
    super(m)
    this.status = status
  }
}
