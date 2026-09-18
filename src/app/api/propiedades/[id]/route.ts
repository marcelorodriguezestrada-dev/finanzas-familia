import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirAdmin } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    for (const campo of ['nombre', 'direccion', 'inquilino', 'notas']) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.montoAlquiler !== undefined) cambios.montoAlquiler = Number(body.montoAlquiler)
    if (body.diaCobro !== undefined) cambios.diaCobro = body.diaCobro ? Number(body.diaCobro) : null
    if (body.activo !== undefined) cambios.activo = !!body.activo

    await getDb().collection('propiedades').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/propiedades/[id]', err)
    return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  await getDb().collection('propiedades').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
