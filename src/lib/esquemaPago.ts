// Esquema de pago de un alquiler: canon fijo o ESCALONADO por tramos
// (ej. "Bs 2.300 los primeros 3 meses y después Bs 2.500 hasta el
// final"), más el cobro proporcional de los días sueltos del primer y
// del último mes.
//
// Es código puro (sin Firebase ni React) para poder usarlo igual en el
// formulario (resumen en vivo), en el generador del contrato PDF, en
// /api/cobrar-alquiler (cuánto cobrar cada mes) y en el calendario de
// moras. Todo sale de una sola función: generarCronograma().

export type TramoCanon = {
  monto: number
  // Cantidad de meses COMPLETOS que dura el tramo. null = "hasta la
  // conclusión del contrato" (solo tiene sentido en el último tramo).
  meses: number | null
}

export type EsquemaPago = {
  tramos: TramoCanon[]
  // Si el contrato no arranca el día 1, cobrar a la firma solo los
  // días que quedan de ese mes (como en el contrato de Fortunato
  // Gumiel: 21 al 30 de septiembre = 10 días).
  proporcionalInicio: boolean
  // Si el contrato termina a mitad de mes, cobrar solo los días
  // ocupados de ese último mes.
  proporcionalFin: boolean
  // Base de días del mes comercial para el valor diario (Bs 2.300 / 30
  // = Bs 76,67 por día).
  baseDias: number
}

export type TipoCuota = 'proporcional_inicio' | 'completa' | 'proporcional_fin'

