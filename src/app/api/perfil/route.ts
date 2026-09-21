import { NextRequest, NextResponse } from 'next/server'
import { getDb, getUsuarioDesdeRequest } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// GET — el perfil del usuario logueado (o null si no se registró
// todavía, lo cual pasa un instante entre crear la cuenta en Firebase
// Auth y que el POST de acá abajo termine de guardar el doc).
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioDesdeRequest(req)
  if (!usuario) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 })
  try {
    const doc = await getDb().collection('perfiles').doc(usuario.uid).get()
    return NextResponse.json({ perfil: doc.exists ? doc.data() : null })
  } catch (err: any) {
    console.error('GET /api/perfil', err)
    return NextResponse.json({ error: err?.message || 'No se pudo leer el perfil.' }, { status: 500 })
  }
}

// POST { nombre } — se llama una sola vez, justo después de crear la
// cuenta. Ya no hay aprobación ni roles: cualquiera que se registre
// entra con acceso completo desde el primer momento.
export async function POST(req: NextRequest) {
  const usuario = await getUsuarioDesdeRequest(req)
  if (!usuario) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 })

  try {
    const db = getDb()
    const ref = db.collection('perfiles').doc(usuario.uid)
    const yaExiste = await ref.get()
    if (yaExiste.exists) return NextResponse.json({ perfil: yaExiste.data() })

    const { nombre } = await req.json()
    const perfil = {
      nombre: (nombre || usuario.email || 'Sin nombre').trim(),
      email: usuario.email,
      rol: 'miembro' as const,
      aprobado: true,
      creadoEn: new Date().toISOString(),
    }
    await ref.set(perfil)
    return NextResponse.json({ perfil })
  } catch (err) {
    console.error('POST /api/perfil', err)
    return NextResponse.json({ error: 'No se pudo crear el perfil.' }, { status: 500 })
  }
}
