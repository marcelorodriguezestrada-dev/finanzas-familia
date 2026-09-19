import { NextRequest, NextResponse } from 'next/server'
import { getDb, getUsuarioDesdeRequest } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// GET — el perfil del usuario logueado (o null si no se registró
// todavía, lo cual pasa un instante entre crear la cuenta en Firebase
// Auth y que el POST de acá abajo termine de guardar el doc).
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioDesdeRequest(req)
  if (!usuario) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 })
  const doc = await getDb().collection('perfiles').doc(usuario.uid).get()
  return NextResponse.json({ perfil: doc.exists ? doc.data() : null })
}

// POST { nombre } — se llama una sola vez, justo después de crear la
// cuenta. La PRIMERA persona que se registra en toda la app queda
// admin automático (así alguien de la familia puede empezar a usarla
// sin depender de que ya exista un admin previo). El resto entra
// directo como "miembro" ya aprobado -- es una app familiar, no hace
// falta que un admin apruebe a cada uno a mano antes de poder usarla.
export async function POST(req: NextRequest) {
  const usuario = await getUsuarioDesdeRequest(req)
  if (!usuario) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 })

  try {
    const db = getDb()
    const ref = db.collection('perfiles').doc(usuario.uid)
    const yaExiste = await ref.get()
    if (yaExiste.exists) return NextResponse.json({ perfil: yaExiste.data() })

    const { nombre } = await req.json()
    const totalPerfiles = await db.collection('perfiles').count().get()
    const esPrimero = totalPerfiles.data().count === 0

    const perfil = {
      nombre: (nombre || usuario.email || 'Sin nombre').trim(),
      email: usuario.email,
      rol: esPrimero ? 'admin' : 'miembro',
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
