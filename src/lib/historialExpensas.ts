// Historial de expensas (o de cualquier gasto por pagar recurrente) mes
// a mes por unidad: cuánto fue la expensa del mes, cuánto se pagó de
// interés por mora y de recargo por pagar en el 2.º vencimiento, y cómo
// viene subiendo. Código puro, a partir de los "pendientes".

import { redondear } from './esquemaPago'
import { ordenarVencimientos } from './pendientes'

export type FilaHistorial = {
  id: string
  periodo: string // YYYY-MM
  titulo: string
  liquidacion: number // total a pagar al 1.º vencimiento
  expensaDelMes: number // sin mora ni saldo anterior
  mora: number // interés por mora incluido en la liquidación
  saldoAnterior: number
  pagado: number | null
  fechaPago: string | null
  vencimientoNumero: number | null
  recargo: number // lo pagado de más por no pagar al 1.º vencimiento
  estado: string
  variacion: number | null // % de la expensa del mes contra el mes anterior
}

export type ResumenHistorial = {
  filas: FilaHistorial[]
  promedio6: number
  ultima: FilaHistorial | null
  variacion3: number | null // % últimos 3 meses (último vs 3 antes)
  variacion12: number | null // % interanual
  moraAnio: number
  recargosAnio: number
  costoEvitableAnio: number // mora + recargos del año
  pagadasATiempo: number
  pagadasConRecargo: number
}

export type GrupoHistorial = { clave: string; propiedadId: string | null; unidadId: string | null; categoria: string; cantidad: number }

const claveDe = (p: any) => `${p.categoria || 'Expensas'}|${p.unidadId || p.propiedadId || 'general'}`

// Qué historiales hay (uno por categoría + unidad) para elegir.
export function gruposDeHistorial(pendientes: any[]): GrupoHistorial[] {
  const mapa = new Map<string, GrupoHistorial>()
  for (const p of pendientes) {
    if (p.estado === 'anulado' || !p.periodo) continue
    const k = claveDe(p)
    const g = mapa.get(k) || { clave: k, propiedadId: p.propiedadId || null, unidadId: p.unidadId || null, categoria: p.categoria || 'Expensas', cantidad: 0 }
    g.cantidad++
    mapa.set(k, g)
  }
  return Array.from(mapa.values()).sort((a, b) => b.cantidad - a.cantidad)
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null)

export function armarHistorial(pendientes: any[], clave: string, anio = new Date().toISOString().slice(0, 4)): ResumenHistorial {
  const filas: FilaHistorial[] = pendientes
    .filter((p) => p.estado !== 'anulado' && p.periodo && claveDe(p) === clave)
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((p) => {
      const vs = ordenarVencimientos(p.vencimientos || [])
      const liquidacion = vs[0]?.monto || 0
      const mora = Number(p.interesMora) || 0
      const saldoAnterior = (p.conceptos || []).filter((c: any) => /saldo anterior/i.test(c.concepto)).reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0)
      const pagado = p.estado === 'pagado' && p.pago ? Number(p.pago.monto) : null
      return {
        id: p.id,
        periodo: p.periodo,
        titulo: p.titulo,
        liquidacion,
        expensaDelMes: redondear(liquidacion - mora - saldoAnterior),
        mora,
        saldoAnterior,
        pagado,
        fechaPago: p.pago?.fecha || null,
        vencimientoNumero: p.pago?.vencimientoNumero ?? null,
        recargo: pagado !== null ? redondear(Math.max(0, pagado - liquidacion)) : 0,
        estado: p.estado,
        variacion: null,
      }
    })
  filas.forEach((f, i) => (f.variacion = i > 0 ? pct(f.expensaDelMes, filas[i - 1].expensaDelMes) : null))

  const ult = filas[filas.length - 1] || null
  const ultimas6 = filas.slice(-6)
  const delAnio = filas.filter((f) => f.periodo.startsWith(anio))
  const hace = (n: number) => (ult ? filas.find((f) => f.periodo === restarMeses(ult.periodo, n)) : undefined)
  const f3 = hace(3)
  const f12 = hace(12)
  const moraAnio = redondear(delAnio.reduce((s, f) => s + f.mora, 0))
  const recargosAnio = redondear(delAnio.reduce((s, f) => s + f.recargo, 0))
  const pagadas = filas.filter((f) => f.pagado !== null)

  return {
    filas,
    promedio6: ultimas6.length ? redondear(ultimas6.reduce((s, f) => s + f.expensaDelMes, 0) / ultimas6.length) : 0,
    ultima: ult,
    variacion3: ult && f3 ? pct(ult.expensaDelMes, f3.expensaDelMes) : null,
    variacion12: ult && f12 ? pct(ult.expensaDelMes, f12.expensaDelMes) : null,
    moraAnio,
    recargosAnio,
    costoEvitableAnio: redondear(moraAnio + recargosAnio),
    pagadasATiempo: pagadas.filter((f) => f.vencimientoNumero === 1).length,
    pagadasConRecargo: pagadas.filter((f) => f.vencimientoNumero !== 1).length,
  }
}

function restarMeses(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  const t = a * 12 + (m - 1) - n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
