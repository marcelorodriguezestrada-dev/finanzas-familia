import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { NextRequest } from 'next/server'

function getApp(): App {
  if (getApps().length) return getApps()[0]

  // La clave privada es lo que más se rompe al pasarla a Vercel, por
  // dos motivos distintos:
  // 1. Si se copia del JSON con las comillas incluidas, esas comillas
  //    quedan DENTRO del valor y la clave deja de ser válida.
  // 2. En el .env local viene con \n literales (dos caracteres), pero
  //    si se pega en el panel de Vercel con saltos de línea de verdad,
  //    ya vienen bien y no hay que tocar nada.
  // Esto contempla los dos casos para que no dependa de cómo se pegó.
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim()
  if (
    (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    privateKey = privateKey.slice(1, -1)
  }
  privateKey = privateKey.replace(/\\n/g, '\n')

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
      privateKey,
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
  try {
    const perfil = await getPerfil(usuario.uid)
    if (!perfil) return { error: 'Todavía no completaste tu registro.', status: 403 as const }
    return { usuario, perfil }
  } catch (err: any) {
    // Esto se ejecuta ANTES del try/catch de cada endpoint, así que si
    // Firestore falla acá (credenciales mal cargadas en Vercel, base de
    // datos no creada todavía, etc.) el endpoint devolvía un 500 con
    // cuerpo vacío — y el navegador tiraba "Unexpected end of JSON
    // input", que no dice nada del problema real. Ahora devuelve el
    // mensaje de Firebase tal cual, que sí explica qué pasa.
    console.error('requerirUsuarioAprobado — falló Firestore', err)
    return { error: `Error de base de datos: ${err?.message || 'desconocido'}`, status: 500 as const }
  }
}

// Ya no existe el concepto de admin — queda como alias para no romper
// los endpoints que lo llaman, con el mismo chequeo de arriba.
export const requerirAdmin = requerirUsuarioAprobado
