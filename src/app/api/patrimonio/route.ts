import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado, requerirAdmin } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const snap = await getDb().collection('patrimonio').orderBy('creadoEn', 'desc').get()
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ items })
  } catch (err: any) {
    console.error('GET /api/patrimonio', err)
    return NextResponse.json({ error: err?.message || 'No se pudo leer el patrimonio.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const { nombre, tipo, valor, notas } = body
    if (!nombre || !tipo || valor === undefined) {
      return NextResponse.json({ error: 'Faltan datos (nombre, tipo y valor).' }, { status: 400 })
    }
    const ref = await getDb().collection('patrimonio').add({
      nombre,
      tipo,
      valor: Number(valor),
      notas: notas || '',
      creadoPor: chequeo.usuario.uid,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/patrimonio', err)
    return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 })
  }
}
