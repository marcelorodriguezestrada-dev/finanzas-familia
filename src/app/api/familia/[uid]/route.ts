import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado, getAuthAdmin, getDb } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// DELETE — borra la cuenta (Firebase Auth) y el perfil (Firestore) de
// un miembro de la familia. Cualquiera de los miembros ya logueados
// puede borrar a cualquier otro (no hay rol admin en este sistema),
// pero nadie puede borrarse a sí mismo si es el único miembro que
// queda, para no dejar la app sin nadie con acceso.
export async function DELETE(req: NextRequest, { params }: { params: { uid: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const db = getDb()
    const snap = await db.collection('perfiles').get()

    if (snap.size <= 1 && snap.docs[0]?.id === params.uid) {
      return NextResponse.json({ error: 'No podés borrar el único usuario que queda.' }, { status: 400 })
    }

    // Se borra primero de Firestore y después de Auth: si algo falla
    // a mitad de camino, es preferible que quede un registro huérfano
    // en Firestore (se puede volver a borrar) a que quede una cuenta
    // de Auth sin perfil, que rompería el login de esa persona sin
    // avisar por qué.
    await db.collection('perfiles').doc(params.uid).delete()

    try {
      await getAuthAdmin().deleteUser(params.uid)
    } catch (err: any) {
      // Si la cuenta de Auth ya no existía (por ejemplo, se borró a
      // mano antes), no es un error real — el perfil igual se borró.
      if (err?.code !== 'auth/user-not-found') throw err
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('DELETE /api/familia/[uid]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo eliminar el usuario.' }, { status: 500 })
  }
}
