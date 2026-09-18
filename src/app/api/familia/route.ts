import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirAdmin } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// GET — solo admin: todos los perfiles (aprobados y pendientes).
export async function GET(req: NextRequest) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const snap = await getDb().collection('perfiles').get()
  const miembros = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
  return NextResponse.json({ miembros })
}

// PATCH { uid, rol?, aprobado? } — solo admin: aprobar a alguien
// pendiente y/o cambiarle el rol (admin / miembro).
export async function PATCH(req: NextRequest) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { uid, rol, aprobado } = await req.json()
    if (!uid) return NextResponse.json({ error: 'Falta uid.' }, { status: 400 })

    const cambios: Record<string, unknown> = {}
    if (rol !== undefined) {
      if (rol !== 'admin' && rol !== 'miembro') return NextResponse.json({ error: 'Rol inválido.' }, { status: 400 })
      cambios.rol = rol
      cambios.aprobado = true // asignarle un rol real implica aprobarlo
    }
    if (aprobado !== undefined) cambios.aprobado = !!aprobado

    await getDb().collection('perfiles').doc(uid).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/familia', err)
    return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 })
  }
}
