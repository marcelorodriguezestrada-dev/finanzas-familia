import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// GET — cualquier usuario logueado: la lista de todos los que
// registraron cuenta. Ya no hay aprobación ni roles que gestionar acá.
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const snap = await getDb().collection('perfiles').get()
    const miembros = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
    return NextResponse.json({ miembros })
  } catch (err: any) {
    console.error('GET /api/familia', err)
    return NextResponse.json({ error: err?.message || 'No se pudo leer la familia.' }, { status: 500 })
  }
}
