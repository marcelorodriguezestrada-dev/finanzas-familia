import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// POST { propiedadId, mes: 'YYYY-MM' } — crea el movimiento de
// ingreso del alquiler de esa propiedad para ese mes, con el monto
// que ya tiene configurado la propiedad (evita tener que tipear
// "Alquiler - Bs 1500" a mano cada mes). No dejamos cargarlo dos
// veces para el mismo mes por error.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { propiedadId, mes } = await req.json()
    if (!propiedadId || !mes) return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })

    const db = getDb()
    const propDoc = await db.collection('propiedades').doc(propiedadId).get()
    if (!propDoc.exists) return NextResponse.json({ error: 'Esa propiedad no existe.' }, { status: 404 })
    const propiedad = propDoc.data()!

    const yaCobrado = await db
      .collection('movimientos')
      .where('propiedadId', '==', propiedadId)
      .where('fecha', '>=', `${mes}-01`)
      .where('fecha', '<=', `${mes}-31`)
      .limit(1)
      .get()
    if (!yaCobrado.empty) {
      return NextResponse.json({ error: 'Ya se registró el cobro de este mes para esta propiedad.' }, { status: 409 })
    }

    const hoy = new Date().toISOString().slice(0, 10)
    const ref = await db.collection('movimientos').add({
      tipo: 'ingreso',
      monto: propiedad.montoAlquiler,
      categoria: 'Alquiler',
      descripcion: `Alquiler ${propiedad.nombre}${propiedad.inquilino ? ' — ' + propiedad.inquilino : ''}`,
      fecha: hoy,
      propiedadId,
      registradoPor: chequeo.usuario.uid,
      registradoPorNombre: chequeo.perfil.nombre,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err) {
    console.error('POST /api/cobrar-alquiler', err)
    return NextResponse.json({ error: 'No se pudo registrar el cobro.' }, { status: 500 })
  }
}
