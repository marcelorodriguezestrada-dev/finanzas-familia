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
  rol: 'miembro'
  aprobado: true
}

// Trae el perfil de un uid. null si todavía no se registró en /api/perfil.
export async function getPerfil(uid: string): Promise<Perfil | null> {
  const doc = await getDb().collection('perfiles').doc(uid).get()
  if (!doc.exists) return null
  return doc.data() as Perfil
}

// Chequeo estándar que usan casi todos los endpoints: solo pide que
// haya un token válido y un perfil creado — ya no hay aprobación ni
// roles, cualquiera que se loguee tiene acceso completo.
export async function requerirUsuarioAprobado(req: NextRequest) {
  const usuario = await getUsuarioDesdeRequest(req)
  if (!usuario) return { error: 'Necesitás iniciar sesión.', status: 401 as const }
  const perfil = await getPerfil(usuario.uid)
  if (!perfil) return { error: 'Todavía no completaste tu registro.', status: 403 as const }
  return { usuario, perfil }
}

// Ya no existe el concepto de admin — queda como alias para no romper
// los endpoints que lo llaman, con el mismo chequeo de arriba.
export const requerirAdmin = requerirUsuarioAprobado
