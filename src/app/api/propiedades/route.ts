import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// GET — todas las casas de la familia. Cada una se desglosa después
// en unidades (deptos/habitaciones) vía /api/unidades?propiedadId=.
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const snap = await getDb().collection('propiedades').orderBy('creadoEn', 'desc').get()
    const propiedades = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ propiedades })
  } catch (err: any) {
    console.error('GET /api/propiedades', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer las propiedades.' }, { status: 500 })
  }
}

// POST — alta de una casa familiar. Sin monto de alquiler acá: el
// precio se fija por unidad (canonEstandar en /api/unidades), porque
// una misma casa puede tener varios ambientes con precios distintos.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const { nombre, direccion, notas } = body
    if (!nombre) {
      return NextResponse.json({ error: 'Falta el nombre de la propiedad.' }, { status: 400 })
    }
    const ref = await getDb().collection('propiedades').add({
      nombre: String(nombre).trim(),
      direccion: direccion || '',
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
