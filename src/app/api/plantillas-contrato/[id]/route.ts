import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado, getDb } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// PATCH { nombre?: string, clausulas?: {titulo:string, texto:string}[] }
// Permite retocar el nombre o las cláusulas extraídas (por si la IA
// se equivocó en algo y el usuario quiere corregirlo a mano).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const cambios: Record<string, any> = {}
    if (typeof body.nombre === 'string') cambios.nombre = body.nombre.trim()
    if (Array.isArray(body.clausulas)) cambios.clausulas = body.clausulas

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'No hay nada para actualizar.' }, { status: 400 })
    }

    await getDb().collection('plantillasContrato').doc(params.id).update(cambios)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PATCH /api/plantillas-contrato/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar la plantilla.' }, { status: 500 })
  }
}

// DELETE — borra la plantilla (no borra el PDF de Supabase Storage,
// solo el registro; el archivo queda ahí pero deja de listarse).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    await getDb().collection('plantillasContrato').doc(params.id).delete()
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('DELETE /api/plantillas-contrato/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo borrar la plantilla.' }, { status: 500 })
  }
}
