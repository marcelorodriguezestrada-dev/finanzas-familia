// Datos del panel de finanzas (dashboard). Código puro: agrupa los
// movimientos por mes y calcula ahorro, tasa de ahorro, gasto fijo vs
// variable, categorías que se dispararon, ingresos por fuente y la
// proyección de caja de los próximos días con lo que ya se sabe que
// entra (alquileres, cuotas de deudas) y sale (gastos por pagar).

import { redondear, etiquetaMes, generarCronograma, esquemaDeAlquiler, formatoBs, fechaCorta } from './esquemaPago'
import { vencimientoVigente } from './pendientes'
import { ordenarCuotas, CATEGORIA_COBRO_DEUDA } from './deudas'
import { estadoCuotas } from './cobros'

// Gastos que no dependen del día a día: llegan todos los meses.
export const CATEGORIAS_FIJAS = ['Expensas', 'Servicios (luz, agua, gas, internet)', 'Impuestos', 'Educación']

export type MesPanel = {
  mes: string
  etiqueta: string // "oct 26"
  ingresos: number
  gastos: number
  ahorro: number
  tasa: number | null // % de ahorro sobre ingresos
  acumulado: number // ahorro acumulado desde el primer mes de la serie
  fijos: number
  variables: number
  porCategoria: Record<string, number>
  porFuente: Record<string, number>
  enCurso: boolean
}

export type CategoriaMes = { categoria: string; monto: number; promedio: number; variacion: number | null; fija: boolean }
export type EventoCaja = { fecha: string; concepto: string; monto: number } // + entra, - sale
export type Insight = { tono: 'bueno' | 'malo' | 'neutro'; texto: string }

