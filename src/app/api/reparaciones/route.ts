import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, enEspacio, docDelEspacio } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

// GET ?propiedadId=&unidadId=&resuelta=true|false
// Historial de reparaciones — pendientes y ya resueltas. Es también
// el "calendario de notas" del punto 4: acá quedan las sugerencias o
// solicitudes de reparación que dejan los inquilinos.
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)

  try {
    const { searchParams } = req.nextUrl
    const db = getDb()
    let query = db.collection('reparaciones') as FirebaseFirestore.Query

    const propiedadId = searchParams.get('propiedadId')
    const unidadId = searchParams.get('unidadId')
    const resuelta = searchParams.get('resuelta')
    if (unidadId) query = query.where('unidadId', '==', unidadId)
    else if (propiedadId) query = query.where('propiedadId', '==', propiedadId)
    if (resuelta !== null) query = query.where('resuelta', '==', resuelta === 'true')

    const snap = await query.get()
    const reparaciones = enEspacio(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[], esp)
    reparaciones.sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || ''))
    return NextResponse.json({ reparaciones })
  } catch (err: any) {
    console.error('GET /api/reparaciones', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer las reparaciones.' }, { status: 500 })
  }
}

// POST — cargar una reparación pendiente (de la casa entera o de una
// unidad puntual), venga de un pedido del inquilino o de alguien de
// la familia que la detectó.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)

  try {
    const body = await req.json()
    const { propiedadId, unidadId, detalle, prioridad, solicitadoPor, costoEstimado } = body

    if (!propiedadId || !detalle) {
      return NextResponse.json({ error: 'Faltan datos (propiedad y detalle de la reparación).' }, { status: 400 })
    }

    if (!(await docDelEspacio('propiedades', propiedadId, esp))) {
      return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })
    }

    const ref = await getDb().collection('reparaciones').add({
      espacio: esp.id,
      propiedadId,
      unidadId: unidadId || null,
      detalle: String(detalle).trim(),
      prioridad: prioridad || 'media',
      solicitadoPor: solicitadoPor || '',
      costoEstimado: costoEstimado ? Number(costoEstimado) : null,
      resuelta: false,
      resueltaEn: null,
      movimientoGastoId: null,
      creadoPor: chequeo.usuario.uid,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/reparaciones', err)
    return NextResponse.json({ error: 'No se pudo cargar la reparación.' }, { status: 500 })
  }
}
