// Gastos por pagar ("pendientes"): una obligación que llega ANTES de
// pagarse, con uno o más vencimientos (ej. expensas: 1.er vencimiento
// $377.459,34 al 10/10, 2.º vencimiento con 3% al 20/10). Cuando se
// paga, se marca y se crea el GASTO en movimientos. Código puro.

import { redondear } from './esquemaPago'

export type Vencimiento = { numero: number; fecha: string; monto: number; recargo?: number | null }
export type Concepto = { concepto: string; detalle?: string; monto: number }
export type DatosPagoProveedor = { titular?: string; banco?: string; cbu?: string; alias?: string; cuenta?: string }

export type EstadoPendiente = 'pendiente' | 'pagado' | 'anulado'

export type Pendiente = {
  id: string
  titulo: string // "Expensas 9/2026 — 7-B"
  categoria: string // categoría del gasto que se crea al pagar
  proveedor: string // "Administración Carpena"
  periodo: string | null // YYYY-MM
  propiedadId: string | null
  unidadId: string | null
  vencimientos: Vencimiento[]
  conceptos: Concepto[]
  pagoProveedor: DatosPagoProveedor
  interesMora: number // lo que vino cobrado por mora en esta liquidación
  documentoUrl?: string | null
  notas?: string
  estado: EstadoPendiente
  pago?: { fecha: string; monto: number; movimientoId: string | null; vencimientoNumero: number | null } | null
  moneda: string
  espacio: string
}

export function ordenarVencimientos(v: Vencimiento[]) {
  return [...v].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((x, i) => ({ ...x, numero: i + 1 }))
}

export function sanearVencimientos(entrada: any): Vencimiento[] {
  const arr: any[] = Array.isArray(entrada) ? entrada : []
  return ordenarVencimientos(
    arr
      .map((v) => ({
        numero: Number(v?.numero) || 0,
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(v?.fecha || '')) ? String(v.fecha) : '',
        monto: redondear(Number(v?.monto)),
        recargo: v?.recargo != null && v?.recargo !== '' ? Number(v.recargo) : null,
      }))
      .filter((v) => v.fecha && v.monto > 0)
  )
}

export function sanearConceptos(entrada: any): Concepto[] {
  const arr: any[] = Array.isArray(entrada) ? entrada : []
  return arr
    .map((c) => ({ concepto: String(c?.concepto || '').trim().slice(0, 120), detalle: String(c?.detalle || '').trim().slice(0, 120), monto: redondear(Number(c?.monto) || 0) }))
    .filter((c) => c.concepto)
}

function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000)
}

// Qué toca pagar en una fecha: el primer vencimiento que todavía no
// pasó. Si pasaron todos, el último (y queda marcado como vencido).
export function vencimientoVigente(p: Pick<Pendiente, 'vencimientos'>, fecha: string) {
  const vs = ordenarVencimientos(p.vencimientos || [])
  if (!vs.length) return null
  const v = vs.find((x) => fecha <= x.fecha) || vs[vs.length - 1]
  const vencidoTodo = fecha > vs[vs.length - 1].fecha
  return {
    vencimiento: v,
    vencidoTodo,
    diasParaVencer: diasEntre(fecha, v.fecha),
    // Cuánto se ahorra pagando ya, frente al vencimiento siguiente
    ahorroSiPagaHoy: (() => {
      const sig = vs.find((x) => x.fecha > v.fecha)
      return sig ? redondear(sig.monto - v.monto) : 0
    })(),
  }
}

export type SituacionPendiente = 'pagado' | 'anulado' | 'al_dia' | 'por_vencer' | 'con_recargo' | 'vencido'

export function situacion(p: Pick<Pendiente, 'estado' | 'vencimientos'>, hoy = new Date().toISOString().slice(0, 10)): SituacionPendiente {
  if (p.estado === 'pagado') return 'pagado'
  if (p.estado === 'anulado') return 'anulado'
  const v = vencimientoVigente(p, hoy)
  if (!v) return 'al_dia'
  if (v.vencidoTodo) return 'vencido'
  if (v.vencimiento.numero > 1) return 'con_recargo'
  if (v.diasParaVencer <= 5) return 'por_vencer'
  return 'al_dia'
}

