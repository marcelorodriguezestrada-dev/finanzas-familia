import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { NextRequest } from 'next/server'

function getApp(): App {
  if (getApps().length) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // En .env la clave viene con \n literales — hay que convertirlos
      // a saltos de línea de verdad o Firebase rechaza la credencial.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  })
}

export function getDb() {
  return getFirestore(getApp())
}

export function getAuthAdmin() {
  return getAuth(getApp())
}

// Verifica el token del header Authorization y devuelve {uid, email}.
// null si no hay token o no es válido — el que llama decide si eso es
// un 401 o simplemente "no hay usuario logueado".
export async function getUsuarioDesdeRequest(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    const decoded = await getAuthAdmin().verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email || null }
  } catch {
    return null
  }
}

export type Perfil = {
  nombre: string
  rol: 'admin' | 'miembro' | 'pendiente'
  aprobado: boolean
}

// Trae el perfil (rol, si está aprobado) de un uid. null si todavía no
// se registró en /api/perfil.
export async function getPerfil(uid: string): Promise<Perfil | null> {
  const doc = await getDb().collection('perfiles').doc(uid).get()
  if (!doc.exists) return null
  return doc.data() as Perfil
}

// Chequeo estándar que usan casi todos los endpoints: pide el token,
// pide el perfil, y devuelve un error legible si falta algo. Lo
// devuelve como {error, status} para que el endpoint solo tenga que
// hacer `if ('error' in chequeo) return NextResponse.json(...)`.
export async function requerirUsuarioAprobado(req: NextRequest) {
  const usuario = await getUsuarioDesdeRequest(req)
  if (!usuario) return { error: 'Necesitás iniciar sesión.', status: 401 as const }
  const perfil = await getPerfil(usuario.uid)
  if (!perfil) return { error: 'Todavía no completaste tu registro.', status: 403 as const }
  if (!perfil.aprobado) return { error: 'Tu cuenta todavía no fue aprobada por un admin de la familia.', status: 403 as const }
  return { usuario, perfil }
}

export async function requerirAdmin(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return chequeo
  if (chequeo.perfil.rol !== 'admin') return { error: 'Esto solo lo puede hacer un admin.', status: 403 as const }
  return chequeo
}
