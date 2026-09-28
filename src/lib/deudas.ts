// Deudas con plan de pago: cuando un inquilino (o ex inquilino) quedó
// debiendo y se firmó un "Reconocimiento de Deuda y Compromiso de
// Pago" con cuotas. Código puro (sin Firebase ni React) para usarlo en
// la pantalla /deudas, en el calendario y en los endpoints.

import { formatoBs, redondear, MESES } from './esquemaPago'

export type CuotaDeuda = {
  numero: number
  monto: number
  vence: string // YYYY-MM-DD
  pagada: boolean
  montoPagado?: number | null
  pagadaEn?: string | null // fecha del cobro (YYYY-MM-DD)
  movimientoId?: string | null // ingreso creado en "movimientos"
  nota?: string
}

export type EstadoDeuda = 'vigente' | 'cancelada' | 'incumplida' | 'anulada'

export const ESTADOS_DEUDA: { id: EstadoDeuda; label: string; color: string }[] = [
  { id: 'vigente', label: 'Vigente', color: 'text-ocre' },
  { id: 'cancelada', label: 'Cancelada (pagó todo)', color: 'text-verde' },
  { id: 'incumplida', label: 'Incumplida (vía legal)', color: 'text-rojo' },
  { id: 'anulada', label: 'Anulada', color: 'text-inksoft' },
]

// Categoría con la que entran al flujo de caja los cobros de cuotas.
// Separada de "Alquiler" a propósito: es plata atrasada que se
// recupera, y así se ve aparte en el balance.
export const CATEGORIA_COBRO_DEUDA = 'Cobro de deuda (alquiler)'

export type Deuda = {
  id: string
  titulo: string
  concepto: string // "Alquileres impagos", "Daños al inmueble"...
  // Dónde se originó
  propiedadId: string | null
  unidadId: string | null
  alquilerId: string | null // el alquiler (inquilino) que generó la deuda
  // Partes
  deudorNombre: string
  deudorCI: string
  deudorTelefono?: string
  deudorDomicilio?: string
  acreedorNombre: string
  acreedorCI?: string
  // Condiciones
  montoTotal: number
  tasaInteresMensual: number | null // % que menciona el documento
  fechaAcuerdo: string
  lugar?: string
  garantia?: string
  cuotas: CuotaDeuda[]
  documentoUrl?: string | null
  notas?: string
  estado: EstadoDeuda
  creadoEn: string
  creadoPor: string
}

export function ordenarCuotas(cuotas: CuotaDeuda[]) {
  return [...cuotas].sort((a, b) => a.vence.localeCompare(b.vence) || a.numero - b.numero).map((c, i) => ({ ...c, numero: i + 1 }))
}

// Arma las cuotas a partir del total y el monto de cada cuota: 43.000
// en cuotas de 1.500 -> 28 de Bs 1.500 + una última de Bs 1.000.
// Vencen todas el mismo día de cada mes desde primerVence.
export function generarCuotasDeuda(p: { montoTotal: number; montoCuota: number; primerVence: string; cantidad?: number }): CuotaDeuda[] {
  const total = Number(p.montoTotal)
  const cuota = Number(p.montoCuota)
  if (!(cuota > 0) || !p.primerVence) return []
  let cantidad = p.cantidad && p.cantidad > 0 ? Math.floor(p.cantidad) : Math.ceil(redondear(total / cuota) - 1e-9)
  if (!(cantidad > 0)) cantidad = 1
  if (cantidad > 240) cantidad = 240
  const [a, m, d] = p.primerVence.split('-').map(Number)
  const cuotas: CuotaDeuda[] = []
  let acumulado = 0
  for (let i = 0; i < cantidad; i++) {
    const total0 = a * 12 + (m - 1) + i
    const anio = Math.floor(total0 / 12)
    const mes = (total0 % 12) + 1
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    const vence = `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimoDia)).padStart(2, '0')}`
    let monto = cuota
    // Si se dio el total, la última cuota ajusta el resto.
    if (!p.cantidad && i === cantidad - 1 && total > 0) monto = redondear(total - acumulado)
    acumulado = redondear(acumulado + monto)
    cuotas.push({ numero: i + 1, monto, vence, pagada: false })
  }
  return cuotas
}

export type ResumenDeuda = {
  totalCuotas: number // suma de todas las cuotas
  pagado: number
  saldo: number
  cuotasPagadas: number
  cantidadCuotas: number
  vencidas: CuotaDeuda[] // impagas con vencimiento pasado
  montoVencido: number
  proxima: CuotaDeuda | null // primera impaga
  ultima: CuotaDeuda | null
  porcentaje: number // 0-100 del total de cuotas
  diferenciaConTotal: number // suma de cuotas - monto reconocido
  alDia: boolean
}

