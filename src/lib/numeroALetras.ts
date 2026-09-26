// Montos en letras al estilo de los contratos bolivianos:
// 2300   -> "DOS MIL TRESCIENTOS 00/100 BOLIVIANOS"
// 766.67 -> "SETECIENTOS SESENTA Y SEIS 67/100 BOLIVIANOS"

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const ESPECIALES = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
]
const VEINTIS = [
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
]
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS',
  'OCHOCIENTOS', 'NOVECIENTOS',
]

function menorQueMil(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c])
  if (resto) {
    if (resto < 10) partes.push(UNIDADES[resto])
    else if (resto < 20) partes.push(ESPECIALES[resto - 10])
    else if (resto < 30) partes.push(VEINTIS[resto - 20])
    else {
      const d = Math.floor(resto / 10)
      const u = resto % 10
      partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d])
    }
  }
  return partes.join(' ')
}

// Entero a letras (hasta cientos de millones, sobra para alquileres).
export function enteroALetras(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'CERO'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : `${apocopar(menorQueMil(millones))} MILLONES`)
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocopar(menorQueMil(miles))} MIL`)
  if (resto) partes.push(menorQueMil(resto))
  return partes.join(' ')
}

// "VEINTIUNO MIL" -> "VEINTIÚN MIL", "UNO MIL" -> "UN MIL"
function apocopar(txt: string) {
  return txt.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN')
}

export function montoEnLetras(monto: number): string {
  const redondeado = Math.round(monto * 100) / 100
  const entero = Math.floor(redondeado)
  const centavos = Math.round((redondeado - entero) * 100)
  return `${enteroALetras(entero)} ${String(centavos).padStart(2, '0')}/100 BOLIVIANOS`
}

const ORDINALES = [
  '', 'PRIMER', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO', 'SEXTO', 'SÉPTIMO', 'OCTAVO', 'NOVENO', 'DÉCIMO',
  'UNDÉCIMO', 'DUODÉCIMO', 'DECIMOTERCER', 'DECIMOCUARTO', 'DECIMOQUINTO', 'DECIMOSEXTO', 'DECIMOSÉPTIMO',
  'DECIMOCTAVO', 'DECIMONOVENO', 'VIGÉSIMO', 'VIGÉSIMO PRIMER', 'VIGÉSIMO SEGUNDO', 'VIGÉSIMO TERCER',
  'VIGÉSIMO CUARTO',
]

// 4 -> "CUARTO (4.º)"
export function ordinalMes(n: number) {
  return ORDINALES[n] ? `${ORDINALES[n]} (${n}.º)` : `N.º ${n}`
}
