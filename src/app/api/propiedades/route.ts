import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado, requerirAdmin } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const snap = await getDb().collection('propiedades').orderBy('creadoEn', 'desc').get()
  const propiedades = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return NextResponse.json({ propiedades })
}

export async function POST(req: NextRequest) {
  const chequeo = await requerirAdmin(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const { nombre, direccion, inquilino, montoAlquiler, diaCobro, notas } = body
    if (!nombre || !montoAlquiler) {
      return NextResponse.json({ error: 'Faltan datos (nombre y monto del alquiler).' }, { status: 400 })
    }
    const ref = await getDb().collection('propiedades').add({
      nombre,
      direccion: direccion || '',
      inquilino: inquilino || '',
      montoAlquiler: Number(montoAlquiler),
      diaCobro: diaCobro ? Number(diaCobro) : null,
      notas: notas || '',
      activo: true,
      creadoPor: chequeo.usuario.uid,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/propiedades', err)
    return NextResponse.json({ error: 'No se pudo crear la propiedad.' }, { status: 500 })
  }
}