export function resumirDeuda(d: Pick<Deuda, 'cuotas' | 'montoTotal'>, hoy = new Date().toISOString().slice(0, 10)): ResumenDeuda {
  const cuotas = ordenarCuotas(d.cuotas || [])
  const totalCuotas = redondear(cuotas.reduce((s, c) => s + Number(c.monto || 0), 0))
  const pagado = redondear(cuotas.filter((c) => c.pagada).reduce((s, c) => s + Number(c.montoPagado ?? c.monto ?? 0), 0))
  const vencidas = cuotas.filter((c) => !c.pagada && c.vence < hoy)
  const base = totalCuotas || Number(d.montoTotal) || 0
  return {
    totalCuotas,
    pagado,
    saldo: redondear(Math.max(base - pagado, 0)),
    cuotasPagadas: cuotas.filter((c) => c.pagada).length,
    cantidadCuotas: cuotas.length,
    vencidas,
    montoVencido: redondear(vencidas.reduce((s, c) => s + c.monto, 0)),
    proxima: cuotas.find((c) => !c.pagada) || null,
    ultima: cuotas[cuotas.length - 1] || null,
    porcentaje: base > 0 ? Math.min(100, Math.round((pagado / base) * 100)) : 0,
    diferenciaConTotal: redondear(totalCuotas - (Number(d.montoTotal) || 0)),
    alDia: vencidas.length === 0,
  }
}

// Texto corto del plan: "28 cuotas de Bs 1.500 y 1 de Bs 1.000, del 15 de
// noviembre 2026 al 15 de marzo 2029".
export function describirPlan(cuotas: CuotaDeuda[]) {
  const cs = ordenarCuotas(cuotas)
  if (!cs.length) return 'Sin cuotas cargadas.'
  const grupos: { monto: number; cantidad: number }[] = []
  for (const c of cs) {
    const g = grupos[grupos.length - 1]
    if (g && g.monto === c.monto) g.cantidad++
    else grupos.push({ monto: c.monto, cantidad: 1 })
  }
  const partes = grupos.map((g) => `${g.cantidad} ${g.cantidad === 1 ? 'cuota' : 'cuotas'} de ${formatoBs(g.monto)}`)
  const texto = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0]
  return `${texto}, del ${fechaLarga(cs[0].vence)} al ${fechaLarga(cs[cs.length - 1].vence)}`
}

export function fechaLarga(iso: string) {
  const [a, m, d] = (iso || '').split('-').map(Number)
  if (!a) return iso
  return `${d} de ${MESES[m - 1]} ${a}`
}

// Para ubicar al deudor entre los inquilinos cargados (por C.I. o
// nombre) y sugerir de qué alquiler salió la deuda.
export function normalizarCI(ci: string) {
  return (ci || '').replace(/\D/g, '')
}
export function normalizarNombre(n: string) {
  return (n || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Saneo de las cuotas que llegan del formulario / de la IA.
export function sanearCuotas(entrada: any): CuotaDeuda[] {
  const arr: any[] = Array.isArray(entrada) ? entrada : []
  return ordenarCuotas(
    arr
      .map((c) => ({
        numero: Number(c?.numero) || 0,
        monto: redondear(Number(c?.monto)),
        vence: /^\d{4}-\d{2}-\d{2}$/.test(String(c?.vence || '')) ? String(c.vence) : '',
        pagada: !!c?.pagada,
        montoPagado: c?.montoPagado != null ? Number(c.montoPagado) : null,
        pagadaEn: c?.pagadaEn || null,
        movimientoId: c?.movimientoId || null,
        nota: c?.nota ? String(c.nota).slice(0, 300) : '',
      }))
      .filter((c) => c.monto > 0 && c.vence)
  )
}

const MESES_TXT: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

// Lector determinístico del cronograma para documentos con el formato
// habitual ("PRIMERA CUOTA. - ... Bs. 1.500 ... hasta fecha 15 de
// noviembre de la presente gestión 2026"). Complementa a la IA: con
// documentos largos (muchas cuotas) no depende de que el modelo las
// liste todas.
export function extraerCuotasDeTexto(texto: string): CuotaDeuda[] {
  const plano = (texto || '').replace(/\s+/g, ' ')
  const segmentos = plano.split(/\bCUOTA\b/i).slice(1)
  const re = /Bs\.?\s*([\d.]+(?:,\d{1,2})?)[\s\S]*?(?:hasta|el|en)\s+(?:la\s+)?fecha\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(?:la\s+)?(?:presente\s+)?(?:gesti[oó]n\s+)?(\d{4})/i
  const cuotas: CuotaDeuda[] = []
  for (const seg of segmentos) {
    const m = re.exec(seg)
    if (!m) continue
    const mes = MESES_TXT[m[3].toLowerCase()]
    if (!mes) continue
    const monto = Number(m[1].replace(/\./g, '').replace(',', '.'))
    const vence = `${m[4]}-${String(mes).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`
    if (monto > 0) cuotas.push({ numero: cuotas.length + 1, monto, vence, pagada: false })
  }
  return ordenarCuotas(cuotas)
}
