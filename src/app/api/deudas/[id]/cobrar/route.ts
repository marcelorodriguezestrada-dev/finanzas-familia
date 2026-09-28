import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { CATEGORIA_COBRO_DEUDA, ordenarCuotas } from '@/lib/deudas'
import { formatoBs } from '@/lib/esquemaPago'

export const dynamic = 'force-dynamic'

// POST { numero, monto?, fecha? } — registra el pago de una cuota:
// crea el INGRESO en movimientos (flujo de caja) con la propiedad, la
// unidad, el alquiler de origen y el deudor, y marca la cuota como
// pagada. Si con esto se pagan todas, el plan pasa a "cancelada".
//
// POST { numero, deshacer: true } — anula el cobro (borra el ingreso y
// deja la cuota pendiente), para corregir un error de carga.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { numero, monto, fecha, deshacer } = await req.json()
    const db = getDb()
    const ref = db.collection('deudas').doc(params.id)

    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new ErrorCobro(404, 'Esa deuda no existe.')
      const deuda = snap.data()!
      const cuotas = ordenarCuotas(deuda.cuotas || [])
      const idx = cuotas.findIndex((c) => c.numero === Number(numero))
      if (idx < 0) throw new ErrorCobro(400, 'Esa cuota no existe.')
      const cuota = cuotas[idx]

      if (deshacer) {
        if (!cuota.pagada) throw new ErrorCobro(400, 'Esa cuota no estaba cobrada.')
        if (cuota.movimientoId) tx.delete(db.collection('movimientos').doc(cuota.movimientoId))
        cuotas[idx] = { ...cuota, pagada: false, montoPagado: null, pagadaEn: null, movimientoId: null }
        tx.set(ref, { cuotas, estado: deuda.estado === 'cancelada' ? 'vigente' : deuda.estado }, { merge: true })
        return { deshecho: true }
      }

      if (cuota.pagada) throw new ErrorCobro(409, `La cuota ${cuota.numero} ya está cobrada.`)
      const montoCobrado = Number(monto) > 0 ? Number(monto) : cuota.monto
      const fechaCobro = /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') ? fecha : new Date().toISOString().slice(0, 10)

      // Nombres legibles para la descripción del movimiento.
      const [unidad, propiedad, alquiler] = await Promise.all([
        deuda.unidadId ? tx.get(db.collection('unidades').doc(deuda.unidadId)) : null,
        deuda.propiedadId ? tx.get(db.collection('propiedades').doc(deuda.propiedadId)) : null,
        deuda.alquilerId ? tx.get(db.collection('alquileres').doc(deuda.alquilerId)) : null,
      ])
      const lugar = [propiedad?.data()?.nombre, unidad?.data()?.nombre].filter(Boolean).join(' — ')
      const exInquilino = alquiler?.data()?.inquilinoNombre

      const movRef = db.collection('movimientos').doc()
      tx.set(movRef, {
        tipo: 'ingreso',
        monto: montoCobrado,
        categoria: CATEGORIA_COBRO_DEUDA,
        descripcion: `Cuota ${cuota.numero}/${cuotas.length} deuda de ${deuda.deudorNombre}${lugar ? ` · ${lugar}` : ''}${exInquilino && exInquilino !== deuda.deudorNombre ? ` (alquiler de ${exInquilino})` : ''}`,
        fecha: fechaCobro,
        propiedadId: deuda.propiedadId || null,
        unidadId: deuda.unidadId || null,
        alquilerId: deuda.alquilerId || null,
        deudaId: params.id,
        deudaCuota: cuota.numero,
        deudorNombre: deuda.deudorNombre,
        registradoPor: chequeo.usuario.uid,
        registradoPorNombre: chequeo.perfil.nombre,
        creadoEn: new Date().toISOString(),
      })
      cuotas[idx] = { ...cuota, pagada: true, montoPagado: montoCobrado, pagadaEn: fechaCobro, movimientoId: movRef.id }
      const todasPagadas = cuotas.every((c) => c.pagada)
      tx.set(ref, { cuotas, ...(todasPagadas ? { estado: 'cancelada' } : {}) }, { merge: true })
      return { movimientoId: movRef.id, texto: `${formatoBs(montoCobrado)} (cuota ${cuota.numero}/${cuotas.length})`, cancelada: todasPagadas }
    })

    return NextResponse.json(resultado, { status: 201 })
  } catch (err: any) {
    if (err instanceof ErrorCobro) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/deudas/[id]/cobrar', err)
    return NextResponse.json({ error: err?.message || 'No se pudo registrar el cobro.' }, { status: 500 })
  }
}

class ErrorCobro extends Error {
  status: number
  constructor(status: number, m: string) {
    super(m)
    this.status = status
  }
}
