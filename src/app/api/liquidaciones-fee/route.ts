import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { FEE_ADMINISTRACION, calcularFee } from '@/data/inmuebles'

export const dynamic = 'force-dynamic'

// GET ?anio=2026 — liquidaciones ya calculadas/guardadas. Sin filtro,
// devuelve todo el histórico de liquidaciones (para ver años previos).
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const anio = req.nextUrl.searchParams.get('anio')
    const db = getDb()
    let query = db.collection('liquidacionesFee') as FirebaseFirestore.Query
    if (anio) query = query.where('anio', '==', Number(anio))
    const snap = await query.get()
    const liquidaciones = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[]
    liquidaciones.sort((a, b) => b.anio - a.anio)
    return NextResponse.json({ liquidaciones, porcentaje: FEE_ADMINISTRACION })
  } catch (err: any) {
    console.error('GET /api/liquidaciones-fee', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer las liquidaciones.' }, { status: 500 })
  }
}

// POST { anio } — calcula, para ese año, cuánto administró cada
// persona de la familia (suma de los alquileres cobrados de los
// espacios que administra) y genera una liquidación del 5% por
// administrador. Pensado para correr una vez al año en la reunión
// familiar de evaluación, como pidió Marcelo — por eso el cálculo
// arma un registro cerrado por año y no se recalcula solo.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { anio } = await req.json()
    if (!anio) return NextResponse.json({ error: 'Falta el año a liquidar.' }, { status: 400 })

    const db = getDb()

    // Ya existe una liquidación para este año — no se recalcula
    // encima, para no duplicar ni perder ajustes manuales ya hechos.
    const existente = await db.collection('liquidacionesFee').where('anio', '==', Number(anio)).limit(1).get()
    if (!existente.empty) {
      return NextResponse.json({ error: `Ya existe una liquidación para el año ${anio}.` }, { status: 409 })
    }

    // Traemos todos los ingresos de "Alquiler" cobrados ese año y los
    // agrupamos por quién administraba la unidad al momento de crear
    // el alquiler (administradorUid guardado en cada alquiler).
    const desde = `${anio}-01-01`
    const hasta = `${anio}-12-31`
    const movSnap = await db.collection('movimientos')
      .where('tipo', '==', 'ingreso')
      .where('categoria', '==', 'Alquiler')
      .where('fecha', '>=', desde)
      .where('fecha', '<=', hasta)
      .get()
    const ingresosAlquiler = movSnap.docs.map((d) => d.data()) as any[]

    // Traemos todos los alquileres para poder cruzar propiedadId/unidadId → administrador.
    const alqSnap = await db.collection('alquileres').get()
    const alquileres = alqSnap.docs.map((d) => d.data()) as any[]
    const administradorPorUnidad = new Map<string, { uid: string; nombre: string }>()
    for (const a of alquileres) {
      administradorPorUnidad.set(a.unidadId, { uid: a.administradorUid, nombre: a.administradorNombre })
    }
    const unidadesSnap = await db.collection('unidades').get()
    const propiedadDeUnidad = new Map<string, string>()
    for (const u of unidadesSnap.docs) propiedadDeUnidad.set(u.id, (u.data() as any).propiedadId)

    const totalPorAdministrador = new Map<string, { nombre: string; total: number }>()
    for (const mov of ingresosAlquiler) {
      // El movimiento de "cobrar alquiler" guarda propiedadId. Buscamos
      // qué unidad de esa propiedad tiene administrador asignado (caso
      // simple: una unidad activa por propiedad al momento del cobro).
      let admin: { uid: string; nombre: string } | undefined
      for (const [unidadId, prop] of propiedadDeUnidad.entries()) {
        if (prop === mov.propiedadId && administradorPorUnidad.has(unidadId)) {
          admin = administradorPorUnidad.get(unidadId)
          break
        }
      }
      if (!admin || !admin.uid) continue
      const actual = totalPorAdministrador.get(admin.uid) || { nombre: admin.nombre, total: 0 }
      actual.total += Number(mov.monto || 0)
      totalPorAdministrador.set(admin.uid, actual)
    }

    if (totalPorAdministrador.size === 0) {
      return NextResponse.json({ error: 'No se encontraron cobros de alquiler asociados a un administrador en ese año.' }, { status: 404 })
    }

    const creadas: any[] = []
    for (const [uid, { nombre, total }] of totalPorAdministrador.entries()) {
      const fee = calcularFee(total)
      const ref = await db.collection('liquidacionesFee').add({
        anio: Number(anio),
        administradorUid: uid,
        administradorNombre: nombre,
        totalAdministrado: total,
        fee,
        pagada: false,
        pagadaEn: null,
        notas: '',
        calculadaEn: new Date().toISOString(),
        calculadaPor: chequeo.usuario.uid,
      })
      creadas.push({ id: ref.id, anio: Number(anio), administradorNombre: nombre, totalAdministrado: total, fee })
    }

    return NextResponse.json({ liquidaciones: creadas }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/liquidaciones-fee', err)
    return NextResponse.json({ error: err?.message || 'No se pudo calcular la liquidación.' }, { status: 500 })
  }
}
