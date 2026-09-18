import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

async function puedeEditar(uid: string, rol: string, movimientoId: string) {
  if (rol === 'admin') return true
  const doc = await getDb().collection('movimientos').doc(movimientoId).get()
  return doc.exists && doc.data()!.registradoPor === uid
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const permitido = await puedeEditar(chequeo.usuario.uid, chequeo.perfil.rol, params.id)
  if (!permitido) return NextResponse.json({ error: 'Solo podés editar tus propios movimientos (o ser admin).' }, { status: 403 })

  try {
    const body = await req.json()
    const cambios: Record<string, unknown> = {}
    for (const campo of ['categoria', 'descripcion', 'fecha', 'propiedadId']) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.monto !== undefined) cambios.monto = Number(body.monto)

    await getDb().collection('movimientos').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/movimientos/[id]', err)
    return NextResponse.json({ error: 'No se pudo actualizar.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const permitido = await puedeEditar(chequeo.usuario.uid, chequeo.perfil.rol, params.id)
  if (!permitido) return NextResponse.json({ error: 'Solo podés borrar tus propios movimientos (o ser admin).' }, { status: 403 })

  await getDb().collection('movimientos').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
