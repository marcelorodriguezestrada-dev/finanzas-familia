import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    for (const campo of ['nombre', 'direccion', 'notas', 'croquisUrl']) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.activo !== undefined) cambios.activo = !!body.activo

    await getDb().collection('propiedades').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/propiedades/[id]', err)
    return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 })
  }
}

// Borrar una propiedad solo si no tiene unidades cargadas — evita
// dejar unidades/alquileres huérfanos sin darse cuenta.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const db = getDb()
    const unidades = await db.collection('unidades').where('propiedadId', '==', params.id).limit(1).get()
    if (!unidades.empty) {
      return NextResponse.json(
        { error: 'Esta propiedad tiene unidades cargadas. Borrá primero sus departamentos/habitaciones.' },
        { status: 409 }
      )
    }
    await db.collection('propiedades').doc(params.id).delete()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/propiedades/[id]', err)
    return NextResponse.json({ error: 'No se pudo borrar.' }, { status: 500 })
  }
}
