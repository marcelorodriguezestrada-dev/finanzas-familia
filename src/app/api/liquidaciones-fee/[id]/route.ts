import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// PATCH { pagada, notas } — marcar la liquidación como pagada (o
// deshacerlo) y dejar una nota de la reunión familiar si hace falta.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    if (body.notas !== undefined) cambios.notas = body.notas
    if (body.pagada !== undefined) {
      cambios.pagada = !!body.pagada
      cambios.pagadaEn = body.pagada ? new Date().toISOString() : null
    }
    await getDb().collection('liquidacionesFee').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/liquidaciones-fee/[id]', err)
    return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  await getDb().collection('liquidacionesFee').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
