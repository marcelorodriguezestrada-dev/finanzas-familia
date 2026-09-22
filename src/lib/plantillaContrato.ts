// Plantilla del contrato de alquiler. Separada del endpoint que
// genera el PDF para poder ajustar el texto legal sin tocar el
// código de maquetado. Las cláusulas siguen el orden habitual de un
// contrato de anticrético/alquiler simple en Bolivia: partes, objeto,
// canon, plazo, garantías, obligaciones y firmas.

export type DatosContrato = {
  // Propiedad / unidad
  propiedadNombre: string
  propiedadDireccion: string
  unidadNombre: string
  unidadTipo: string
  // Inquilino
  inquilinoNombre: string
  inquilinoCI: string
  inquilinoTelefono?: string
  inquilinoDireccionAnterior?: string
  // Condiciones
  montoMensual: number
  anticipo?: number | null
  diaCobro: number
  fechaInicio: string // YYYY-MM-DD
  fechaFin?: string | null
  // Administrador / arrendador
  administradorNombre: string
  // Checklist de cláusulas: ids de ClausulaId a incluir. Si se omite,
  // se incluyen todas las estándar (comportamiento previo).
  clausulasSeleccionadas?: string[]
  // Cláusulas adicionales redactadas a mano o con ayuda de IA
  // (ver /api/redactar-clausula), se agregan al final antes de la
  // cláusula de conformidad/firmas.
  clausulasExtra?: { titulo: string; texto: string }[]
}

// Catálogo de cláusulas estándar, en base a la plantilla de ejemplo
// (contrato de alquiler de vivienda familiar). Cada una es opcional
// salvo 'partes' y 'conformidad', que son estructurales.
export const CLAUSULAS_DISPONIBLES = [
  { id: 'partes', numero: '', titulo: 'Partes contratantes', obligatoria: true },
  { id: 'objeto', numero: 'PRIMERA', titulo: 'Objeto (descripción del inmueble)', obligatoria: false },
  { id: 'canon', numero: 'SEGUNDA', titulo: 'Canon de alquiler', obligatoria: false },
  { id: 'anticipo', numero: 'TERCERA', titulo: 'Anticipo / garantía', obligatoria: false },
  { id: 'plazo', numero: 'CUARTA', titulo: 'Plazo del contrato', obligatoria: false },
  { id: 'obligacionesInquilino', numero: 'QUINTA', titulo: 'Obligaciones del inquilino', obligatoria: false },
  { id: 'obligacionesArrendador', numero: 'SEXTA', titulo: 'Obligaciones del arrendador', obligatoria: false },
  { id: 'rescision', numero: 'SÉPTIMA', titulo: 'Rescisión anticipada', obligatoria: false },
  { id: 'conformidad', numero: '', titulo: 'Conformidad y firmas', obligatoria: true },
] as const

export type ClausulaId = typeof CLAUSULAS_DISPONIBLES[number]['id']

export const CLAUSULAS_POR_DEFECTO: ClausulaId[] = CLAUSULAS_DISPONIBLES.map((c) => c.id)

