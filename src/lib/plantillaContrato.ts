// Plantilla del contrato de alquiler. Separada del endpoint que
// genera el PDF para poder ajustar el texto legal sin tocar el
// código de maquetado.
//
// Formato basado en un contrato real de la familia ("CONTRATO PRIVADO
// DE ALQUILER DE DEPARTAMENTO PARA VIVIENDA FAMILIAR", Potosí): cita
// el Art. 519 del Código Civil boliviano, usa "LOS PROPIETARIOS" /
// "LOS INQUILINOS" en plural con sub-incisos numerados (1.1, 1.2...)
// para cada firmante, y termina con una firma individual por persona
// (línea + nombre + C.I. + rol), no una sola firma por parte.

export type Persona = { nombre: string; ci: string }

export type DatosContrato = {
  // Propiedad / unidad
  propiedadNombre: string
  propiedadDireccion: string
  unidadNombre: string
  unidadTipo: string
  // Propietarios (firmantes del lado de la familia). Si viene vacío,
  // se usa administradorNombre como único propietario, sin C.I.
  propietarios?: Persona[]
  // Inquilinos (firmantes del lado de quien alquila). Al menos uno.
  inquilinos: Persona[]
  inquilinoTelefono?: string
  inquilinoDireccionAnterior?: string
  // Condiciones
  montoMensual: number
  anticipo?: number | null
  diaCobro: number
  fechaInicio: string // YYYY-MM-DD
  fechaFin?: string | null
  // Administrador (representa a los propietarios a efectos de
  // gestión del espacio; puede o no ser también un propietario
  // firmante).
  administradorNombre: string
  // Checklist de cláusulas: ids de ClausulaId a incluir. Si se omite,
  // se incluyen todas las estándar (comportamiento previo).
  clausulasSeleccionadas?: string[]
  // Cláusulas adicionales redactadas a mano o con ayuda de IA
  // (ver /api/redactar-clausula), se agregan al final antes de la
  // cláusula de conformidad/firmas.
  clausulasExtra?: { titulo: string; texto: string }[]
}