const MC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const corto = (m: string) => `${MC[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`
export function sumarMes(m: string, n: number) {
  const [a, mm] = m.split('-').map(Number)
  const t = a * 12 + (mm - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const promedio = (xs: number[]) => (xs.length ? redondear(xs.reduce((s, x) => s + x, 0) / xs.length) : 0)
const esFija = (m: any) => CATEGORIAS_FIJAS.includes(m.categoria) || !!m.pendienteId

export function armarPanel(
  d: { movimientos: any[]; pendientes?: any[]; alquileres?: any[]; deudas?: any[] },
  opts: { desde: string; hasta: string; mesFoco: string; hoy?: string; diasProyeccion?: number }
) {
  const hoy = opts.hoy || new Date().toISOString().slice(0, 10)
  const mesHoy = hoy.slice(0, 7)

  // ---- Serie mensual
  const serie: MesPanel[] = []
  let acumulado = 0
  for (let m = opts.desde; m <= opts.hasta; m = sumarMes(m, 1)) {
    const movs = d.movimientos.filter((x) => (x.fecha || '').startsWith(m))
    const ing = movs.filter((x) => x.tipo === 'ingreso')
    const gas = movs.filter((x) => x.tipo !== 'ingreso')
    const ingresos = redondear(ing.reduce((s, x) => s + Number(x.monto || 0), 0))
    const gastos = redondear(gas.reduce((s, x) => s + Number(x.monto || 0), 0))
    const ahorro = redondear(ingresos - gastos)
    acumulado = redondear(acumulado + ahorro)
    const porCategoria: Record<string, number> = {}
    for (const x of gas) porCategoria[x.categoria || 'Otro'] = redondear((porCategoria[x.categoria || 'Otro'] || 0) + Number(x.monto || 0))
    const porFuente: Record<string, number> = {}
    for (const x of ing) {
      const f = x.categoria === CATEGORIA_COBRO_DEUDA ? 'Cobro de deudas' : x.categoria || 'Otro'
      porFuente[f] = redondear((porFuente[f] || 0) + Number(x.monto || 0))
    }
    const fijos = redondear(gas.filter(esFija).reduce((s, x) => s + Number(x.monto || 0), 0))
    serie.push({
      mes: m, etiqueta: corto(m), ingresos, gastos, ahorro,
      tasa: ingresos > 0 ? Math.round((ahorro / ingresos) * 1000) / 10 : null,
      acumulado, fijos, variables: redondear(gastos - fijos), porCategoria, porFuente, enCurso: m === mesHoy,
    })
  }

  // Meses "completos" anteriores al foco (para comparar sin el mes en curso)
  const foco = serie.find((s) => s.mes === opts.mesFoco) || serie[serie.length - 1]
  const previos = serie.filter((s) => s.mes < (foco?.mes || '') && !s.enCurso && (s.ingresos || s.gastos))
  const ult3 = previos.slice(-3)
  const ult6 = previos.slice(-6)

  // ---- Categorías del mes foco contra su promedio de los 3 meses previos
  const cats = new Set<string>([...Object.keys(foco?.porCategoria || {}), ...ult3.flatMap((s) => Object.keys(s.porCategoria))])
  const categoriasMes: CategoriaMes[] = Array.from(cats)
    .map((c) => {
      const monto = foco?.porCategoria[c] || 0
      const prom = promedio(ult3.map((s) => s.porCategoria[c] || 0))
      return { categoria: c, monto, promedio: prom, variacion: prom > 0 ? Math.round(((monto - prom) / prom) * 100) : null, fija: CATEGORIAS_FIJAS.includes(c) }
    })
    .filter((c) => c.monto > 0 || c.promedio > 0)
    .sort((a, b) => b.monto - a.monto)

  // ---- Proyección de caja: hoy + lo que ya se sabe que entra y sale
  const dias = opts.diasProyeccion || 60
  const hasta = new Date(Date.parse(hoy + 'T00:00:00Z') + dias * 86400000).toISOString().slice(0, 10)
  const eventos: EventoCaja[] = []
  for (const p of d.pendientes || []) {
    if (p.estado !== 'pendiente') continue
    const v = vencimientoVigente(p, hoy)
    if (!v) continue
    const fecha = v.vencidoTodo ? hoy : v.vencimiento.fecha
    if (fecha <= hasta) eventos.push({ fecha, concepto: `${p.titulo}${v.vencidoTodo ? ' (vencido)' : ''}`, monto: -v.vencimiento.monto })
  }
  for (const a of d.alquileres || []) {
    if (a.estado !== 'activo' || !a.fechaInicio) continue
    // Lo que falta cobrar de cada cuota (descuenta pagos parciales).
    for (const c of estadoCuotas(a, d.movimientos, { hasta: hasta.slice(0, 7), hoy })) {
      if (c.mes < mesHoy || c.pendiente <= 0.009 || c.vence > hasta) continue
      eventos.push({
        fecha: c.vence < hoy ? hoy : c.vence,
        concepto: `Alquiler ${a.inquilinoNombre} (${etiquetaMes(c.mes).toLowerCase()}${c.estado === 'parcial' ? ', saldo' : ''})`,
        monto: c.pendiente,
      })
    }
  }
  for (const x of d.deudas || []) {
    if (x.estado !== 'vigente') continue
    for (const c of ordenarCuotas(x.cuotas || [])) {
      if (c.pagada || c.vence > hasta) continue
      eventos.push({ fecha: c.vence < hoy ? hoy : c.vence, concepto: `Cuota ${c.numero} deuda ${x.deudorNombre}`, monto: c.monto })
    }
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))
  const saldoHoy = redondear(d.movimientos.filter((m) => (m.fecha || '') <= hoy).reduce((s, m) => s + (m.tipo === 'ingreso' ? 1 : -1) * Number(m.monto || 0), 0))
  const proyeccion: { fecha: string; etiqueta: string; saldo: number }[] = [{ fecha: hoy, etiqueta: fechaCorta(hoy).slice(0, 5), saldo: saldoHoy }]
  let saldo = saldoHoy
  for (const e of eventos) {
    saldo = redondear(saldo + e.monto)
    proyeccion.push({ fecha: e.fecha, etiqueta: fechaCorta(e.fecha).slice(0, 5), saldo })
  }
  // Último punto: el fin del horizonte, para que la línea llegue hasta ahí.
  if (proyeccion[proyeccion.length - 1].fecha < hasta) proyeccion.push({ fecha: hasta, etiqueta: fechaCorta(hasta).slice(0, 5), saldo })
  const minimo = proyeccion.reduce((m, p) => (p.saldo < m.saldo ? p : m), proyeccion[0])

  // ---- Indicadores del mes foco
  const prom3Gastos = promedio(ult3.map((s) => s.gastos))
  const prom6Ahorro = promedio(ult6.map((s) => s.ahorro))
  const conDatos = serie.filter((s) => s.ingresos || s.gastos)
  const mejor = conDatos.filter((s) => !s.enCurso).reduce<MesPanel | null>((m, s) => (!m || s.ahorro > m.ahorro ? s : m), null)
  const peor = conDatos.filter((s) => !s.enCurso).reduce<MesPanel | null>((m, s) => (!m || s.ahorro < m.ahorro ? s : m), null)
  const mesesPositivos = conDatos.filter((s) => !s.enCurso && s.ahorro > 0).length
  const mesesCerrados = conDatos.filter((s) => !s.enCurso).length

  // ---- Lo que hay que saber (frases automáticas)
  const insights: Insight[] = []
  if (foco) {
    if (foco.enCurso) {
      const dia = Number(hoy.slice(8, 10))
      const diasMes = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).getUTCDate()
      if (prom3Gastos > 0) {
        const ritmo = Math.round(((foco.gastos / prom3Gastos) * 100))
        const esperado = Math.round((dia / diasMes) * 100)
        insights.push({
          tono: ritmo > esperado + 15 ? 'malo' : 'neutro',
          texto: `Vas ${dia} de ${diasMes} días del mes y ya gastaste el ${ritmo}% de lo que gastás en un mes normal (${formatoBs(prom3Gastos)}).`,
        })
      }
    } else if (foco.tasa !== null) {
      insights.push({
        tono: foco.ahorro >= 0 ? 'bueno' : 'malo',
        texto: foco.ahorro >= 0 ? `En ${etiquetaMes(foco.mes).toLowerCase()} ahorraste ${formatoBs(foco.ahorro)}, el ${String(foco.tasa).replace('.', ',')}% de lo que entró.` : `En ${etiquetaMes(foco.mes).toLowerCase()} gastaste ${formatoBs(-foco.ahorro)} más de lo que entró.`,
      })
    }
    const disparada = categoriasMes.find((c) => c.variacion !== null && c.variacion >= 25 && c.monto - c.promedio > Math.max(foco.gastos * 0.03, 1))
    if (disparada) insights.push({ tono: 'malo', texto: `${disparada.categoria}: ${formatoBs(disparada.monto)}, ${disparada.variacion}% más que tu promedio de los últimos 3 meses (${formatoBs(disparada.promedio)}).` })
    const bajo = categoriasMes.find((c) => c.variacion !== null && c.variacion <= -25 && c.promedio - c.monto > Math.max(foco.gastos * 0.03, 1) && !foco.enCurso)
    if (bajo) insights.push({ tono: 'bueno', texto: `${bajo.categoria} bajó ${-bajo.variacion!}% contra tu promedio: ${formatoBs(bajo.promedio - bajo.monto)} menos.` })
    if (foco.ingresos > 0 && foco.fijos > 0) {
      const pf = Math.round((foco.fijos / foco.ingresos) * 100)
      insights.push({ tono: pf > 50 ? 'malo' : 'neutro', texto: `Los gastos fijos (expensas, servicios, impuestos) se llevan el ${pf}% de tus ingresos del mes.` })
    }
  }
  if (mesesCerrados >= 3) insights.push({ tono: mesesPositivos >= mesesCerrados / 2 ? 'bueno' : 'malo', texto: `Ahorraste en ${mesesPositivos} de los últimos ${mesesCerrados} meses${prom6Ahorro ? `; en promedio ${formatoBs(prom6Ahorro)} por mes` : ''}.` })
  if (mejor && mesesCerrados >= 2) insights.push({ tono: 'neutro', texto: `Tu mejor mes fue ${etiquetaMes(mejor.mes).toLowerCase()} (${formatoBs(mejor.ahorro)} ahorrados).` })
  const salidas = eventos.filter((e) => e.monto < 0 && e.fecha <= sumarDias(hoy, 30)).reduce((s, e) => s - e.monto, 0)
  if (salidas > 0) insights.push({ tono: 'neutro', texto: `En los próximos 30 días tenés ${formatoBs(salidas)} en gastos por pagar ya cargados.` })
  if (minimo.saldo < 0) insights.push({ tono: 'malo', texto: `Con lo que ya está agendado, la caja quedaría en negativo el ${fechaCorta(minimo.fecha)} (${formatoBs(minimo.saldo)}).` })

  return {
    serie, foco, previos, categoriasMes, eventos, proyeccion, saldoHoy, minimo, insights,
    indicadores: { prom3Gastos, prom6Ahorro, mejor, peor, mesesPositivos, mesesCerrados, acumuladoPeriodo: serie.length ? serie[serie.length - 1].acumulado : 0 },
  }
}

function sumarDias(f: string, n: number) {
  return new Date(Date.parse(f + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
}
