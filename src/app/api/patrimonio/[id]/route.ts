import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirAdmin } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    for (const campo of ['nombre', 'tipo', 'notas']) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.valor !== undefined) cambios.valor = Number(body.valor)

    await getDb().collection('patrimonio').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/patrimonio/[id]', err)
    return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  await getDb().collection('patrimonio').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
