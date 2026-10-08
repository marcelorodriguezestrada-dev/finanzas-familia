// Importación de gastos (y algunos ingresos) desde una planilla, texto
// pegado o facturas. Todas las fuentes terminan en la misma lista de
// ItemImportado, que se revisa en pantalla antes de guardar:
//   - gastos  -> "gastos por pagar" (con su vencimiento)
//   - ingresos -> movimientos de ingreso
// Código puro: se usa en el navegador y es fácil de probar.

export type ItemImportado = {
  clave: string // para la tabla de revisión
  incluir: boolean
  tipo: 'gasto' | 'ingreso'
  servicio: string // "expensa depa", "luz-edenor"
  lugar: string // "rivera", "moldes" (texto tal cual)
  propiedadId: string | null
  categoria: string
  referencia: string // n.° de cliente / cuenta / partida
  periodo: string | null // YYYY-MM
  vencimiento: string | null // YYYY-MM-DD
  fechaPago: string | null
  monto: number | null
  vencimiento2?: string | null // 2.º vencimiento (facturas)
  monto2?: number | null
  encargado: string
  nota: string
  origen: string // "planilla", "texto", nombre del archivo...
}

export type Columnas = Partial<Record<'lugar' | 'servicio' | 'referencia' | 'periodo' | 'fechaPago' | 'vencimiento' | 'monto' | 'encargado' | 'tipo' | 'mes' | 'anio', number>>

const norm = (s: any) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const SINONIMOS: Record<keyof Columnas, string[]> = {
  lugar: ['lugar', 'propiedad', 'inmueble', 'depto', 'departamento', 'donde', 'ubicacion', 'casa'],
  servicio: ['servicio', 'concepto', 'detalle', 'descripcion', 'gasto', 'item', 'proveedor'],
  referencia: ['nro cliente', 'numero de cliente', 'cliente', 'cuenta', 'partida', 'referencia', 'codigo', 'nro', 'n cliente', 'contrato'],
  periodo: ['mes ano', 'mes anio', 'periodo', 'mes año', 'yyyymm'],
  fechaPago: ['fecha pago', 'pago', 'pagado', 'fecha de pago'],
  vencimiento: ['fecha vencim', 'vencimiento', 'vence', 'fecha venc', 'vto', 'fecha vencimiento'],
  monto: ['precio', 'monto', 'importe', 'total', 'valor', 'a pagar'],
  encargado: ['encargado', 'responsable', 'quien paga', 'paga', 'a cargo'],
  tipo: ['tipo', 'movimiento', 'clase'],
  mes: ['mes'],
  anio: ['ano', 'anio', 'year'],
}

// Detecta qué columna es cada cosa por el texto del encabezado.
export function detectarColumnas(encabezados: string[]): Columnas {
  const cols: Columnas = {}
  const usados = new Set<number>()
  // Orden: primero los nombres más específicos, para que "fecha pago" no
  // se confunda con "pago" o "mes-año" con "mes".
  const orden: (keyof Columnas)[] = ['periodo', 'vencimiento', 'fechaPago', 'referencia', 'encargado', 'monto', 'servicio', 'lugar', 'tipo', 'anio', 'mes']
  for (const campo of orden) {
    for (const sin of SINONIMOS[campo]) {
      const i = encabezados.findIndex((h, idx) => !usados.has(idx) && (norm(h) === sin || norm(h).startsWith(sin)))
      if (i >= 0) {
        cols[campo] = i
        usados.add(i)
        break
      }
    }
  }
  // Columna sin título justo después del servicio (como el n.° de
  // cliente en muchas planillas): se toma como referencia.
  if (cols.referencia === undefined && cols.servicio !== undefined && !norm(encabezados[cols.servicio + 1]) && cols.servicio + 1 < encabezados.length) {
    cols.referencia = cols.servicio + 1
  }
  return cols
}

// "$11.305,86" -> 11305.86 ; "1,034,777.75" -> 1034777.75 ; "" -> null
export function leerMonto(v: any): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.abs(v) : null
  let s = String(v ?? '').replace(/[^\d.,-]/g, '')
  if (!s || !/\d/.test(s)) return null
  const ultComa = s.lastIndexOf(',')
  const ultPunto = s.lastIndexOf('.')
  if (ultComa > ultPunto) s = s.replace(/\./g, '').replace(',', '.') // 1.234,56
  else if (ultPunto > ultComa && ultComa >= 0) s = s.replace(/,/g, '') // 1,234.56
  else if (ultPunto >= 0 && /\.\d{3}$/.test(s) && (s.match(/\./g) || []).length >= 1 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '') // 140.000
  const n = Math.abs(Number(s))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

