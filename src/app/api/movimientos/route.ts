import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// GET ?mes=YYYY-MM (opcional) — todos los movimientos, o solo los de
// un mes puntual. Cualquier miembro aprobado ve TODOS los movimientos
// de la familia, no solo los propios — la idea de esta app es
// transparencia total entre todos, no plata escondida de nadie.
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const mes = req.nextUrl.searchParams.get('mes')
    let query = getDb().collection('movimientos').orderBy('fecha', 'desc') as FirebaseFirestore.Query
    if (mes) {
      query = query.where('fecha', '>=', `${mes}-01`).where('fecha', '<=', `${mes}-31`)
    }
    const snap = await query.get()
    const movimientos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ movimientos })
  } catch (err: any) {
    console.error('GET /api/movimientos', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer los movimientos.' }, { status: 500 })
  }
}

// POST — cualquier miembro aprobado puede cargar un ingreso o gasto.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const { tipo, monto, categoria, descripcion, fecha, propiedadId } = body
    if (tipo !== 'ingreso' && tipo !== 'gasto') {
      return NextResponse.json({ error: 'El tipo tiene que ser "ingreso" o "gasto".' }, { status: 400 })
    }
    if (!monto || Number(monto) <= 0 || !categoria || !fecha) {
      return NextResponse.json({ error: 'Faltan datos (monto, categoría y fecha).' }, { status: 400 })
    }

    const ref = await getDb().collection('movimientos').add({
      tipo,
      monto: Number(monto),
      categoria,
      descripcion: descripcion || '',
      fecha, // 'YYYY-MM-DD'
      propiedadId: propiedadId || null,
      registradoPor: chequeo.usuario.uid,
      registradoPorNombre: chequeo.perfil.nombre,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/movimientos', err)
    return NextResponse.json({ error: 'No se pudo guardar el movimiento.' }, { status: 500 })
  }
}
