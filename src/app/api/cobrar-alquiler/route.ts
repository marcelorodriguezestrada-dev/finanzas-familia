import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// POST { alquilerId, mes: 'YYYY-MM' } — crea el movimiento de ingreso
// bruto cobrado por ese alquiler puntual, con el monto que ya tiene
// pactado (evita tipear "Alquiler - Bs 1500" a mano cada mes). No se
// puede cargar dos veces el mismo alquiler el mismo mes.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { alquilerId, mes } = await req.json()
    if (!alquilerId || !mes) return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 })

    const db = getDb()
    const alqDoc = await db.collection('alquileres').doc(alquilerId).get()
    if (!alqDoc.exists) return NextResponse.json({ error: 'Ese alquiler no existe.' }, { status: 404 })
    const alquiler = alqDoc.data()!

    const yaCobrado = await db
      .collection('movimientos')
      .where('alquilerId', '==', alquilerId)
      .where('fecha', '>=', `${mes}-01`)
      .where('fecha', '<=', `${mes}-31`)
      .limit(1)
      .get()
    if (!yaCobrado.empty) {
      return NextResponse.json({ error: 'Ya se registró el cobro de este mes para este alquiler.' }, { status: 409 })
    }

    const hoy = new Date().toISOString().slice(0, 10)
    const ref = await db.collection('movimientos').add({
      tipo: 'ingreso',
      monto: alquiler.montoMensual,
      categoria: 'Alquiler',
      descripcion: `Alquiler ${alquiler.inquilinoNombre}`,
      fecha: hoy,
      propiedadId: alquiler.propiedadId,
      unidadId: alquiler.unidadId,
      alquilerId,
      registradoPor: chequeo.usuario.uid,
      registradoPorNombre: chequeo.perfil.nombre,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/cobrar-alquiler', err)
    return NextResponse.json({ error: err?.message || 'No se pudo registrar el cobro.' }, { status: 500 })
  }
}
