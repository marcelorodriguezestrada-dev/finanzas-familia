import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado, getAuthAdmin, getDb } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// POST { email: string, password: string, nombre: string }
//
// Crea una cuenta nueva usando el Firebase Admin SDK (permisos de
// servidor), sin que la persona nueva tenga que hacer nada ella
// misma: quien ya tiene acceso a la app carga el email, una
// contraseña, y el nombre, y se los pasa por WhatsApp o de palabra.
// Pensado para familiares que no manejan su email por su cuenta.
//
// Requiere estar logueado (cualquier miembro ya registrado puede
// crear cuentas nuevas — no hay un rol admin separado en este
// sistema, ver la conversación de configuración inicial).
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { email, password, nombre } = (await req.json()) as { email?: string; password?: string; nombre?: string }

    if (!email?.trim() || !password || !nombre?.trim()) {
      return NextResponse.json({ error: 'Faltan el email, la contraseña o el nombre.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña tiene que tener al menos 6 caracteres.' }, { status: 400 })
    }

    const nuevoUsuario = await getAuthAdmin().createUser({
      email: email.trim(),
      password,
      displayName: nombre.trim(),
    })

    // Se crea el perfil directo (sin pasar por /api/perfil, que
    // requiere que la propia persona esté logueada) para que aparezca
    // de inmediato en "Familia" y pueda usarse en selectores como
    // administrador/propietario.
    await getDb().collection('perfiles').doc(nuevoUsuario.uid).set({
      nombre: nombre.trim(),
      email: email.trim(),
      rol: 'miembro',
      aprobado: true,
    })

    return NextResponse.json({ uid: nuevoUsuario.uid, nombre: nombre.trim(), email: email.trim() })
  } catch (err: any) {
    // Firebase Admin usa códigos de error propios; los traducimos a
    // mensajes entendibles para quien está cargando el formulario.
    if (err?.code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 409 })
    }
    if (err?.code === 'auth/invalid-email') {
      return NextResponse.json({ error: 'El email no es válido.' }, { status: 400 })
    }
    console.error('POST /api/crear-usuario', err)
    return NextResponse.json({ error: err?.message || 'No se pudo crear la cuenta.' }, { status: 500 })
  }
}
