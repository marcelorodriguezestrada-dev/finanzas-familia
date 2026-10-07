import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { sanearCuotas } from '@/lib/deudas'
import { espacioDe, enEspacio } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

// GET ?alquilerId=&unidadId= — deudas con plan de pago (todas por
// defecto, más nuevas primero).
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  try {
    const sp = req.nextUrl.searchParams
    let query = getDb().collection('deudas') as FirebaseFirestore.Query
    if (sp.get('alquilerId')) query = query.where('alquilerId', '==', sp.get('alquilerId'))
    else if (sp.get('unidadId')) query = query.where('unidadId', '==', sp.get('unidadId'))
    const snap = await query.get()
    const deudas = enEspacio(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[], esp)
    deudas.sort((a, b) => (b.fechaAcuerdo || '').localeCompare(a.fechaAcuerdo || ''))
    return NextResponse.json({ deudas })
  } catch (err: any) {
    console.error('GET /api/deudas', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer las deudas.' }, { status: 500 })
  }
}

// POST — registra un plan de pago de deuda.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  try {
    const b = await req.json()
    const cuotas = sanearCuotas(b.cuotas)
    if (!String(b.deudorNombre || '').trim()) return NextResponse.json({ error: 'Falta el nombre del deudor.' }, { status: 400 })
    if (!(Number(b.montoTotal) > 0)) return NextResponse.json({ error: 'Falta el monto total reconocido.' }, { status: 400 })
    if (cuotas.length === 0) return NextResponse.json({ error: 'Cargá al menos una cuota (monto y fecha de vencimiento).' }, { status: 400 })

    const db = getDb()
    // Si viene el alquiler, propiedad y unidad salen de ahí (así no
    // quedan inconsistentes).
    let propiedadId = b.propiedadId || null
    let unidadId = b.unidadId || null
    if (b.alquilerId) {
      const alq = await db.collection('alquileres').doc(b.alquilerId).get()
      if (!alq.exists) return NextResponse.json({ error: 'Ese alquiler no existe.' }, { status: 404 })
      propiedadId = alq.data()!.propiedadId || propiedadId
      unidadId = alq.data()!.unidadId || unidadId
    } else if (unidadId && !propiedadId) {
      const u = await db.collection('unidades').doc(unidadId).get()
      if (u.exists) propiedadId = u.data()!.propiedadId || null
    }

    const doc = {
      titulo: String(b.titulo || '').trim() || `Deuda ${String(b.deudorNombre).trim()}`,
      concepto: String(b.concepto || 'Alquileres impagos').trim(),
      propiedadId,
      unidadId,
      alquilerId: b.alquilerId || null,
      deudorNombre: String(b.deudorNombre).trim(),
      deudorCI: String(b.deudorCI || '').trim(),
      deudorTelefono: String(b.deudorTelefono || '').trim(),
      deudorDomicilio: String(b.deudorDomicilio || '').trim(),
      acreedorNombre: String(b.acreedorNombre || '').trim(),
      acreedorCI: String(b.acreedorCI || '').trim(),
      montoTotal: Number(b.montoTotal),
      tasaInteresMensual: b.tasaInteresMensual !== null && b.tasaInteresMensual !== '' && b.tasaInteresMensual !== undefined ? Number(b.tasaInteresMensual) : null,
      fechaAcuerdo: b.fechaAcuerdo || new Date().toISOString().slice(0, 10),
      lugar: String(b.lugar || '').trim(),
      garantia: String(b.garantia || '').trim(),
      cuotas,
      documentoUrl: b.documentoUrl || null,
      notas: String(b.notas || '').trim(),
      estado: 'vigente',
      espacio: esp.id,
      creadoPor: chequeo.usuario.uid,
      creadoPorNombre: chequeo.perfil.nombre,
      creadoEn: new Date().toISOString(),
    }
    const ref = await db.collection('deudas').add(doc)
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/deudas', err)
    return NextResponse.json({ error: err?.message || 'No se pudo registrar la deuda.' }, { status: 500 })
  }
}
