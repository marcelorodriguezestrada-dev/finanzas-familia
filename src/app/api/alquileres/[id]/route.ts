import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { normalizarEsquema } from '@/lib/esquemaPago'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const db = getDb()
    const cambios: Record<string, unknown> = {}
    for (const campo of [
      'inquilinoNombre', 'inquilinoCI', 'inquilinoTelefono', 'inquilinoDireccionAnterior',
      'diaCobro', 'fechaFin', 'administradorUid', 'administradorNombre', 'contratoUrl',
    ]) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.montoMensual !== undefined) cambios.montoMensual = Number(body.montoMensual)
    if (body.esquemaPago !== undefined) {
      const esquema = normalizarEsquema(body.esquemaPago, Number(body.montoMensual) || undefined)
      cambios.esquemaPago = esquema
      if (esquema) cambios.montoMensual = esquema.tramos[0].monto
    }
    if (body.contratoUrl) cambios.contratoSubidoEn = new Date().toISOString()
    if (body.anticipo !== undefined) cambios.anticipo = body.anticipo ? Number(body.anticipo) : null

    // Finalizar o rescindir un alquiler libera la unidad para que se
    // pueda volver a alquilar sin quedar marcada como ocupada.
    if (body.estado === 'finalizado' || body.estado === 'rescindido') {
      cambios.estado = body.estado
      cambios.fechaFin = body.fechaFin || new Date().toISOString().slice(0, 10)
      const doc = await db.collection('alquileres').doc(params.id).get()
      if (doc.exists) {
        const unidadId = doc.data()!.unidadId
        await db.collection('unidades').doc(unidadId).set({ estado: 'disponible' }, { merge: true })
      }
    }

    await db.collection('alquileres').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PATCH /api/alquileres/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar el alquiler.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  await getDb().collection('alquileres').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