export type Cuota = {
  numero: number
  mes: string // YYYY-MM
  etiqueta: string // "Octubre 2026"
  tipo: TipoCuota
  monto: number // lo que efectivamente se cobra ese mes
  montoMensual: number // canon del tramo vigente (mes completo)
  tramo: number // índice del tramo (0, 1, ...)
  dias: number | null // solo en cuotas proporcionales
  vence: string // YYYY-MM-DD
  proyectada: boolean // true si el contrato no tiene fecha de fin y es una proyección
}

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function redondear(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// "Bs 2.300" / "Bs 766,67" — formato boliviano armado a mano (no con
// toLocaleString) para que salga igual en el navegador y en el
// servidor, que a veces no trae los datos de locale completos.
export function formatoBs(n: number, conPrefijo = true) {
  const r = redondear(n)
  const entero = Math.trunc(Math.abs(r))
  const centavos = Math.round((Math.abs(r) - entero) * 100)
  const miles = entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const txt = `${r < 0 ? '-' : ''}${miles}${centavos ? ',' + String(centavos).padStart(2, '0') : ''}`
  return conPrefijo ? `Bs ${txt}` : txt
}

function diasDelMes(anio: number, mes1: number) {
  return new Date(Date.UTC(anio, mes1, 0)).getUTCDate()
}

function claveMes(anio: number, mes1: number) {
  return `${anio}-${String(mes1).padStart(2, '0')}`
}

function sumarMes(anio: number, mes1: number, n = 1): [number, number] {
  const total = anio * 12 + (mes1 - 1) + n
  return [Math.floor(total / 12), (total % 12) + 1]
}

function parsearFecha(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

export function etiquetaMes(clave: string) {
  const [anio, mes] = clave.split('-').map(Number)
  const nombre = MESES[mes - 1] || ''
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`
}

export function fechaCorta(iso: string) {
  const f = parsearFecha(iso)
  if (!f) return iso
  return `${String(f[2]).padStart(2, '0')}/${String(f[1]).padStart(2, '0')}/${f[0]}`
}

export function esquemaFijo(monto: number): EsquemaPago {
  return { tramos: [{ monto, meses: null }], proporcionalInicio: true, proporcionalFin: true, baseDias: 30 }
}

// Sanea lo que llega del formulario / de la base. Si no hay tramos
// válidos, cae a un canon fijo con montoFallback (alquileres viejos
// que solo tienen montoMensual).
export function normalizarEsquema(entrada: any, montoFallback?: number): EsquemaPago | null {
  const tramosCrudos: any[] = Array.isArray(entrada?.tramos) ? entrada.tramos : []
  const tramos: TramoCanon[] = tramosCrudos
    .map((t) => ({
      monto: Number(t?.monto),
      meses: t?.meses === null || t?.meses === undefined || t?.meses === '' ? null : Math.floor(Number(t.meses)),
    }))
    .filter((t) => Number.isFinite(t.monto) && t.monto > 0)
    .map((t) => ({ ...t, meses: t.meses !== null && Number.isFinite(t.meses) && t.meses > 0 ? t.meses : null }))

  if (tramos.length === 0) {
    return montoFallback && montoFallback > 0 ? esquemaFijo(montoFallback) : null
  }
  // Solo el último tramo puede ser "hasta el final": a un tramo del
  // medio sin cantidad de meses se le asigna 1 mes para que el
  // esquema no quede ambiguo.
  for (let i = 0; i < tramos.length - 1; i++) {
    if (tramos[i].meses === null) tramos[i].meses = 1
  }
  return {
    tramos,
    proporcionalInicio: entrada?.proporcionalInicio !== false,
    proporcionalFin: entrada?.proporcionalFin !== false,
    baseDias: Number(entrada?.baseDias) > 0 ? Number(entrada.baseDias) : 30,
  }
}

// El esquema de un alquiler guardado (o uno fijo armado con su
// montoMensual si es un alquiler viejo, anterior a esta función).
export function esquemaDeAlquiler(a: { esquemaPago?: any; montoMensual?: number }): EsquemaPago | null {
  return normalizarEsquema(a?.esquemaPago, Number(a?.montoMensual || 0))
}

export function esEscalonado(e: EsquemaPago | null | undefined) {
  return !!e && e.tramos.length > 1
}

function tramoParaMesNumero(esquema: EsquemaPago, numeroMesCompleto: number) {
  // numeroMesCompleto arranca en 1.
  let acumulado = 0
  for (let i = 0; i < esquema.tramos.length; i++) {
    const t = esquema.tramos[i]
    if (t.meses === null) return i
    acumulado += t.meses
    if (numeroMesCompleto <= acumulado) return i
  }
  return esquema.tramos.length - 1 // se pasó de los tramos definidos: sigue el último
}

export type ParametrosCronograma = {
  fechaInicio: string
  fechaFin?: string | null
  diaCobro: number
  esquema: EsquemaPago
  // Solo si no hay fecha de fin: hasta qué mes proyectar (YYYY-MM).
  // Por defecto, 12 meses o lo que cubran los tramos definidos.
  proyectarHasta?: string
}

export function generarCronograma(p: ParametrosCronograma): Cuota[] {
  const ini = parsearFecha(p.fechaInicio)
  if (!ini || !p.esquema?.tramos?.length) return []
  const [anioIni, mesIni, diaIni] = ini
  const { esquema } = p
  const base = esquema.baseDias || 30
  const diaCobro = Math.min(Math.max(Number(p.diaCobro) || 1, 1), 28)
  const cuotas: Cuota[] = []

  const fin = p.fechaFin ? parsearFecha(p.fechaFin) : null
  // El día de fin se toma como el día de ENTREGA del inmueble: si el
  // contrato va del 21/09/2026 al 21/09/2027, en septiembre de 2027 se
  // ocupan los días 1 al 20. Si la fecha de fin es el último día del
  // mes, ese mes cuenta completo.
  let mesFinClave: string | null = null
  let diasUltimoMes = 0
  let ultimoMesCompleto = false
  if (fin) {
    const [af, mf, df] = fin
    mesFinClave = claveMes(af, mf)
    if (df >= diasDelMes(af, mf)) {
      ultimoMesCompleto = true
    } else {
      diasUltimoMes = df - 1
    }
  }

  const venceDelMes = (anio: number, mes1: number) =>
    `${claveMes(anio, mes1)}-${String(Math.min(diaCobro, diasDelMes(anio, mes1))).padStart(2, '0')}`

  let numeroMesCompleto = 0
  let [anio, mes] = [anioIni, mesIni]

  // 1) Primer mes
  const arrancaDia1 = diaIni === 1
  if (!arrancaDia1 && esquema.proporcionalInicio) {
    const diasRestantes = Math.min(diasDelMes(anioIni, mesIni) - diaIni + 1, base)
    const montoMensual = esquema.tramos[0].monto
    const mismoMesQueFin = mesFinClave === claveMes(anioIni, mesIni)
    const dias = mismoMesQueFin && fin ? Math.max(fin[2] - diaIni, 0) : diasRestantes
    cuotas.push({
      numero: 0,
      mes: claveMes(anioIni, mesIni),
      etiqueta: etiquetaMes(claveMes(anioIni, mesIni)),
      tipo: 'proporcional_inicio',
      monto: redondear((montoMensual / base) * dias),
      montoMensual,
      tramo: 0,
      dias,
      vence: p.fechaInicio.slice(0, 10), // se paga a la firma
      proyectada: false,
    })
    if (mismoMesQueFin) return numerar(cuotas)
    ;[anio, mes] = sumarMes(anio, mes)
  }

  // 2) Meses completos (y el último, que puede ser proporcional)
  let limiteProyeccion: string
  if (mesFinClave) {
    limiteProyeccion = mesFinClave
  } else {
    const mesesDefinidos = esquema.tramos.reduce((s, t) => s + (t.meses || 0), 0)
    const cantidad = Math.max(12, mesesDefinidos + 3)
    const [a2, m2] = sumarMes(anio, mes, cantidad - 1)
    limiteProyeccion = claveMes(a2, m2)
    if (p.proyectarHasta && p.proyectarHasta > limiteProyeccion) limiteProyeccion = p.proyectarHasta
  }

  let guardia = 0
  while (claveMes(anio, mes) <= limiteProyeccion && guardia++ < 600) {
    const clave = claveMes(anio, mes)
    const esUltimo = mesFinClave === clave
    if (esUltimo && !ultimoMesCompleto && diasUltimoMes <= 0) break // termina el día 1: no hay cuota ese mes
    // Si arrancó a mitad de mes y el primer mes se cobró COMPLETO (sin
    // prorrateo), los pagos corren "del 21 al 20": esos días del último
    // mes ya están cubiertos y no se cobran aparte (12 pagos por año,
    // no 13).
    if (esUltimo && !ultimoMesCompleto && !arrancaDia1 && !esquema.proporcionalInicio) break

    numeroMesCompleto++
    const tramo = tramoParaMesNumero(esquema, numeroMesCompleto)
    const montoMensual = esquema.tramos[tramo].monto
    const primero = cuotas.length === 0

    if (esUltimo && !ultimoMesCompleto && esquema.proporcionalFin) {
      const dias = Math.min(diasUltimoMes, base)
      cuotas.push({
        numero: 0,
        mes: clave,
        etiqueta: etiquetaMes(clave),
        tipo: 'proporcional_fin',
        monto: redondear((montoMensual / base) * dias),
        montoMensual,
        tramo,
        dias,
        vence: venceDelMes(anio, mes),
        proyectada: false,
      })
    } else {
      cuotas.push({
        numero: 0,
        mes: clave,
        etiqueta: etiquetaMes(clave),
        tipo: 'completa',
        monto: montoMensual,
        montoMensual,
        tramo,
        dias: null,
        // Si el contrato arranca a mitad de mes sin prorrateo, el
        // primer mes se paga a la firma.
        vence: primero && !arrancaDia1 ? p.fechaInicio.slice(0, 10) : venceDelMes(anio, mes),
        proyectada: !mesFinClave,
      })
    }
    ;[anio, mes] = sumarMes(anio, mes)
  }

  return numerar(cuotas)
}

function numerar(cuotas: Cuota[]) {
  cuotas.forEach((c, i) => (c.numero = i + 1))
  return cuotas
}

// Cuota que corresponde cobrar en un mes puntual (YYYY-MM), o null si
// según el contrato ese mes no hay nada que cobrar (antes del inicio o
// después del fin).
export function cuotaDelMes(
  a: { fechaInicio: string; fechaFin?: string | null; diaCobro: number; esquemaPago?: any; montoMensual?: number },
  mes: string
): Cuota | null {
  const esquema = esquemaDeAlquiler(a)
  if (!esquema) return null
  const cronograma = generarCronograma({
    fechaInicio: a.fechaInicio,
    fechaFin: a.fechaFin || null,
    diaCobro: a.diaCobro,
    esquema,
    proyectarHasta: mes,
  })
  return cronograma.find((c) => c.mes === mes) || null
}

// Próximo cambio de monto a partir de un mes (para mostrar "desde
// enero 2027 pasa a Bs 2.500").
export function proximoAumento(cronograma: Cuota[], desdeMes: string) {
  const actual = cronograma.find((c) => c.mes === desdeMes)
  const base = actual?.montoMensual ?? cronograma.find((c) => c.mes > desdeMes)?.montoMensual
  if (base === undefined) return null
  const siguiente = cronograma.find((c) => c.mes > desdeMes && c.tipo === 'completa' && c.montoMensual !== base)
  return siguiente ? { mes: siguiente.mes, etiqueta: siguiente.etiqueta, monto: siguiente.montoMensual, anterior: base } : null
}

export type GrupoResumen = {
  tipo: TipoCuota
  desde: string // YYYY-MM
  hasta: string
  cantidad: number
  monto: number // monto de cada cuota
  subtotal: number
  dias: number | null
  vence: string
  proyectada: boolean
  tramo: number
}

export type ResumenPago = {
  grupos: GrupoResumen[]
  total: number
  cantidadCuotas: number
  pagoALaFirma: number
  valorDiario: number // del primer tramo
  proyectado: boolean
  lineas: string[] // texto listo para mostrar
}

function rangoMeses(desde: string, hasta: string) {
  if (desde === hasta) return etiquetaMes(desde)
  const [ad] = desde.split('-')
  const [ah] = hasta.split('-')
  const nd = MESES[Number(desde.split('-')[1]) - 1]
  const nh = MESES[Number(hasta.split('-')[1]) - 1]
  return ad === ah ? `${nd} a ${nh} ${ah}` : `${nd} ${ad} a ${nh} ${ah}`
}

export function resumirCronograma(cronograma: Cuota[], esquema: EsquemaPago, fechaInicio: string, fechaFin?: string | null): ResumenPago {
  const grupos: GrupoResumen[] = []
  for (const c of cronograma) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && c.tipo === 'completa' && ultimo.tipo === 'completa' && ultimo.monto === c.monto && ultimo.proyectada === c.proyectada) {
      ultimo.hasta = c.mes
      ultimo.cantidad++
      ultimo.subtotal = redondear(ultimo.subtotal + c.monto)
    } else {
      grupos.push({
        tipo: c.tipo, desde: c.mes, hasta: c.mes, cantidad: 1, monto: c.monto, subtotal: c.monto,
        dias: c.dias, vence: c.vence, proyectada: c.proyectada, tramo: c.tramo,
      })
    }
  }

  const total = redondear(cronograma.reduce((s, c) => s + c.monto, 0))
  const pagoALaFirma = redondear(cronograma.filter((c) => c.vence === fechaInicio.slice(0, 10)).reduce((s, c) => s + c.monto, 0))
  const valorDiario = redondear(esquema.tramos[0].monto / (esquema.baseDias || 30))
  const proyectado = cronograma.some((c) => c.proyectada)

  const lineas = grupos.map((g, idx) => {
    if (g.tipo === 'proporcional_inicio') {
      return `A la firma (${fechaCorta(g.vence)}): ${formatoBs(g.monto)} — proporcional de ${g.dias} días de ${rangoMeses(g.desde, g.desde).toLowerCase()} (${formatoBs(redondear(g.monto / (g.dias || 1)))}/día).`
    }
    if (g.tipo === 'proporcional_fin') {
      return `${etiquetaMes(g.desde)}: ${formatoBs(g.monto)} — proporcional de ${g.dias} días${fechaFin ? `, hasta la entrega el ${fechaCorta(fechaFin)}` : ''}.`
    }
    const periodo = rangoMeses(g.desde, g.hasta)
    const cuota = g.cantidad === 1 ? `1 cuota de ${formatoBs(g.monto)}` : `${g.cantidad} cuotas de ${formatoBs(g.monto)} = ${formatoBs(g.subtotal)}`
    return `${periodo.charAt(0).toUpperCase()}${periodo.slice(1)}: ${cuota}${g.proyectada && idx === grupos.length - 1 ? ' (y sigue igual mientras dure el alquiler)' : ''}.`
  })

  return { grupos, total, cantidadCuotas: cronograma.length, pagoALaFirma, valorDiario, proyectado, lineas }
}

// Atajo: cronograma + resumen de una sola vez.
export function calcularPlanDePago(p: ParametrosCronograma) {
  const cronograma = generarCronograma(p)
  const resumen = resumirCronograma(cronograma, p.esquema, p.fechaInicio, p.fechaFin)
  return { cronograma, resumen }
}
