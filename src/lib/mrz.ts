// Parser de la zona MRZ (Machine Readable Zone) del reverso de la
// cédula de identidad boliviana. Formato de 3 líneas, ej:
//
//   I<BOL4018463<<4<<<<<<<<<<<<<<<
//   7607154M2902197BOL<<<<<<<<<<<6
//   ALEMAN<VARGAS<<WILLY<<<<<<<<<<
//
// Línea 1: tipo de documento + país (BOL) + número de C.I. (dígitos,
//          antes del primer relleno "<<").
// Línea 2: fecha de nacimiento (AAMMDD) + sexo (M/F) + fecha de
//          expiración (AAMMDD) + país.
// Línea 3: APELLIDOS << NOMBRES (separados por doble "<", los
//          espacios entre palabras son un solo "<").
//
// El OCR nunca es perfecto, así que este parser es tolerante: intenta
// leer lo que puede y devuelve null en los campos que no logra
// interpretar en vez de fallar todo el proceso.

export type DatosMRZ = {
  ci: string | null
  nombre: string | null // "Nombres Apellidos", en Capitalización normal
  fechaNacimiento: string | null // YYYY-MM-DD
}

function limpiarLineaMRZ(linea: string): string {
  // El OCR a veces confunde < con K, k, ‹, «, etc. Normalizamos antes
  // de parsear.
  return linea.toUpperCase().replace(/[«‹]/g, '<').replace(/\s+/g, '')
}

function aCapitalizado(palabra: string): string {
  if (!palabra) return ''
  return palabra.charAt(0) + palabra.slice(1).toLowerCase()
}

// Convierte AAMMDD (con AA de 2 dígitos, sin saber el siglo) a una
// fecha ISO probable. Se asume que nadie firmando un contrato de
// alquiler nació después del año actual ni antes de 1920.
function interpretarFechaMRZ(aammdd: string): string | null {
  if (!/^\d{6}$/.test(aammdd)) return null
  const aa = Number(aammdd.slice(0, 2))
  const mm = aammdd.slice(2, 4)
  const dd = aammdd.slice(4, 6)
  const anioActualCorto = new Date().getFullYear() % 100
  const siglo = aa > anioActualCorto ? 1900 : 2000
  const anio = siglo + aa
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null
  return `${anio}-${mm}-${dd}`
}

// Busca en el texto crudo del OCR (que puede traer basura de ambos
// lados de la cédula mezclada) las 3 líneas de MRZ y las parsea.
export function extraerDatosMRZ(textoOCR: string): DatosMRZ {
  const lineas = textoOCR
    .split('\n')
    .map(limpiarLineaMRZ)
    .filter((l) => l.length > 10)

  let ci: string | null = null
  let fechaNacimiento: string | null = null
  let nombre: string | null = null

  for (const linea of lineas) {
    // Línea 1: empieza con I<BOL o similar, seguida del número de CI.
    const m1 = linea.match(/^I<?BOL(\d{5,9})/)
    if (m1) ci = m1[1]

    // Línea 2: 6 dígitos (nacimiento) + M/F + 6 dígitos (expiración) + BOL.
    const m2 = linea.match(/^(\d{6})[MF]\d{6}BOL/)
    if (m2) fechaNacimiento = interpretarFechaMRZ(m2[1])

    // Línea 3: dos bloques de letras separados por "<<" (apellidos y
    // nombres), cada palabra separada por un solo "<".
    if (!nombre && /^[A-Z<]{10,}$/.test(linea) && linea.includes('<<')) {
      const [apellidosRaw, nombresRaw] = linea.split('<<')
      const apellidos = (apellidosRaw || '').split('<').filter(Boolean).map(aCapitalizado).join(' ')
      const nombres = (nombresRaw || '').split('<').filter(Boolean).map(aCapitalizado).join(' ')
      if (apellidos || nombres) nombre = [nombres, apellidos].filter(Boolean).join(' ')
    }
  }

  return { ci, nombre, fechaNacimiento }
}

// Complementa lo leído del MRZ con el número de "CÉDULA DE IDENTIDAD
// N.°" que suele aparecer impreso, más grande y en rojo, en el frente
// — sirve como segunda fuente para confirmar el número si el MRZ no
// se pudo leer bien.
export function extraerCIDelFrente(textoOCR: string): string | null {
  const m = textoOCR.match(/N[°ºo]?\.?\s*(\d{5,9})/i)
  return m ? m[1] : null
}