// Catálogo de cláusulas estándar. Cada una es opcional salvo 'partes'
// y 'conformidad', que son estructurales.
export const CLAUSULAS_DISPONIBLES = [
  { id: 'partes', numero: '', titulo: 'Partes contratantes', obligatoria: true },
  { id: 'objeto', numero: 'SEGUNDA', titulo: 'Descripción del inmueble', obligatoria: false },
  { id: 'canon', numero: 'TERCERA', titulo: 'Canon de alquiler', obligatoria: false },
  { id: 'anticipo', numero: 'CUARTA', titulo: 'Anticipo / garantía', obligatoria: false },
  { id: 'plazo', numero: 'QUINTA', titulo: 'Plazo y devolución en las mismas condiciones', obligatoria: false },
  { id: 'obligacionesInquilino', numero: 'SEXTA', titulo: 'Obligaciones del inquilino', obligatoria: false },
  { id: 'obligacionesArrendador', numero: 'SÉPTIMA', titulo: 'Obligaciones del arrendador', obligatoria: false },
  { id: 'serviciosBasicos', numero: 'OCTAVA', titulo: 'Servicios básicos y mantenimiento', obligatoria: false },
  { id: 'mascotas', numero: 'NOVENA', titulo: 'Prohibición de mascotas', obligatoria: false },
  { id: 'mora', numero: 'DÉCIMA', titulo: 'Penalidad por mora', obligatoria: false },
  { id: 'resolucionAutomatica', numero: 'DÉCIMA PRIMERA', titulo: 'Resolución automática (causales)', obligatoria: false },
  { id: 'confidencialidad', numero: 'DÉCIMA SEGUNDA', titulo: 'Carácter privado y confidencial', obligatoria: false },
  { id: 'rescision', numero: 'DÉCIMA TERCERA', titulo: 'Rescisión anticipada', obligatoria: false },
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
// armados en texto plano, más las listas de firmantes para el bloque
// de firmas. El endpoint que genera el PDF se encarga solo de
// maquetarlos (tamaños, saltos de página, líneas de firma, etc.).
//
// Las cláusulas estándar se arman solo si están en
// `clausulasSeleccionadas` (por defecto, todas). La numeración
// (PRIMERA, SEGUNDA, ...) se recalcula según lo que efectivamente
// entra en el documento, para que no queden saltos si se omite una.
// Las `clausulasExtra` (redactadas a mano, con IA, o tomadas de una
// plantilla propia) se agregan después de las estándar y antes de la
// de conformidad.
export function generarClausulasContrato(d: DatosContrato): {
  titulo: string
  parrafos: string[]
  propietarios: Persona[]
  inquilinos: Persona[]
} {
  const seleccion = new Set(d.clausulasSeleccionadas ?? CLAUSULAS_POR_DEFECTO)
  const incluye = (id: ClausulaId) => seleccion.has(id)

  const propietarios: Persona[] =
    d.propietarios && d.propietarios.length > 0 ? d.propietarios : [{ nombre: d.administradorNombre || '____________', ci: '' }]
  const inquilinos: Persona[] = d.inquilinos && d.inquilinos.length > 0 ? d.inquilinos : [{ nombre: '____________', ci: '' }]

  const direccionCompleta = d.propiedadDireccion
    ? `${d.propiedadDireccion} (${d.unidadNombre})`
    : d.unidadNombre

  const ordinales = [
    'PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA',
    'DÉCIMA', 'DÉCIMA PRIMERA', 'DÉCIMA SEGUNDA', 'DÉCIMA TERCERA', 'DÉCIMA CUARTA', 'DÉCIMA QUINTA',
  ]
  let i = 0
  const siguienteOrdinal = () => ordinales[i++] || `CLÁUSULA ${i}`

  const parrafos: string[] = []

  // Encabezado con referencia legal — estructural, siempre va.
  parrafos.push(
    `Conste por el presente CONTRATO PRIVADO DE ALQUILER, el mismo que se celebra al tenor de las siguientes cláusulas y condiciones de obligatorio cumplimiento al amparo del Art. 519 y concordantes del Código Civil de la República de Bolivia.`
  )

  // Cláusula de partes: siempre estructural, con sub-incisos por
  // cada propietario e inquilino (1.1, 1.2, ...).
  const ordinalPartes = siguienteOrdinal()
  const propietariosTexto = propietarios
    .map((p) => (p.ci ? `${p.nombre} (con C.I. N.° ${p.ci})` : p.nombre))
    .join(', ')
  const inquilinosTexto = inquilinos
    .map((p) => (p.ci ? `${p.nombre} (titular de la Cédula de Identidad N.° ${p.ci})` : p.nombre))
    .join(', ')
  parrafos.push(
    `${ordinalPartes} (PARTES CONTRATANTES). 1.1. LOS PROPIETARIOS: ${propietariosTexto}, mayores de edad, hábiles por derecho, quienes a los efectos del presente contrato se denominarán conjuntamente como LOS PROPIETARIOS. 1.2. LOS INQUILINOS: ${inquilinosTexto}, mayores de edad, hábiles por derecho${d.inquilinoTelefono ? `, con teléfono de contacto ${d.inquilinoTelefono}` : ''}, quien(es) en lo sucesivo se denominará(n) simplemente como LOS INQUILINOS. Se suscribe el presente contrato en la ciudad de _______________, a los ${formatearFecha(d.fechaInicio)}.`
  )

  if (incluye('objeto')) {
    parrafos.push(
      `${siguienteOrdinal()}. (DESCRIPCIÓN DEL INMUEBLE). LOS PROPIETARIOS ceden en calidad de alquiler el inmueble ubicado en ${direccionCompleta}, correspondiente a ${d.unidadTipo}, el cual se entrega única y exclusivamente para VIVIENDA FAMILIAR de LOS INQUILINOS, quedando totalmente prohibido darle uso comercial, subalquilar o ceder el espacio a terceros sin autorización escrita de LOS PROPIETARIOS.`
    )
  }

  if (incluye('canon')) {
    parrafos.push(
      `${siguienteOrdinal()}. (CANON DE ALQUILER). Las partes convienen libre y voluntariamente el canon locativo mensual de ${bs(d.montoMensual)} (${d.montoMensual} bolivianos), que LOS INQUILINOS se comprometen a cancelar puntualmente dentro de los primeros ${d.diaCobro} días de cada mes, en efectivo o mediante transferencia bancaria / código QR. En caso de que la transacción digital genere algún costo de envío o comisión, dicho importe deberá ser asumido en su totalidad por LOS INQUILINOS.`
    )
  }

  if (incluye('anticipo')) {
    parrafos.push(
      d.anticipo
        ? `${siguienteOrdinal()}. (ANTICIPO / GARANTÍA). LOS INQUILINOS entregan en este acto la suma de ${bs(d.anticipo)} en calidad de anticipo/garantía, monto que será devuelto a la finalización del contrato, previa verificación del estado del inmueble y del cumplimiento de todas las obligaciones asumidas en este documento.`
        : `${siguienteOrdinal()}. (ANTICIPO / GARANTÍA). Las partes dejan constancia de que no se pactó anticipo ni garantía adicional al canon de alquiler mensual establecido en este contrato.`
    )
  }

  if (incluye('plazo')) {
    parrafos.push(
      `${siguienteOrdinal()}. (PLAZO Y DEVOLUCIÓN). El presente contrato tiene vigencia a partir del ${formatearFecha(d.fechaInicio)}${
        d.fechaFin ? ` hasta el ${formatearFecha(d.fechaFin)}, de forma impostergable` : ', con carácter renovable mes a mes salvo aviso previo de cualquiera de las partes con al menos treinta (30) días de anticipación'
      }. Al vencimiento del plazo o en caso de resolución, LOS INQUILINOS se obligan a restituir el inmueble totalmente desocupado, en las mismas condiciones óptimas de habitabilidad, limpieza y conservación en que lo reciben. Cualquier renovación requerirá la suscripción previa de un nuevo acuerdo escrito, negándose expresamente la tácita reconducción.`
    )
  }

  if (incluye('obligacionesInquilino')) {
    parrafos.push(
      `${siguienteOrdinal()}. (OBLIGACIONES DE LOS INQUILINOS). LOS INQUILINOS se comprometen a: a) cancelar puntualmente el canon de alquiler en la fecha pactada; b) usar el inmueble con el cuidado debido, haciéndose responsables de los daños ocasionados por mal uso; c) no realizar modificaciones a la infraestructura sin autorización escrita; d) comunicar oportunamente a LOS PROPIETARIOS cualquier desperfecto o necesidad de reparación; e) no subarrendar total ni parcialmente el inmueble sin consentimiento expreso.`
    )
  }

  if (incluye('obligacionesArrendador')) {
    parrafos.push(
      `${siguienteOrdinal()}. (OBLIGACIONES DE LOS PROPIETARIOS). LOS PROPIETARIOS se comprometen a entregar el inmueble en condiciones habitables y a realizar, por su cuenta, las reparaciones estructurales que no sean atribuibles a mal uso de LOS INQUILINOS, dentro de un plazo razonable desde que sean notificados.`
    )
  }

  if (incluye('serviciosBasicos')) {
    parrafos.push(
      `${siguienteOrdinal()}. (SERVICIOS BÁSICOS Y MANTENIMIENTO). El pago de los servicios básicos (energía eléctrica, gas natural, agua potable) corre por cuenta de LOS INQUILINOS según medidor propio o prorrateo equitativo entre los ocupantes del inmueble. LOS INQUILINOS se comprometen a realizar las reparaciones menores de uso diario y a mantener el inmueble en perfectas condiciones de higiene y conservación.`
    )
  }

  if (incluye('mascotas')) {
    parrafos.push(
      `${siguienteOrdinal()}. (PROHIBICIÓN DE MASCOTAS). Se establece la prohibición absoluta de tenencia, permanencia o ingreso de mascotas o animales de cualquier especie dentro del inmueble, constituyendo su incumplimiento causal de resolución inmediata del presente contrato.`
    )
  }

  if (incluye('mora')) {
    parrafos.push(
      `${siguienteOrdinal()}. (PENALIDAD POR MORA). El pago del canon de alquiler realizado después de la fecha pactada generará un recargo sancionatorio de Bs 30.- (treinta bolivianos) por cada día de retraso, hasta la cancelación efectiva de la mensualidad adeudada.`
    )
  }

  if (incluye('resolucionAutomatica')) {
    parrafos.push(
      `${siguienteOrdinal()}. (RESOLUCIÓN AUTOMÁTICA). El presente contrato quedará resuelto de pleno derecho y en forma automática por cualquiera de las siguientes causales: a) mora en el pago de dos (2) mensualidades consecutivas de alquiler; b) incumplimiento de las prohibiciones establecidas en este contrato; c) provocar daños o deterioros graves al inmueble; d) subalquilar, ceder a terceros o dar un uso distinto al de vivienda familiar autorizado.`
    )
  }

  if (incluye('confidencialidad')) {
    parrafos.push(
      `${siguienteOrdinal()}. (CARÁCTER PRIVADO Y CONFIDENCIAL). El presente documento constituye un acuerdo estrictamente privado y confidencial celebrado de buena fe entre las partes, surtiendo plena fuerza obligatoria entre las mismas conforme al Art. 519 del Código Civil de la República de Bolivia.`
    )
  }

  if (incluye('rescision')) {
    parrafos.push(
      `${siguienteOrdinal()}. (RESCISIÓN). Cualquiera de las partes podrá dar por concluido el presente contrato antes de su vencimiento, debiendo notificar a la otra parte con una anticipación mínima de treinta (30) días, sin perjuicio de las obligaciones pendientes al momento de la rescisión.`
    )
  }

  // Cláusulas adicionales (manuales, IA, o tomadas de una plantilla
  // propia), cada una numerada correlativamente con las anteriores.
  for (const extra of d.clausulasExtra ?? []) {
    const titulo = extra.titulo?.trim().toUpperCase() || 'CLÁUSULA ADICIONAL'
    parrafos.push(`${siguienteOrdinal()}. (${titulo}). ${extra.texto.trim()}`)
  }

  // La de conformidad/firmas es estructural: siempre va al final.
  parrafos.push(
    `${siguienteOrdinal()}. (CONFORMIDAD Y FIRMAS). En señal de absoluta conformidad con todas y cada una de las cláusulas estipuladas, las partes firman el presente contrato en la ciudad de _______________, a los ${formatearFecha(d.fechaInicio)}.`
  )

  return { titulo: 'CONTRATO PRIVADO DE ALQUILER', parrafos, propietarios, inquilinos }
}
