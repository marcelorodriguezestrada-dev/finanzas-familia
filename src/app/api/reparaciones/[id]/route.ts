import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// PATCH — actualizar datos, o marcar como resuelta. Si al resolverla
// se manda montoGasto, se crea automáticamente el movimiento de gasto
// "Mantenimiento de propiedades" y se enlaza acá — así el dashboard
// puede cruzar "cuánto costó mantener esta unidad" sin cargarlo dos
// veces a mano. Esto es justo el caso de la hermana y el consultorio:
// cuando resuelve la reparación con comprobante, el gasto queda
// registrado y se descuenta solo en su análisis.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()
    const db = getDb()
    const cambios: Record<string, unknown> = {}
    for (const campo of ['detalle', 'prioridad', 'solicitadoPor']) {
      if (body[campo] !== undefined) cambios[campo] = body[campo]
    }
    if (body.costoEstimado !== undefined) cambios.costoEstimado = body.costoEstimado ? Number(body.costoEstimado) : null

    if (body.resuelta === true) {
      const doc = await db.collection('reparaciones').doc(params.id).get()
      if (!doc.exists) return NextResponse.json({ error: 'Esa reparación no existe.' }, { status: 404 })
      const reparacion = doc.data()!

      cambios.resuelta = true
      cambios.resueltaEn = new Date().toISOString()

      // Si viene con comprobante/monto, generamos el gasto asociado.
      if (body.montoGasto && Number(body.montoGasto) > 0) {
        const refGasto = await db.collection('movimientos').add({
          tipo: 'gasto',
          monto: Number(body.montoGasto),
          categoria: 'Mantenimiento de propiedades',
          descripcion: `Reparación: ${reparacion.detalle}`,
          fecha: new Date().toISOString().slice(0, 10),
          propiedadId: reparacion.propiedadId,
          comprobanteUrl: body.comprobanteUrl || null,
          registradoPor: chequeo.usuario.uid,
          registradoPorNombre: chequeo.perfil.nombre,
          creadoEn: new Date().toISOString(),
        })
        cambios.movimientoGastoId = refGasto.id
      }
    } else if (body.resuelta === false) {
      cambios.resuelta = false
      cambios.resueltaEn = null
    }

    await db.collection('reparaciones').doc(params.id).set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PATCH /api/reparaciones/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar la reparación.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  await getDb().collection('reparaciones').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
