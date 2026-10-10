// Estado de cuenta de un alquiler mes a mes: cuánto correspondía pagar
// en cada cuota (según el plan de pago), cuánto se pagó (incluidos los
// pagos parciales) y cuánto falta. Código puro: se usa en el servidor
// al registrar un cobro y en las pantallas (calendario, alquileres,
// formulario de cobro).

import { Cuota, generarCronograma, esquemaDeAlquiler, redondear } from './esquemaPago'
import { CATEGORIA_COBRO_DEUDA } from './deudas'

export const MORA_DIARIA_ALQUILER = 30

// Mes al que corresponde un cobro: el que se eligió al registrarlo
// (mesCuota) o, en cobros viejos, el mes de la fecha.
export function mesDeCobro(m: any): string {
  return m?.mesCuota || String(m?.fecha || '').slice(0, 7)
}

export function esCobroDeAlquiler(m: any, alquilerId: string) {
  return m?.alquilerId === alquilerId && m?.tipo === 'ingreso' && m?.categoria !== CATEGORIA_COBRO_DEUDA
}

export type EstadoCuota = Cuota & {
  pagado: number
  pendiente: number
  estado: 'pagada' | 'parcial' | 'impaga'
  vencida: boolean
  diasAtraso: number
  moraSugerida: number
  pagos: any[]
}

function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000)
}

export function estadoCuotas(alquiler: any, movimientos: any[], opts: { hasta?: string; hoy?: string } = {}): EstadoCuota[] {
  const hoy = opts.hoy || new Date().toISOString().slice(0, 10)
  const esquema = esquemaDeAlquiler(alquiler)
  if (!esquema || !alquiler?.fechaInicio) return []
  const hasta = opts.hasta || hoy.slice(0, 7)
  const cobros = movimientos.filter((m) => esCobroDeAlquiler(m, alquiler.id))
  return generarCronograma({ fechaInicio: alquiler.fechaInicio, fechaFin: alquiler.fechaFin || null, diaCobro: alquiler.diaCobro, esquema, proyectarHasta: hasta })
    .filter((c) => c.mes <= hasta)
    .map((c) => {
      const pagos = cobros.filter((m) => mesDeCobro(m) === c.mes)
      const pagado = redondear(pagos.reduce((s, m) => s + Number(m.monto || 0), 0))
      const pendiente = redondear(Math.max(0, c.monto - pagado))
      const vencida = pendiente > 0.009 && hoy > c.vence
      const diasAtraso = vencida ? diasEntre(c.vence, hoy) : 0
      return {
        ...c,
        pagado,
        pendiente,
        estado: pendiente <= 0.009 ? 'pagada' : pagado > 0 ? 'parcial' : 'impaga',
        vencida,
        diasAtraso,
        moraSugerida: diasAtraso * MORA_DIARIA_ALQUILER,
        pagos,
      } as EstadoCuota
    })
}

// Cuotas con algo pendiente hasta el mes siguiente al actual (para
// poder registrar un pago adelantado), de la más vieja a la más nueva.
export function cuotasPendientes(alquiler: any, movimientos: any[], hoy = new Date().toISOString().slice(0, 10)) {
  const [a, m] = hoy.slice(0, 7).split('-').map(Number)
  const t = a * 12 + m // mes siguiente
  const siguiente = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
  return estadoCuotas(alquiler, movimientos, { hasta: siguiente, hoy }).filter((c) => c.pendiente > 0.009)
}