// ---- Lector de liquidaciones de expensas (formato AdminProp / "Mis
// Expensas" de CABA, el más común en Buenos Aires). Devuelve null si el
// texto no tiene esa forma; entonces se usa la lectura con IA.

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
const fecha = (d: string) => {
  const [dd, mm, aaaa] = d.split('/')
  return `${aaaa}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

export type LecturaExpensas = {
  periodo: string | null
  proveedor: string
  unidad: string // "7-B"
  unidadFuncional: string // "34"
  titular: string // propietario según la liquidación
  edificio: string
  conceptos: Concepto[]
  total: number
  vencimientos: Vencimiento[]
  pagoProveedor: DatosPagoProveedor
  interesMora: number
}

export function leerLiquidacionExpensas(texto: string): LecturaExpensas | null {
  const t = texto.replace(/\r/g, '')
  if (!/CONCEPTOS A PAGAR/i.test(t) || !/VENCIMIENTO\s*1/i.test(t)) return null

  const per = /Liquidaci[oó]n:\s*(\d{1,2})\/(\d{4})/i.exec(t)
  const periodo = per ? `${per[2]}-${per[1].padStart(2, '0')}` : null

  const uf = /\n\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .']+),\s*([\w-]+)\s+U\.F\.\s*(\d+)/.exec(t)

  // Conceptos: entre "CONCEPTOS A PAGAR" y "TOTAL A PAGAR" vienen de a
  // pares (nombre, detalle). Los montos aparecen después, en el mismo
  // orden: un "$ x" por concepto, luego el total y uno por vencimiento.
  const bloque = t.slice(t.search(/CONCEPTOS A PAGAR/i), t.search(/TOTAL A PAGAR/i))
  const lineas = bloque.split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  const nombres: { concepto: string; detalle: string }[] = []
  for (let i = 0; i < lineas.length; i += 2) nombres.push({ concepto: lineas[i], detalle: lineas[i + 1] || '' })

  const vencs: Vencimiento[] = []
  const reV = /VENCIMIENTO\s*(\d)\s*\n?\s*(\d{1,2}\/\d{1,2}\/\d{4})(?:\s*-\s*([\d,]+)\s*%)?/gi
  let m: RegExpExecArray | null
  while ((m = reV.exec(t))) vencs.push({ numero: Number(m[1]), fecha: fecha(m[2]), monto: 0, recargo: m[3] ? num(m[3]) : null })
  if (!vencs.length) return null

  const montos = Array.from(t.matchAll(/\$\s*(-?[\d.]+,\d{2})/g)).map((x) => num(x[1]))
  const necesarios = nombres.length + 1 + vencs.length
  if (montos.length < necesarios) return null
  const conceptos = nombres.map((n, i) => ({ concepto: n.concepto, detalle: n.detalle, monto: montos[i] }))
  const total = montos[nombres.length]
  vencs.forEach((v, i) => (v.monto = montos[nombres.length + 1 + i]))

  // Control: los conceptos tienen que sumar el total (si no, el formato
  // no es el esperado y mejor no adivinar).
  const suma = redondear(conceptos.reduce((s, c) => s + c.monto, 0))
  if (Math.abs(suma - total) > 1) return null

  const cbu = /\b(\d{22})/.exec(t.replace(/[ \t]/g, ''))
  const alias = /Alias[.:]?\s*([a-z0-9][a-z0-9.\-]{5,})/i.exec(t)
  const titularCta = /Titular\s+([A-Z][A-Z0-9 .]{3,})\n/.exec(t)
  const banco = /NUEVA CUENTA del (BANCO [A-ZÁÉÍÓÚ]+)/i.exec(t) || /(Galicia|Santander|Naci[oó]n|Provincia|BBVA|Macro|Ciudad|ICBC|HSBC|Credicoop|Patagonia|Supervielle)/i.exec(t)
  const admin = /\n(Administraci[oó]n [^\n]+)\n/.exec(t)
  const edificio = /\n([A-ZÁÉÍÓÚ][\wáéíóú. ]+ \d{2,5})\s*-\s*\d*°?\s*Cat/i.exec(t)
  const mora = conceptos.find((c) => /inter[eé]s/i.test(c.concepto))?.monto || 0

  return {
    periodo,
    proveedor: admin?.[1]?.trim() || 'Administración',
    unidad: uf?.[2] || '',
    unidadFuncional: uf?.[3] || '',
    titular: uf?.[1]?.trim() || '',
    edificio: edificio?.[1]?.trim() || '',
    conceptos,
    total,
    vencimientos: ordenarVencimientos(vencs),
    pagoProveedor: {
      titular: titularCta?.[1]?.trim() || '',
      banco: banco?.[1] ? banco[1].replace(/^BANCO\s+/i, '').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '',
      cbu: cbu?.[1] || '',
      alias: alias?.[1] || '',
    },
    interesMora: mora,
  }
}

// Ubica la unidad ("7-B") y la propiedad ("Rivera 2444") leídas de un
// PDF entre las cargadas en el espacio.
function normalizar(n: string) {
  return (n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}
export function ubicarUnidad(lectura: { unidad?: string; edificio?: string }, propiedades: any[], unidades: any[]) {
  const nU = normalizar(lectura.unidad || '')
  const unidad = nU ? unidades.find((u) => normalizar(u.nombre).includes(nU)) || null : null
  const nE = normalizar(lectura.edificio || '')
  const propiedad = unidad
    ? propiedades.find((p) => p.id === unidad.propiedadId) || null
    : nE
    ? propiedades.find((p) => normalizar(`${p.nombre}${p.direccion || ''}`).includes(nE)) || null
    : null
  return { propiedad, unidad }
}
