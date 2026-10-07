import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { sanearCuotas } from '@/lib/deudas'
import { espacioDe, docDelEspacio } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

const CAMPOS_TEXTO = [
  'titulo', 'concepto', 'propiedadId', 'unidadId', 'alquilerId', 'deudorNombre', 'deudorCI', 'deudorTelefono',
  'deudorDomicilio', 'acreedorNombre', 'acreedorCI', 'fechaAcuerdo', 'lugar', 'garantia', 'documentoUrl', 'notas',
]

// PATCH — editar datos, estado o el cronograma de cuotas. Las cuotas
// ya cobradas se conservan tal cual (con su movimiento), aunque el
// cronograma nuevo las omita: no se puede "perder" un cobro editando.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  if (!(await docDelEspacio('deudas', params.id, esp))) return NextResponse.json({ error: 'No se encontró (o es de otro espacio).' }, { status: 404 })
  try {
    const b = await req.json()
    const ref = getDb().collection('deudas').doc(params.id)
    const actual = await ref.get()
    if (!actual.exists) return NextResponse.json({ error: 'Esa deuda no existe.' }, { status: 404 })

    const cambios: Record<string, unknown> = {}
    for (const c of CAMPOS_TEXTO) if (b[c] !== undefined) cambios[c] = b[c]
    if (b.montoTotal !== undefined) cambios.montoTotal = Number(b.montoTotal)
    if (b.tasaInteresMensual !== undefined) cambios.tasaInteresMensual = b.tasaInteresMensual === null || b.tasaInteresMensual === '' ? null : Number(b.tasaInteresMensual)
    if (b.estado && ['vigente', 'cancelada', 'incumplida', 'anulada'].includes(b.estado)) cambios.estado = b.estado
    if (b.cuotas !== undefined) {
      const nuevas = sanearCuotas(b.cuotas).map((c) => ({ ...c, pagada: false, montoPagado: null, pagadaEn: null, movimientoId: null }))
      const cobradas = ((actual.data()!.cuotas || []) as any[]).filter((c) => c.pagada)
      // Una cuota nueva que coincide en vencimiento con una cobrada se
      // reemplaza por la cobrada.
      const porVence = new Map(cobradas.map((c) => [c.vence, c]))
      const fusion = nuevas.map((c) => porVence.get(c.vence) || c)
      for (const c of cobradas) if (!fusion.some((x) => x.vence === c.vence)) fusion.push(c)
      cambios.cuotas = sanearCuotas(fusion)
    }
    cambios.actualizadoEn = new Date().toISOString()
    await ref.set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PATCH /api/deudas/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar la deuda.' }, { status: 500 })
  }
}

// DELETE — borra el plan. Los ingresos ya cobrados quedan en el flujo
// de caja salvo que se pida ?conMovimientos=1.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  if (!(await docDelEspacio('deudas', params.id, esp))) return NextResponse.json({ error: 'No se encontró (o es de otro espacio).' }, { status: 404 })
  const db = getDb()
  const ref = db.collection('deudas').doc(params.id)
  const doc = await ref.get()
  if (!doc.exists) return NextResponse.json({ ok: true })
  if (req.nextUrl.searchParams.get('conMovimientos') === '1') {
    for (const c of (doc.data()!.cuotas || []) as any[]) {
      if (c.movimientoId) await db.collection('movimientos').doc(c.movimientoId).delete()
    }
  }
  await ref.delete()
  return NextResponse.json({ ok: true })
}
