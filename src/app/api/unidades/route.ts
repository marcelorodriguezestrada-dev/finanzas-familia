import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// GET ?propiedadId=xxx — las unidades (deptos/habitaciones) de una
// casa, o todas si no se filtra. Es la "ficha del espacio": qué tiene
// cada ambiente y cuál es su canon estándar.
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const propiedadId = req.nextUrl.searchParams.get('propiedadId')
    const db = getDb()
    let query = db.collection('unidades') as FirebaseFirestore.Query
    if (propiedadId) query = query.where('propiedadId', '==', propiedadId)
    const snap = await query.get()
    const unidades = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    // Ordenamos acá en memoria y no con orderBy para no obligar a crear
    // un índice compuesto en Firestore (propiedadId + nombre) — son
    // pocas unidades por casa, no justifica el índice.
    unidades.sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { numeric: true }))
    return NextResponse.json({ unidades })
  } catch (err: any) {
    console.error('GET /api/unidades', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer las unidades.' }, { status: 500 })
  }
}

// POST — alta de una unidad dentro de una propiedad.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const { propiedadId, nombre, tipo, comodidades, metros, canonEstandar, estado, notas } = body

    if (!propiedadId || !nombre) {
      return NextResponse.json({ error: 'Faltan datos (propiedad y nombre de la unidad).' }, { status: 400 })
    }
    if (canonEstandar == null || Number(canonEstandar) <= 0) {
      return NextResponse.json({ error: 'Cargá el canon de alquiler estándar de esta unidad.' }, { status: 400 })
    }

    const db = getDb()
    const propiedad = await db.collection('propiedades').doc(propiedadId).get()
    if (!propiedad.exists) {
      return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })
    }

    const ref = await db.collection('unidades').add({
      propiedadId,
      nombre: String(nombre).trim(),
      tipo: tipo || 'departamento',
      comodidades: Array.isArray(comodidades) ? comodidades : [],
      metros: metros ? Number(metros) : null,
      canonEstandar: Number(canonEstandar),
      estado: estado || 'disponible',
      notas: notas || '',
      creadoPor: chequeo.usuario.uid,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/unidades', err)
    return NextResponse.json({ error: err?.message || 'No se pudo crear la unidad.' }, { status: 500 })
  }
}