// "30/9/2026", "2026-10-01", Date, número de serie de Excel -> YYYY-MM-DD
export function leerFecha(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
  }
  const s = String(v ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

// "202610", "2026-10", "10/2026", "octubre 2026" -> "2026-10"
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function leerPeriodo(v: any): string | null {
  const s = String(v ?? '').trim().toLowerCase()
  let m = /^(\d{4})(\d{2})$/.exec(s) || /^(\d{4})[-/](\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  m = /^(\d{1,2})[-/](\d{4})$/.exec(s)
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`
  const i = MESES.findIndex((x) => s.startsWith(x) || s.startsWith(x.slice(0, 3)))
  const a = /(\d{4})/.exec(s)
  if (i >= 0 && a) return `${a[1]}-${String(i + 1).padStart(2, '0')}`
  return null
}

// Categoría a partir del nombre del servicio.
export function inferirCategoria(servicio: string, tipo: 'gasto' | 'ingreso'): string {
  const s = norm(servicio)
  if (tipo === 'ingreso') {
    if (/alquiler|renta|cochera/.test(s)) return 'Alquiler'
    if (/sueldo|salario|desempleo|jubilacion|anses/.test(s)) return 'Sueldo'
    return 'Otro'
  }
  if (/expensa/.test(s)) return 'Expensas'
  if (/luz|edenor|edesur|metrogas|gas|agua|aysa|internet|telefono|celular|fibertel|telecentro|movistar|personal|claro|cable|directv|flow|electric/.test(s)) return 'Servicios (luz, agua, gas, internet)'
  if (/abl|arba|agip|patente|impuesto|inmobiliario|municipal|ganancias|monotributo|afip|arca|tasa/.test(s)) return 'Impuestos'
  if (/prepaga|osde|swiss|medic|farmacia|salud|galeno/.test(s)) return 'Salud'
  if (/colegio|escuela|universidad|curso|cuota escolar/.test(s)) return 'Educación'
  if (/seguro auto|nafta|combustible|sube|peaje|auto/.test(s)) return 'Transporte'
  if (/super|mercado|almacen|comida/.test(s)) return 'Comida'
  return 'Otro'
}

// ¿El "encargado" de la planilla es el propio usuario? ("Marce" vs "Marcelo Rodríguez")
export function esUnoMismo(encargado: string, nombreUsuario: string) {
  const e = norm(encargado)
  if (!e || ['yo', 'mio', 'propio', 'propia'].includes(e)) return true
  const pila = norm(nombreUsuario).split(' ')[0] || ''
  return !!pila && (pila.startsWith(e) || e.startsWith(pila) || norm(nombreUsuario).includes(e))
}

// ---- CSV / celdas pegadas -> matriz
export function parsearTabla(texto: string): string[][] {
  const t = texto.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  const primera = t.split('\n')[0] || ''
  const sep = primera.includes('\t') ? '\t' : (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') comillas = false
      else celda += c
    } else if (c === '"' && celda === '') comillas = true
    else if (c === sep) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n') {
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  fila.push(celda)
  filas.push(fila)
  return filas.filter((f) => f.some((x) => String(x).trim() !== ''))
}

// Busca la fila de encabezados (la primera con al menos 3 columnas reconocibles).
export function ubicarEncabezado(matriz: any[][]): { fila: number; columnas: Columnas } | null {
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const cols = detectarColumnas(matriz[i].map((x) => String(x ?? '')))
    const reconocidas = Object.keys(cols).length
    if (reconocidas >= 3 && (cols.monto !== undefined || cols.vencimiento !== undefined)) return { fila: i, columnas: cols }
  }
  return null
}

export function itemsDesdeMatriz(matriz: any[][], opts: { nombreUsuario: string; origen: string; columnas?: Columnas; filaEncabezado?: number }): ItemImportado[] {
  const enc = opts.columnas ? { fila: opts.filaEncabezado ?? 0, columnas: opts.columnas } : ubicarEncabezado(matriz)
  if (!enc) return []
  const c = enc.columnas
  const celda = (f: any[], k: keyof Columnas) => (c[k] !== undefined ? f[c[k]!] : undefined)
  const items: ItemImportado[] = []
  matriz.slice(enc.fila + 1).forEach((f, i) => {
    const servicio = String(celda(f, 'servicio') ?? '').trim()
    if (!servicio && celda(f, 'monto') == null) return
    const tipoTxt = norm(celda(f, 'tipo'))
    const tipo: 'gasto' | 'ingreso' = /ingres|cobro|entrada/.test(tipoTxt) ? 'ingreso' : 'gasto'
    const vencimiento = leerFecha(celda(f, 'vencimiento'))
    const fechaPago = leerFecha(celda(f, 'fechaPago'))
    let periodo = leerPeriodo(celda(f, 'periodo'))
    if (!periodo && c.mes !== undefined && c.anio !== undefined) periodo = leerPeriodo(`${celda(f, 'mes')} ${celda(f, 'anio')}`)
    if (!periodo && vencimiento) periodo = vencimiento.slice(0, 7)
    const monto = leerMonto(celda(f, 'monto'))
    const encargado = String(celda(f, 'encargado') ?? '').trim()
    const propio = esUnoMismo(encargado, opts.nombreUsuario)
    const notas: string[] = []
    if (!monto) notas.push('sin monto')
    if (!propio) notas.push(`lo paga ${encargado}`)
    if (tipo === 'gasto' && !vencimiento && !fechaPago) notas.push('sin fecha')
    items.push({
      clave: `${opts.origen}-${i}`,
      incluir: !!monto && propio && (tipo === 'ingreso' || !!(vencimiento || fechaPago)),
      tipo,
      servicio,
      lugar: String(celda(f, 'lugar') ?? '').trim(),
      propiedadId: null,
      categoria: inferirCategoria(servicio, tipo),
      referencia: String(celda(f, 'referencia') ?? '').trim(),
      periodo,
      vencimiento: vencimiento || fechaPago,
      fechaPago,
      monto,
      encargado,
      nota: notas.join(' · '),
      origen: opts.origen,
    })
  })
  return items
}

// Asocia cada item a una propiedad del espacio por el texto de "lugar"
// ("rivera" -> "Rivera 2444").
export function asociarPropiedades(items: ItemImportado[], propiedades: any[]) {
  return items.map((it) => {
    if (it.propiedadId || !it.lugar) return it
    const l = norm(it.lugar)
    const p = propiedades.find((x) => {
      const n = norm(`${x.nombre} ${x.direccion || ''}`)
      return n.includes(l) || l.split(' ').some((w) => w.length >= 4 && n.includes(w))
    })
    return p ? { ...it, propiedadId: p.id } : it
  })
}

export function tituloDe(it: ItemImportado) {
  const s = it.servicio ? it.servicio.charAt(0).toUpperCase() + it.servicio.slice(1) : it.categoria
  return `${s}${it.lugar ? ` · ${it.lugar.charAt(0).toUpperCase() + it.lugar.slice(1)}` : ''}${it.periodo ? ` ${Number(it.periodo.slice(5))}/${it.periodo.slice(0, 4)}` : ''}`
}

// Items que devuelve la IA (texto libre u OCR de una factura) -> ItemImportado
export function itemsDesdeIA(lista: any[], origen: string): ItemImportado[] {
  return lista.map((x, i) => {
    const tipo: 'gasto' | 'ingreso' = x?.tipo === 'ingreso' ? 'ingreso' : 'gasto'
    const monto = leerMonto(x?.monto)
    const vencimiento = leerFecha(x?.vencimiento)
    const notas: string[] = []
    if (!monto) notas.push('sin monto')
    if (tipo === 'gasto' && !vencimiento) notas.push('sin fecha')
    return {
      clave: `${origen}-${i}`,
      incluir: !!monto && (tipo === 'ingreso' || !!vencimiento),
      tipo,
      servicio: String(x?.servicio || '').trim(),
      lugar: String(x?.lugar || '').trim(),
      propiedadId: null,
      categoria: x?.categoria || inferirCategoria(String(x?.servicio || ''), tipo),
      referencia: String(x?.referencia || '').trim(),
      periodo: leerPeriodo(x?.periodo) || (vencimiento ? vencimiento.slice(0, 7) : null),
      vencimiento,
      fechaPago: null,
      monto,
      vencimiento2: leerFecha(x?.vencimiento2),
      monto2: leerMonto(x?.monto2),
      encargado: '',
      nota: notas.join(' · '),
      origen,
    }
  })
}
