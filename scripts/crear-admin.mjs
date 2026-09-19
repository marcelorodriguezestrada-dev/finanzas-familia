// Uso: node scripts/crear-admin.mjs
//
// Crea (o actualiza, si ya existe) un usuario en Firebase Auth + su
// perfil de admin en Firestore, sin pasar por la pantalla de registro
// de la app. Pensado para arrancar la app la primera vez, o para
// destrabar un caso raro donde el registro normal no anduvo.
//
// Necesita las mismas 3 variables FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY que ya tenés en tu
// .env local (las de la cuenta de servicio, no las públicas).

import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'

// Carga a mano las variables de .env.local / .env (sin depender del
// paquete dotenv, que no está entre las dependencias del proyecto).
function cargarEnv(ruta) {
  if (!existsSync(ruta)) return
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const l = linea.trim()
    if (!l || l.startsWith('#')) continue
    const igual = l.indexOf('=')
    if (igual === -1) continue
    const clave = l.slice(0, igual).trim()
    let valor = l.slice(igual + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    if (!(clave in process.env)) process.env[clave] = valor
  }
}

cargarEnv('.env.local')
cargarEnv('.env')

const EMAIL = 'marcelo.rodriguez.estrada@gmail.com'
const PASSWORD = '123456'
const NOMBRE = 'Marcelo'

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
  console.error('Faltan FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY en tu .env')
  process.exit(1)
}

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
})

const auth = getAuth()
const db = getFirestore()

async function main() {
  let usuario
  try {
    usuario = await auth.getUserByEmail(EMAIL)
    console.log(`Ya existía en Auth (uid: ${usuario.uid}) — le actualizo la contraseña.`)
    await auth.updateUser(usuario.uid, { password: PASSWORD })
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      usuario = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: NOMBRE })
      console.log(`Usuario creado en Auth (uid: ${usuario.uid}).`)
    } else {
      throw err
    }
  }

  await db.collection('perfiles').doc(usuario.uid).set(
    {
      nombre: NOMBRE,
      email: EMAIL,
      rol: 'admin',
      aprobado: true,
      creadoEn: new Date().toISOString(),
    },
    { merge: true }
  )

  console.log('\n✅ Listo. Ya podés loguearte en la app con:')
  console.log(`   Email:    ${EMAIL}`)
  console.log(`   Password: ${PASSWORD}`)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
