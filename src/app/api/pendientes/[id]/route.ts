import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, docDelEspacio } from '@/lib/espacioServidor'
import { sanearVencimientos, sanearConceptos } from '@/lib/pendientes'

export const dynamic = 'force-dynamic'

// PATCH — editar datos, vencimientos o anular/reactivar.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  const doc = await docDelEspacio('pendientes', params.id, esp)
  if (!doc) return NextResponse.json({ error: 'No se encontró (o es de otro espacio).' }, { status: 404 })
  try {
    const b = await req.json()
    const cambios: Record<string, unknown> = {}
    for (const c of ['titulo', 'categoria', 'proveedor', 'notas', 'documentoUrl', 'propiedadId', 'unidadId']) if (b[c] !== undefined) cambios[c] = b[c]
    if (b.vencimientos !== undefined) cambios.vencimientos = sanearVencimientos(b.vencimientos)
    if (b.conceptos !== undefined) cambios.conceptos = sanearConceptos(b.conceptos)
    if (b.pagoProveedor !== undefined) cambios.pagoProveedor = b.pagoProveedor
    if (b.estado === 'anulado' || (b.estado === 'pendiente' && doc.data()!.estado === 'anulado')) cambios.estado = b.estado
    cambios.actualizadoEn = new Date().toISOString()
    await doc.ref.set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PATCH /api/pendientes/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar.' }, { status: 500 })
  }
}

// DELETE — borra el gasto por pagar. Si ya estaba pagado, el gasto
// queda en movimientos salvo ?conMovimiento=1.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  const doc = await docDelEspacio('pendientes', params.id, esp)
  if (!doc) return NextResponse.json({ ok: true })
  const movId = doc.data()!.pago?.movimientoId
  if (movId && req.nextUrl.searchParams.get('conMovimiento') === '1') await getDb().collection('movimientos').doc(movId).delete()
  await doc.ref.delete()
  return NextResponse.json({ ok: true })
}
