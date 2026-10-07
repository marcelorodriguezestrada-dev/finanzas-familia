import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, enEspacio, docDelEspacio } from '@/lib/espacioServidor'
import { sanearVencimientos, sanearConceptos } from '@/lib/pendientes'

export const dynamic = 'force-dynamic'

// GET — gastos por pagar del espacio activo (pendientes y pagados).
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  try {
    const snap = await getDb().collection('pendientes').get()
    const pendientes = enEspacio(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[], esp)
    pendientes.sort((a, b) => (b.periodo || b.creadoEn || '').localeCompare(a.periodo || a.creadoEn || ''))
    return NextResponse.json({ pendientes })
  } catch (err: any) {
    console.error('GET /api/pendientes', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer los gastos por pagar.' }, { status: 500 })
  }
}

// POST — registra un gasto por pagar (a mano o desde un PDF leído con
// /api/pendientes/importar).
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  try {
    const b = await req.json()
    const vencimientos = sanearVencimientos(b.vencimientos)
    if (!String(b.titulo || '').trim()) return NextResponse.json({ error: 'Poné un título (ej. "Expensas 9/2026 — 7-B").' }, { status: 400 })
    if (!vencimientos.length) return NextResponse.json({ error: 'Cargá al menos un vencimiento con fecha y monto.' }, { status: 400 })
    if (b.propiedadId && !(await docDelEspacio('propiedades', b.propiedadId, esp))) {
      return NextResponse.json({ error: 'Esa propiedad no es de este espacio.' }, { status: 400 })
    }
    if (b.unidadId && !(await docDelEspacio('unidades', b.unidadId, esp))) {
      return NextResponse.json({ error: 'Esa unidad no es de este espacio.' }, { status: 400 })
    }

    const db = getDb()
    // Evita cargar dos veces la misma liquidación (mismo período y unidad).
    if (b.periodo && (b.unidadId || b.propiedadId)) {
      const previos = enEspacio((await db.collection('pendientes').where('periodo', '==', b.periodo).get()).docs.map((d) => d.data()), esp)
      const repetido = previos.find(
        (p: any) => p.estado !== 'anulado' && p.categoria === (b.categoria || 'Expensas') && (p.unidadId || null) === (b.unidadId || null) && (p.propiedadId || null) === (b.propiedadId || null)
      )
      if (repetido) return NextResponse.json({ error: `Ya está cargado "${repetido.titulo}" para ese período.` }, { status: 409 })
    }

    const ref = await db.collection('pendientes').add({
      espacio: esp.id,
      moneda: esp.moneda,
      titulo: String(b.titulo).trim().slice(0, 140),
      categoria: String(b.categoria || 'Expensas'),
      proveedor: String(b.proveedor || '').trim().slice(0, 140),
      periodo: /^\d{4}-\d{2}$/.test(b.periodo || '') ? b.periodo : null,
      propiedadId: b.propiedadId || null,
      unidadId: b.unidadId || null,
      vencimientos,
      conceptos: sanearConceptos(b.conceptos),
      pagoProveedor: {
        titular: String(b.pagoProveedor?.titular || '').slice(0, 120),
        banco: String(b.pagoProveedor?.banco || '').slice(0, 80),
        cbu: String(b.pagoProveedor?.cbu || '').replace(/\D/g, '').slice(0, 22),
        alias: String(b.pagoProveedor?.alias || '').slice(0, 60),
        cuenta: String(b.pagoProveedor?.cuenta || '').slice(0, 60),
      },
      interesMora: Number(b.interesMora) || 0,
      documentoUrl: b.documentoUrl || null,
      notas: String(b.notas || '').slice(0, 1000),
      // historico: liquidación vieja que ya se pagó y se carga solo para
      // armar el historial (no crea gasto en movimientos).
      estado: b.historico ? 'pagado' : 'pendiente',
      pago: b.historico ? { fecha: vencimientos[0].fecha, monto: vencimientos[0].monto, movimientoId: null, vencimientoNumero: 1, historico: true } : null,
      creadoPor: chequeo.usuario.uid,
      creadoPorNombre: chequeo.perfil.nombre,
      creadoEn: new Date().toISOString(),
    })
    return NextResponse.json({ id: ref.id }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/pendientes', err)
    return NextResponse.json({ error: err?.message || 'No se pudo guardar.' }, { status: 500 })
  }
}
