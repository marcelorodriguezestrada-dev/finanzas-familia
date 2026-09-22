import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    for (const campo of ['nombre', 'tipo', 'notas', 'estado']) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.comodidades !== undefined) cambios.comodidades = Array.isArray(body.comodidades) ? body.comodidades : []
    if (body.metros !== undefined) cambios.metros = body.metros ? Number(body.metros) : null
    if (body.canonEstandar !== undefined) cambios.canonEstandar = Number(body.canonEstandar)

    await getDb().collection('unidades').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/unidades/[id]', err)
    return NextResponse.json({ error: 'No se pudo actualizar la unidad.' }, { status: 500 })
  }
}

// Borrar una unidad solo si no tiene un alquiler activo — para no
// perder de vista un contrato vigente por error.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const db = getDb()
    const activo = await db.collection('alquileres')
      .where('unidadId', '==', params.id)
      .where('estado', '==', 'activo')
      .limit(1)
      .get()
    if (!activo.empty) {
      return NextResponse.json({ error: 'Esta unidad tiene un alquiler activo. Finalizalo antes de borrarla.' }, { status: 409 })
    }
    await db.collection('unidades').doc(params.id).delete()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/unidades/[id]', err)
    return NextResponse.json({ error: 'No se pudo borrar la unidad.' }, { status: 500 })
  }
}