function formatearFecha(iso: string) {
  if (!iso) return '____________'
  const [anio, mes, dia] = iso.split('-')
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${Number(dia)} de ${meses[Number(mes) - 1]} de ${anio}`
}

function bs(n: number) {
  return `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 0 })}`
}

// Devuelve el contrato como una lista de párrafos/cláusulas ya
// armados en texto plano. El endpoint que genera el PDF se encarga
// solo de maquetarlos (tamaños, saltos de página, etc.).
//
// Las cláusulas estándar se arman solo si están en
// `clausulasSeleccionadas` (por defecto, todas). La numeración
// (PRIMERA, SEGUNDA, ...) se recalcula según lo que efectivamente
// entra en el documento, para que no queden saltos si se omite una.
// Las `clausulasExtra` (redactadas a mano o con IA) se agregan
// después de las estándar y antes de la de conformidad.
export function generarClausulasContrato(d: DatosContrato): { titulo: string; parrafos: string[] } {
  const seleccion = new Set(d.clausulasSeleccionadas ?? CLAUSULAS_POR_DEFECTO)
  const incluye = (id: ClausulaId) => seleccion.has(id)

  const direccionCompleta = d.propiedadDireccion
    ? `${d.propiedadDireccion} (${d.unidadNombre})`
    : d.unidadNombre

  const ordinales = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA']
  let i = 0
  const siguienteOrdinal = () => ordinales[i++] || `CLÁUSULA ${i}`

  const parrafos: string[] = []

  // La cláusula de partes es estructural: siempre va primero.
  parrafos.push(
    `En la ciudad de _______________, a los ${formatearFecha(d.fechaInicio)}, se suscribe el presente CONTRATO DE ALQUILER entre, de una parte, la familia propietaria del inmueble, representada a efectos de la administración de este espacio por ${d.administradorNombre || '_______________'}, que en adelante se denominará "EL ARRENDADOR"; y de la otra parte, ${d.inquilinoNombre}, portador de Cédula de Identidad N.º ${d.inquilinoCI}${d.inquilinoTelefono ? `, con teléfono de contacto ${d.inquilinoTelefono}` : ''}, que en adelante se denominará "EL INQUILINO", quienes acuerdan celebrar el presente contrato bajo las siguientes cláusulas:`
  )

  if (incluye('objeto')) {
    parrafos.push(
      `${siguienteOrdinal()}. (OBJETO). EL ARRENDADOR da en calidad de alquiler a EL INQUILINO el inmueble ubicado en ${direccionCompleta}, correspondiente a ${d.unidadTipo}, para ser destinado exclusivamente a vivienda${d.unidadTipo === 'local' || d.unidadTipo === 'consultorio' ? ' o actividad comercial/profesional' : ''}, quedando prohibido darle un uso distinto sin autorización escrita de EL ARRENDADOR.`
    )
  }

  if (incluye('canon')) {
    parrafos.push(
      `${siguienteOrdinal()}. (CANON DE ALQUILER). El canon de alquiler mensual se fija de mutuo acuerdo en ${bs(d.montoMensual)} (${d.montoMensual} bolivianos), monto que EL INQUILINO se compromete a cancelar puntualmente el día ${d.diaCobro} de cada mes.`
    )
  }

  if (incluye('anticipo')) {
    parrafos.push(
      d.anticipo
        ? `${siguienteOrdinal()}. (ANTICIPO / GARANTÍA). EL INQUILINO entrega en este acto la suma de ${bs(d.anticipo)} en calidad de anticipo/garantía, monto que será devuelto a la finalización del contrato, previa verificación del estado del inmueble y del cumplimiento de todas las obligaciones asumidas en este documento.`
        : `${siguienteOrdinal()}. (ANTICIPO / GARANTÍA). Las partes dejan constancia de que no se pactó anticipo ni garantía adicional al canon de alquiler mensual establecido en este contrato.`
    )
  }

  if (incluye('plazo')) {
    parrafos.push(
      `${siguienteOrdinal()}. (PLAZO). El presente contrato tiene vigencia a partir del ${formatearFecha(d.fechaInicio)}${
        d.fechaFin ? ` hasta el ${formatearFecha(d.fechaFin)}` : ', con carácter renovable mes a mes salvo aviso previo de cualquiera de las partes con al menos treinta (30) días de anticipación'
      }.`
    )
  }

  if (incluye('obligacionesInquilino')) {
    parrafos.push(
      `${siguienteOrdinal()}. (OBLIGACIONES DE EL INQUILINO). EL INQUILINO se compromete a: a) cancelar puntualmente el canon de alquiler en la fecha pactada; b) usar el inmueble con el cuidado debido, haciéndose responsable de los daños ocasionados por mal uso; c) no realizar modificaciones a la infraestructura sin autorización escrita; d) comunicar oportunamente a EL ARRENDADOR cualquier desperfecto o necesidad de reparación; e) no subarrendar total ni parcialmente el inmueble sin consentimiento expreso.`
    )
  }

  if (incluye('obligacionesArrendador')) {
    parrafos.push(
      `${siguienteOrdinal()}. (OBLIGACIONES DE EL ARRENDADOR). EL ARRENDADOR se compromete a entregar el inmueble en condiciones habitables y a realizar, por su cuenta, las reparaciones estructurales que no sean atribuibles a mal uso de EL INQUILINO, dentro de un plazo razonable desde que sea notificado.`
    )
  }

  if (incluye('rescision')) {
    parrafos.push(
      `${siguienteOrdinal()}. (RESCISIÓN). Cualquiera de las partes podrá dar por concluido el presente contrato antes de su vencimiento, debiendo notificar a la otra parte con una anticipación mínima de treinta (30) días, sin perjuicio de las obligaciones pendientes al momento de la rescisión.`
    )
  }

  // Cláusulas adicionales (manuales o redactadas con IA), cada una
  // numerada correlativamente con las anteriores.
  for (const extra of d.clausulasExtra ?? []) {
    const titulo = extra.titulo?.trim().toUpperCase() || 'CLÁUSULA ADICIONAL'
    parrafos.push(`${siguienteOrdinal()}. (${titulo}). ${extra.texto.trim()}`)
  }

  // La de conformidad/firmas es estructural: siempre va al final.
  parrafos.push(
    `${siguienteOrdinal()}. (CONFORMIDAD). En señal de conformidad con todas y cada una de las cláusulas precedentes, ambas partes firman el presente contrato en dos ejemplares de un mismo tenor y a un solo efecto.`
  )

  return { titulo: 'CONTRATO DE ALQUILER', parrafos }
}
