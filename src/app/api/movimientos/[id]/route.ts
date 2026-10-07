import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, docDelEspacio } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  if (!(await docDelEspacio('movimientos', params.id, esp))) return NextResponse.json({ error: 'No se encontró (o es de otro espacio).' }, { status: 404 })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    for (const campo of ['categoria', 'descripcion', 'fecha', 'propiedadId']) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.monto !== undefined) cambios.monto = Number(body.monto)

    await getDb().collection('movimientos').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/movimientos/[id]', err)
    return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  if (!(await docDelEspacio('movimientos', params.id, esp))) return NextResponse.json({ error: 'No se encontró (o es de otro espacio).' }, { status: 404 })

  const db = getDb()
  const mov = await db.collection('movimientos').doc(params.id).get()
  // Si era el cobro de una cuota de deuda, la cuota vuelve a quedar
  // pendiente (si no, el plan mostraría como cobrado algo que ya no
  // está en el flujo de caja).
  const deudaId = mov.exists ? mov.data()!.deudaId : null
  if (deudaId) {
    const ref = db.collection('deudas').doc(deudaId)
    const deuda = await ref.get()
    if (deuda.exists) {
      const cuotas = ((deuda.data()!.cuotas || []) as any[]).map((c) =>
        c.movimientoId === params.id ? { ...c, pagada: false, montoPagado: null, pagadaEn: null, movimientoId: null } : c
      )
      const estado = deuda.data()!.estado === 'cancelada' ? 'vigente' : deuda.data()!.estado
      await ref.set({ cuotas, estado }, { merge: true })
    }
  }
  // Si era el pago de un gasto por pagar, vuelve a quedar pendiente.
  const pendienteId = mov.exists ? mov.data()!.pendienteId : null
  if (pendienteId) {
    const refP = db.collection('pendientes').doc(pendienteId)
    const p = await refP.get()
    if (p.exists && p.data()!.pago?.movimientoId === params.id) await refP.set({ estado: 'pendiente', pago: null }, { merge: true })
  }
  await db.collection('movimientos').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
