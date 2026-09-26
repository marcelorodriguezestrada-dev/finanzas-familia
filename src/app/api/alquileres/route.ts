import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { detectarVariacion } from '@/data/inmuebles'
import { normalizarEsquema } from '@/lib/esquemaPago'

export const dynamic = 'force-dynamic'

// GET ?unidadId=&propiedadId=&estado=activo
// Trae los alquileres. Sin filtro de estado devuelve TODO el histórico
// (los finalizados también) — es el "archivo" de quién alquiló qué y a
// cuánto, que es media la gracia de tener esto cargado.
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { searchParams } = req.nextUrl
    const db = getDb()
    let query = db.collection('alquileres') as FirebaseFirestore.Query

    const unidadId = searchParams.get('unidadId')
    const propiedadId = searchParams.get('propiedadId')
    const estado = searchParams.get('estado')
    if (unidadId) query = query.where('unidadId', '==', unidadId)
    else if (propiedadId) query = query.where('propiedadId', '==', propiedadId)
    if (estado) query = query.where('estado', '==', estado)

    const snap = await query.get()
    const alquileres = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[]
    // Más nuevo primero. Igual que en unidades, ordenamos en memoria
    // para no depender de índices compuestos de Firestore.
    alquileres.sort((a, b) => (b.fechaInicio || '').localeCompare(a.fechaInicio || ''))
    return NextResponse.json({ alquileres })
  } catch (err: any) {
    console.error('GET /api/alquileres', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer los alquileres.' }, { status: 500 })
  }
}

// POST — asignar un alquiler a una unidad.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const {
      unidadId, inquilinoNombre, inquilinoCI, inquilinoTelefono, inquilinoDireccionAnterior,
      montoMensual, anticipo, diaCobro, fechaInicio, fechaFin,
      administradorUid, administradorNombre, contratoUrl, esquemaPago,
    } = body

    if (!unidadId || !inquilinoNombre || !inquilinoCI) {
      return NextResponse.json({ error: 'Faltan datos del inquilino (nombre y C.I.).' }, { status: 400 })
    }
    if (!montoMensual || Number(montoMensual) <= 0) {
      return NextResponse.json({ error: 'Cargá el monto mensual acordado.' }, { status: 400 })
    }
    if (!fechaInicio) {
      return NextResponse.json({ error: 'Cargá la fecha de inicio del alquiler.' }, { status: 400 })
    }
    if (!administradorUid) {
      return NextResponse.json({ error: 'Indicá quién de la familia administra este espacio.' }, { status: 400 })
    }
    // El contrato firmado ya no es obligatorio para registrar el
    // alquiler (se puede subir después): el formulario lo avisa así,
    // y la API ahora es coherente con eso.

    const db = getDb()
    const unidadDoc = await db.collection('unidades').doc(unidadId).get()
    if (!unidadDoc.exists) return NextResponse.json({ error: 'Esa unidad no existe.' }, { status: 404 })
    const unidad = unidadDoc.data()!

    // No dejamos dos alquileres activos sobre la misma unidad — si hay
    // uno vigente, primero hay que finalizarlo (queda en el histórico).
    const activo = await db.collection('alquileres')
      .where('unidadId', '==', unidadId)
      .where('estado', '==', 'activo')
      .limit(1)
      .get()
    if (!activo.empty) {
      return NextResponse.json({ error: 'Esta unidad ya tiene un alquiler activo. Finalizalo antes de cargar uno nuevo.' }, { status: 409 })
    }

    // Esquema de pago (canon fijo o escalonado). El montoMensual que
    // se guarda es el del PRIMER tramo, para que todo lo que ya usaba
    // ese campo siga funcionando; el monto real de cada mes sale del
    // esquema (ver cuotaDelMes en src/lib/esquemaPago.ts).
    const esquema = normalizarEsquema(esquemaPago, Number(montoMensual))
    const monto = esquema ? esquema.tramos[0].monto : Number(montoMensual)
    const variacion = detectarVariacion(monto, Number(unidad.canonEstandar || 0))

    const ref = await db.collection('alquileres').add({
      propiedadId: unidad.propiedadId,
      unidadId,
      inquilinoNombre: String(inquilinoNombre).trim(),
      inquilinoCI: String(inquilinoCI).trim(),
      inquilinoTelefono: inquilinoTelefono || '',
      inquilinoDireccionAnterior: inquilinoDireccionAnterior || '',
      montoMensual: monto,
      esquemaPago: esquema,
      anticipo: anticipo ? Number(anticipo) : null,
      diaCobro: diaCobro ? Number(diaCobro) : 1,
      fechaInicio,
      fechaFin: fechaFin || null,
      administradorUid,
      administradorNombre: administradorNombre || '',
      contratoUrl: contratoUrl || null,
      contratoSubidoEn: contratoUrl ? new Date().toISOString() : null,
      // Dejamos guardada la variación detectada al momento de firmar —
      // sirve después para explicar por qué esta unidad rinde distinto
      // a su canon en el dashboard, sin tener que recalcularlo.
      variacionCanon: variacion ? { ...variacion, canonEstandar: Number(unidad.canonEstandar || 0) } : null,
      estado: 'activo',
      creadoPor: chequeo.usuario.uid,
      creadoEn: new Date().toISOString(),
    })

    // La unidad pasa a "alquilada" sola, para que el inventario no
    // quede desactualizado por olvido.
    await db.collection('unidades').doc(unidadId).set({ estado: 'alquilada' }, { merge: true })

    return NextResponse.json({ id: ref.id, variacion }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/alquileres', err)
    return NextResponse.json({ error: err?.message || 'No se pudo registrar el alquiler.' }, { status: 500 })
  }
}
