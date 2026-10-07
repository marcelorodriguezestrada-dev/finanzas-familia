import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, docDelEspacio } from '@/lib/espacioServidor'
import { ESPACIO_FAMILIA, MONEDA_FAMILIA, MONEDA_PERSONAL_POR_DEFECTO, espacioPersonal, espacioDeDoc, simboloDe } from '@/lib/monedas'

export const dynamic = 'force-dynamic'

// POST { tipo: 'movimiento' | 'propiedad', id, montoConvertido? }
// Pasa un registro del espacio activo al otro: de Familia a Mis
// finanzas (del usuario logueado) o de Mis finanzas a Familia.
//
// Reglas:
// - De Familia a lo personal solo se puede pasar lo que cargó uno mismo
//   (no se puede "esconder" algo que cargó otro miembro).
// - Lo que nace de un cobro de alquiler, una cuota de deuda o un gasto
//   por pagar no se mueve suelto (rompería esos vínculos).
// - Si las monedas de los espacios son distintas (Bs y $), un movimiento
//   pide el monto convertido; nunca se mezclan monedas.
// - Una propiedad se mueve con sus unidades, reparaciones, gastos por
//   pagar y movimientos; no se puede si tiene alquileres o deudas.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  const uid = chequeo.usuario.uid
  const destino = esp.tipo === 'familia' ? espacioPersonal(uid) : ESPACIO_FAMILIA
  const monedaDestino = esp.tipo === 'familia' ? (chequeo.perfil as any).monedaPersonal || MONEDA_PERSONAL_POR_DEFECTO : MONEDA_FAMILIA
  const nombreDestino = esp.tipo === 'familia' ? 'Mis finanzas' : 'Familia'

  try {
    const { tipo, id, montoConvertido } = await req.json()
    const db = getDb()

    if (tipo === 'movimiento') {
      const doc = await docDelEspacio('movimientos', id, esp)
      if (!doc) return NextResponse.json({ error: 'No se encontró el movimiento.' }, { status: 404 })
      const m = doc.data()!
      if (esp.tipo === 'familia' && m.registradoPor && m.registradoPor !== uid) {
        return NextResponse.json({ error: 'Solo podés pasar a Mis finanzas los movimientos que cargaste vos.' }, { status: 403 })
      }
      if (m.alquilerId || m.deudaId || m.pendienteId) {
        return NextResponse.json({ error: 'Este movimiento viene de un cobro de alquiler, una cuota de deuda o un gasto por pagar, y no se puede mover suelto.' }, { status: 400 })
      }
      const monedaOrigen = m.moneda || esp.moneda
      const cambios: Record<string, unknown> = { espacio: destino, moneda: monedaDestino, movidoEn: new Date().toISOString() }
      if (monedaOrigen !== monedaDestino) {
        if (!(Number(montoConvertido) > 0)) {
          return NextResponse.json(
            {
              error: `Este movimiento está en ${simboloDe(monedaOrigen)} y ${nombreDestino} usa ${simboloDe(monedaDestino)}.`,
              necesitaConversion: true,
              monedaOrigen,
              monedaDestino,
              monto: m.monto,
            },
            { status: 409 }
          )
        }
        cambios.monto = Number(montoConvertido)
        cambios.montoOriginal = m.monto
        cambios.monedaOriginal = monedaOrigen
      }
      // La propiedad asociada solo se conserva si también está en el destino.
      if (m.propiedadId) {
        const prop = await db.collection('propiedades').doc(m.propiedadId).get()
        if (!prop.exists || espacioDeDoc(prop.data()) !== destino) {
          cambios.propiedadId = null
          cambios.unidadId = null
        }
      }
      await doc.ref.set(cambios, { merge: true })
      return NextResponse.json({ ok: true, destino: nombreDestino })
    }

    if (tipo === 'propiedad') {
      const doc = await docDelEspacio('propiedades', id, esp)
      if (!doc) return NextResponse.json({ error: 'No se encontró la propiedad.' }, { status: 404 })
      const p = doc.data()!
      if (esp.tipo === 'familia' && p.creadoPor && p.creadoPor !== uid) {
        return NextResponse.json({ error: 'Solo podés pasar a Mis finanzas una propiedad que cargaste vos.' }, { status: 403 })
      }
      const [alq, deu] = await Promise.all([
        db.collection('alquileres').where('propiedadId', '==', id).limit(1).get(),
        db.collection('deudas').where('propiedadId', '==', id).limit(1).get(),
      ])
      if (!alq.empty || !deu.empty) {
        return NextResponse.json({ error: 'Esta propiedad tiene alquileres o deudas cargados, así que no se puede mover.' }, { status: 400 })
      }
      const [unis, reps, pens, movs] = await Promise.all(
        ['unidades', 'reparaciones', 'pendientes', 'movimientos'].map((c) => db.collection(c).where('propiedadId', '==', id).get())
      )
      const conMonto = [...pens.docs, ...movs.docs].filter((d) => (d.data().moneda || esp.moneda) !== monedaDestino)
      if (conMonto.length) {
        return NextResponse.json(
          {
            error: `Esta propiedad tiene ${conMonto.length} movimiento(s) o gasto(s) por pagar en ${simboloDe(esp.moneda)} y ${nombreDestino} usa ${simboloDe(monedaDestino)}. Movelos primero de a uno (con su conversión) o borralos, y después mové la propiedad.`,
          },
          { status: 409 }
        )
      }
      const todos = [doc, ...unis.docs, ...reps.docs, ...pens.docs, ...movs.docs]
      const ahora = new Date().toISOString()
      for (let i = 0; i < todos.length; i += 450) {
        const batch = db.batch()
        for (const d of todos.slice(i, i + 450)) batch.set(d.ref, { espacio: destino, movidoEn: ahora }, { merge: true })
        await batch.commit()
      }
      return NextResponse.json({ ok: true, destino: nombreDestino, movidos: todos.length })
    }

    return NextResponse.json({ error: 'Tipo no soportado.' }, { status: 400 })
  } catch (err: any) {
    console.error('POST /api/mover-espacio', err)
    return NextResponse.json({ error: err?.message || 'No se pudo mover.' }, { status: 500 })
  }
}
