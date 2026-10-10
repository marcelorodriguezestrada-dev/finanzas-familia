// Alertas de cobro parcial: cuando un inquilino paga menos de lo que
// corresponde en un mes, queda una alerta para tratar en la reunión
// familiar. Hay UNA por alquiler y mes (id fijo), y se recalcula cada
// vez que se registra o se borra un cobro de ese mes:
//   - si se completó el pago -> 'saldada'
//   - si ya no queda ningún pago -> 'anulada'
//   - si no -> sigue abierta (o en reunión / resuelta) con los montos al día

import { getDb } from './firebaseAdmin'
import { cuotaDelMes, redondear, etiquetaMes } from './esquemaPago'
import { mesDeCobro, esCobroDeAlquiler } from './cobros'

export const idAlertaCobro = (alquilerId: string, mes: string) => `cobro__${alquilerId}__${mes}`

export async function recalcularAlertaCobro(alquilerId: string, mes: string, extra?: { explicacion?: any; crear?: boolean }) {
  const db = getDb()
  const ref = db.collection('alertas').doc(idAlertaCobro(alquilerId, mes))
  const [alqDoc, alerta, movs] = await Promise.all([
    db.collection('alquileres').doc(alquilerId).get(),
    ref.get(),
    db.collection('movimientos').where('alquilerId', '==', alquilerId).get(),
  ])
  if (!alqDoc.exists) return
  const a = { id: alqDoc.id, ...alqDoc.data() } as any
  const cuota = cuotaDelMes(a, mes)
  if (!cuota) return
  const pagos = movs.docs.map((d) => ({ id: d.id, ...d.data() }) as any).filter((m) => esCobroDeAlquiler(m, alquilerId) && mesDeCobro(m) === mes)
  const pagado = redondear(pagos.reduce((s, m) => s + Number(m.monto || 0), 0))
  const faltante = redondear(Math.max(0, cuota.monto - pagado))

  if (!alerta.exists && !extra?.crear) return

  const previo = alerta.exists ? alerta.data()! : {}
  let estado: string = previo.estado || 'abierta'
  if (faltante <= 0.009) estado = 'saldada'
  else if (pagado <= 0.009) estado = 'anulada'
  else if (estado === 'saldada' || estado === 'anulada') estado = 'abierta'

  const lugar = await (async () => {
    const [p, u] = await Promise.all([
      a.propiedadId ? db.collection('propiedades').doc(a.propiedadId).get() : null,
      a.unidadId ? db.collection('unidades').doc(a.unidadId).get() : null,
    ])
    return [p?.data()?.nombre, u?.data()?.nombre].filter(Boolean).join(' — ')
  })()

  const ahora = new Date().toISOString()
  const datos: Record<string, any> = {
    tipo: 'cobro_parcial',
    espacio: a.espacio || 'familia',
    alquilerId,
    mes,
    etiquetaMes: etiquetaMes(mes),
    inquilinoNombre: a.inquilinoNombre || '',
    inquilinoTelefono: a.inquilinoTelefono || '',
    propiedadId: a.propiedadId || null,
    unidadId: a.unidadId || null,
    lugar,
    administradorNombre: a.administradorNombre || '',
    esperado: cuota.monto,
    pagado,
    faltante,
    vence: cuota.vence,
    estado,
    actualizadoEn: ahora,
  }
  if (!alerta.exists) datos.creadoEn = ahora
  if (estado === 'saldada' && previo.estado !== 'saldada') datos.saldadaEn = ahora
  const explicaciones = Array.isArray(previo.explicaciones) ? [...previo.explicaciones] : []
  if (extra?.explicacion) explicaciones.push(extra.explicacion)
  datos.explicaciones = explicaciones
  await ref.set(datos, { merge: true })
}
