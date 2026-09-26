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

// PATCH { ci?, firmaDataUrl? } — datos propios que se reutilizan en los
// contratos: la C.I. y la firma (PNG transparente ya procesado en el
// navegador, ver src/components/SubirFirma.tsx). Solo se puede editar
// el perfil propio. firmaDataUrl: null borra la firma guardada.
export async function PATCH(req: NextRequest) {
  const usuario = await getUsuarioDesdeRequest(req)
  if (!usuario) return NextResponse.json({ error: 'Necesitás iniciar sesión.' }, { status: 401 })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    if (typeof body.ci === 'string') cambios.ci = body.ci.trim().slice(0, 40)
    if (body.firmaDataUrl === null) {
      cambios.firmaDataUrl = null
    } else if (typeof body.firmaDataUrl === 'string') {
      if (!/^data:image\/png;base64,/.test(body.firmaDataUrl)) {
        return NextResponse.json({ error: 'La firma tiene que ser una imagen PNG.' }, { status: 400 })
      }
      // Firestore admite documentos de hasta 1 MB; una firma recortada
      // pesa bastante menos, esto es solo un tope de seguridad.
      if (body.firmaDataUrl.length > 700_000) {
        return NextResponse.json({ error: 'La imagen de la firma es demasiado pesada. Recortala más cerca.' }, { status: 400 })
      }
      cambios.firmaDataUrl = body.firmaDataUrl
    }
    if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'No hay nada para guardar.' }, { status: 400 })

    const ref = getDb().collection('perfiles').doc(usuario.uid)
    if (!(await ref.get()).exists) return NextResponse.json({ error: 'Todavía no completaste tu registro.' }, { status: 403 })
    await ref.set({ ...cambios, actualizadoEn: new Date().toISOString() }, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PATCH /api/perfil', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar el perfil.' }, { status: 500 })
  }
}
