// Plantilla del contrato de alquiler. Separada del endpoint que
// genera el PDF para poder ajustar el texto legal sin tocar el
// código de maquetado.
//
// Formato basado en el contrato real de la familia ("CONTRATO PRIVADO
// DE ALQUILER DE DEPARTAMENTO PARA VIVIENDA FAMILIAR", Fortunato Gumiel
// N.° 20, v8): cita el Art. 519 del Código Civil boliviano, usa "LOS
// PROPIETARIOS" / "LOS INQUILINOS" en plural con sub-incisos numerados
// (1.1, 1.2...), canon ESCALONADO por tramos con pago proporcional de
// ingreso, y termina con una firma individual por persona.
//
// Marcado liviano dentro de `cuerpo` (lo interpreta el generador PDF):
//   **texto**   -> negrita
//   salto \n    -> párrafo/inciso nuevo
//   "• " al inicio de un renglón -> viñeta con sangría

import {
  EsquemaPago, Cuota, ResumenPago, calcularPlanDePago, esquemaFijo, formatoBs, MESES, etiquetaMes, fechaCorta,
} from './esquemaPago'
import { montoEnLetras, enteroALetras, ordinalMes } from './numeroALetras'

export type Persona = {
  nombre: string
  ci: string
  // Firma escaneada/fotografiada, ya recortada y con fondo
  // transparente (data URL PNG o JPG). Opcional: si no viene, queda
  // la línea en blanco para firmar a mano.
  firma?: string | null
}

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
  // Canon escalonado (tramos + prorrateo). Si no viene, se arma un
  // canon fijo con montoMensual.
  esquemaPago?: EsquemaPago | null
  anticipo?: number | null
  diaCobro: number
  fechaInicio: string // YYYY-MM-DD
  fechaFin?: string | null
  ciudadFirma?: string
  moraDiaria?: number
  // Agrega al final el ANEXO I con el cronograma mes a mes.
  incluirCronograma?: boolean
  // Administrador (representa a los propietarios a efectos de
  // gestión del espacio; puede o no ser también un propietario
  // firmante).
  administradorNombre: string
  // Checklist de cláusulas: ids de ClausulaId a incluir. Si se omite,
  // se incluyen todas las estándar.
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
  { id: 'canon', numero: 'TERCERA', titulo: 'Canon de alquiler (escalonado, proporcional y modalidad de pago)', obligatoria: false },
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

export function formatearFecha(iso: string) {
  if (!iso) return '____________'
  const [anio, mes, dia] = iso.split('-')
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${anio}`
}

// "Bs. 2.300.- (DOS MIL TRESCIENTOS 00/100 BOLIVIANOS)", en negrita.
function bsLegal(n: number) {
  return `**Bs. ${formatoBs(n, false)}.- (${montoEnLetras(n)})**`
}

function mesesEnTexto(cuotas: Cuota[]) {
  if (cuotas.length === 0) return ''
  const nombres = cuotas.map((c) => MESES[Number(c.mes.split('-')[1]) - 1])
  const anios = Array.from(new Set(cuotas.map((c) => c.mes.split('-')[0])))
  if (cuotas.length <= 4 && anios.length === 1) {
    const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
    return `${cuotas.length === 1 ? 'al mes' : 'a los meses'} de ${lista} de ${anios[0]}`
  }
  const primero = cuotas[0].mes
  const ultimo = cuotas[cuotas.length - 1].mes
  return `desde ${etiquetaMes(primero).toLowerCase()} hasta ${etiquetaMes(ultimo).toLowerCase()}`
}

export type ParrafoContrato = {
  // Encabezado de la cláusula, ej: "CLÁUSULA TERCERA (CANON DE
  // ALQUILER)" — se dibuja en negrita y en color. Vacío para párrafos
  // sin encabezado (como el texto introductorio del contrato).
  encabezado: string
  // Cuerpo, con el marcado liviano descripto arriba.
  cuerpo: string
  // Recuadro destacado a continuación del cuerpo (se usa para el
  // resumen de pago debajo de la cláusula del canon).
  recuadro?: { titulo: string; lineas: string[] }
}

export type ContratoArmado = {
  titulo: string
  subtitulo: string
  referencia: string // para el encabezado de cada página
  parrafos: ParrafoContrato[]
  propietarios: Persona[]
  inquilinos: Persona[]
  cronograma: Cuota[]
  resumen: ResumenPago | null
  incluirCronograma: boolean
  ciudad: string
}

function tituloSegunTipo(tipo: string) {
  const t = (tipo || '').toLowerCase()
  if (t.includes('habit')) return 'CONTRATO PRIVADO DE ALQUILER DE HABITACIÓN PARA VIVIENDA'
  if (t.includes('local')) return 'CONTRATO PRIVADO DE ALQUILER DE LOCAL COMERCIAL'
  if (t.includes('consult')) return 'CONTRATO PRIVADO DE ALQUILER DE CONSULTORIO'
  if (t.includes('depos')) return 'CONTRATO PRIVADO DE ALQUILER DE DEPÓSITO'
  if (t.includes('depart')) return 'CONTRATO PRIVADO DE ALQUILER DE DEPARTAMENTO PARA VIVIENDA FAMILIAR'
  return 'CONTRATO PRIVADO DE ALQUILER'
}

// Devuelve el contrato como una lista de párrafos/cláusulas ya
// armados, más firmantes y cronograma de pagos. El endpoint que genera
// el PDF se encarga solo de maquetarlos.
//
// Las cláusulas estándar se arman solo si están en
// `clausulasSeleccionadas` (por defecto, todas). La numeración
// (PRIMERA, SEGUNDA, ...) se recalcula según lo que efectivamente
// entra en el documento, y los sub-incisos (3.1, 3.2...) siguen el
// número real de cada cláusula.
export function generarClausulasContrato(d: DatosContrato): ContratoArmado {
  const seleccion = new Set(d.clausulasSeleccionadas ?? CLAUSULAS_POR_DEFECTO)
  const incluye = (id: ClausulaId) => seleccion.has(id)
  const ciudad = (d.ciudadFirma || '').trim()
  const ciudadTxt = ciudad || '_______________'

  const propietarios: Persona[] =
    d.propietarios && d.propietarios.length > 0 ? d.propietarios : [{ nombre: d.administradorNombre || '____________', ci: '' }]
  const inquilinos: Persona[] = d.inquilinos && d.inquilinos.length > 0 ? d.inquilinos : [{ nombre: '____________', ci: '' }]

  const direccionCompleta = d.propiedadDireccion ? `${d.propiedadDireccion} (${d.unidadNombre})` : d.unidadNombre

  // Plan de pago: cronograma mes a mes + resumen, a partir del esquema
  // escalonado (o de un canon fijo si no vino esquema).
  const esquema = d.esquemaPago && d.esquemaPago.tramos?.length ? d.esquemaPago : esquemaFijo(Number(d.montoMensual))
  const { cronograma, resumen } = calcularPlanDePago({
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin || null,
    diaCobro: d.diaCobro,
    esquema,
  })
  const moraDiaria = d.moraDiaria && d.moraDiaria > 0 ? d.moraDiaria : 30

  const ordinales = [
    'PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA',
    'DÉCIMA', 'DÉCIMA PRIMERA', 'DÉCIMA SEGUNDA', 'DÉCIMA TERCERA', 'DÉCIMA CUARTA', 'DÉCIMA QUINTA',
    'DÉCIMA SEXTA', 'DÉCIMA SÉPTIMA', 'DÉCIMA OCTAVA', 'DÉCIMA NOVENA', 'VIGÉSIMA',
  ]
  let n = 0
  // Devuelve [encabezado, número] para poder numerar los sub-incisos.
  const clausula = (titulo: string): [string, number] => {
    n++
    return [`CLÁUSULA ${ordinales[n - 1] || n} (${titulo})`, n]
  }

  const parrafos: ParrafoContrato[] = []

  parrafos.push({
    encabezado: '',
    cuerpo: `Conste por el presente **${tituloSegunTipo(d.unidadTipo)}**, el mismo que se celebra al tenor de las siguientes cláusulas y condiciones de obligatorio cumplimiento al amparo del **Art. 519** y concordantes del Código Civil de la República de Bolivia:`,
  })

  // ---- Partes
  {
    const [enc, k] = clausula('PARTES CONTRATANTES')
    const listar = (ps: Persona[], prefijoCI: string) =>
      ps
        .map((p) => `${p.nombre ? `**${p.nombre.toUpperCase()}**` : '____________'}${p.ci ? ` (${prefijoCI} ${p.ci})` : ''}`)
        .join(ps.length === 2 ? ' y ' : ', ')
    const domicilio = ciudad ? `, domiciliados en la ciudad de ${ciudad}` : ''
    parrafos.push({
      encabezado: enc,
      cuerpo:
        `${k}.1. **LOS PROPIETARIOS:** ${listar(propietarios, 'con C.I. N.°')}, mayores de edad, hábiles por derecho${domicilio}, quienes a los efectos del presente contrato se denominarán conjuntamente como **LOS PROPIETARIOS**.\n` +
        `${k}.2. **LOS INQUILINOS:** ${listar(inquilinos, 'titular de la Cédula de Identidad N.°')}, mayores de edad, hábiles por derecho${d.inquilinoTelefono ? `, con teléfono de contacto ${d.inquilinoTelefono}` : ''}${inquilinos.length > 1 ? ', conjuntamente con su núcleo familiar' : ''}, quien(es) en lo sucesivo se denominará(n) simplemente como **LOS INQUILINOS**.`,
    })
  }

  // ---- Objeto
  if (incluye('objeto')) {
    const [enc] = clausula('DESCRIPCIÓN DEL INMUEBLE Y DESTINO')
    parrafos.push({
      encabezado: enc,
      cuerpo: `LOS PROPIETARIOS ceden en calidad de alquiler el inmueble ubicado en **${direccionCompleta}**, correspondiente a ${d.unidadTipo}, el cual se entrega única y exclusivamente para **VIVIENDA FAMILIAR** de LOS INQUILINOS, quedando totalmente prohibido darle uso comercial, subalquilar o ceder el espacio a terceros sin autorización escrita de LOS PROPIETARIOS.`,
    })
  }

  // ---- Canon (escalonado + proporcional + modalidad)
  if (incluye('canon')) {
    const [enc, k] = clausula(esquema.tramos.length > 1 ? 'CANON DE ALQUILER, ESQUEMA ESCALONADO Y MODALIDAD DE PAGO' : 'CANON DE ALQUILER Y MODALIDAD DE PAGO')
    const incisos: string[] = []
    let sub = 0
    const inciso = () => `${k}.${++sub}.`

    const cuotaInicial = cronograma.find((c) => c.tipo === 'proporcional_inicio')
    const cuotaFinal = cronograma.find((c) => c.tipo === 'proporcional_fin')
    const completas = cronograma.filter((c) => c.tipo === 'completa')
    const hayFin = !!d.fechaFin

    if (esquema.tramos.length > 1) {
      const lineasTramos: string[] = []
      let desdeMes = 1
      esquema.tramos.forEach((t, i) => {
        const esUltimo = i === esquema.tramos.length - 1
        const hastaMes = t.meses ? desdeMes + t.meses - 1 : null
        const cuotasTramo = completas.filter((c) => c.tramo === i)
        let etiqueta: string
        if (i === 0 && t.meses) {
          etiqueta = t.meses === 1 ? 'PRIMER MES' : `PRIMEROS ${enteroALetras(t.meses)} (${t.meses}) MESES`
        } else if (esUltimo && (!t.meses || !hayFin)) {
          etiqueta = `A PARTIR DEL ${ordinalMes(desdeMes)} MES Y POR EL RESTO DEL CONTRATO`
        } else if (hastaMes && hastaMes !== desdeMes) {
          etiqueta = `DEL ${ordinalMes(desdeMes)} AL ${ordinalMes(hastaMes).replace(/^PRIMER\b/, 'PRIMERO').replace(/^TERCER\b/, 'TERCERO')} MES`
        } else {
          etiqueta = `${ordinalMes(desdeMes)} MES`
        }
        const detalleMeses = cuotasTramo.length
          ? ` (correspondientes ${mesesEnTexto(cuotasTramo)}${esUltimo && hayFin ? ', hasta la conclusión del contrato' : ''})`
          : ''
        lineasTramos.push(`• **${etiqueta}:** Canon de ${bsLegal(t.monto)} mensuales${detalleMeses}.`)
        if (t.meses) desdeMes += t.meses
      })
      incisos.push(
        `${inciso()} **Esquema Escalonado de Canon de Alquiler:** Las partes convienen libre y voluntariamente el siguiente esquema de canon locativo mensual:\n${lineasTramos.join('\n')}`
      )
    } else {
      incisos.push(
        `${inciso()} **Canon de Alquiler:** Las partes convienen libre y voluntariamente el canon locativo mensual de ${bsLegal(esquema.tramos[0].monto)}${hayFin ? ', invariable durante toda la vigencia del contrato' : ''}.`
      )
    }

    if (cuotaInicial) {
      const diaFinMes = Number(cuotaInicial.mes.split('-')[1])
      const inicioDia = Number(d.fechaInicio.slice(8, 10))
      incisos.push(
        `${inciso()} **Pago Proporcional de Ingreso (del ${inicioDia} al ${inicioDia + (cuotaInicial.dias || 1) - 1} de ${MESES[diaFinMes - 1]} de ${cuotaInicial.mes.slice(0, 4)}):** Al iniciar el contrato el día ${formatearFecha(d.fechaInicio)}, LOS INQUILINOS abonarán a la firma del presente documento el pago proporcional correspondiente a los ${cuotaInicial.dias} días restantes del mes, por la suma de ${bsLegal(cuotaInicial.monto)}, calculado a razón de Bs. ${formatoBs(cuotaInicial.montoMensual / esquema.baseDias, false)}.-/día sobre la base del canon inicial de Bs. ${formatoBs(cuotaInicial.montoMensual, false)}.- (mes comercial de ${esquema.baseDias} días).`
      )
    }

    if (cuotaFinal && d.fechaFin) {
      incisos.push(
        `${inciso()} **Pago Proporcional de Salida (${etiquetaMes(cuotaFinal.mes).toLowerCase()}):** Por concluir el contrato el ${formatearFecha(d.fechaFin)}, el último mes se abonará en forma proporcional a ${cuotaFinal.dias} días de ocupación, por la suma de ${bsLegal(cuotaFinal.monto)}, a razón de Bs. ${formatoBs(cuotaFinal.montoMensual / esquema.baseDias, false)}.-/día.`
      )
    }

    const primerMesCompleto = completas[0]
    const diaCobro = Math.max(1, Number(d.diaCobro) || 1)
    incisos.push(
      `${inciso()} **Días y Modalidad de Pago (Efectivo y Código QR):** ${primerMesCompleto ? `A partir del mes de ${etiquetaMes(primerMesCompleto.mes).toLowerCase()}, e` : 'E'}l canon mensual se pagará **por adelantado dentro de los primeros ${enteroALetras(diaCobro).toLowerCase()} (${diaCobro}) días de cada mes** (es decir, del día 1 al día ${diaCobro} de cada mes). Los pagos podrán realizarse en efectivo o mediante Transferencia Bancaria / Pago por Código QR; en la modalidad digital, LOS INQUILINOS podrán descargar el comprobante de transferencia o confirmación de pago QR como respaldo inmediato.`
    )
    incisos.push(
      `${inciso()} **Costo de Envío / Comisión Bancaria:** El monto acordado del alquiler debe ser recibido neto e íntegro por LOS PROPIETARIOS. En caso de que la transacción por Código QR o transferencia bancaria genere algún costo de envío, comisión o tarifa de servicio interbancario, dicho importe deberá ser asumido en su totalidad por LOS INQUILINOS.`
    )
    if (hayFin && resumen) {
      incisos.push(
        `${inciso()} **Valor Total y Cronograma:** El valor total del contrato por toda su vigencia asciende a ${bsLegal(resumen.total)}, distribuido en ${resumen.cantidadCuotas} pagos${d.incluirCronograma !== false ? ' según el detalle mes a mes del **ANEXO I – CRONOGRAMA DE PAGOS**, que forma parte indivisible del presente contrato' : ''}.`
      )
    } else if (d.incluirCronograma !== false) {
      incisos.push(`${inciso()} **Cronograma:** El detalle de montos y vencimientos se consigna en el **ANEXO I – CRONOGRAMA DE PAGOS**, que forma parte indivisible del presente contrato.`)
    }

    parrafos.push({
      encabezado: enc,
      cuerpo: incisos.join('\n'),
      recuadro: resumen && resumen.lineas.length
        ? {
            titulo: 'RESUMEN DEL PAGO',
            lineas: [
              ...resumen.lineas,
              ...(hayFin ? [`Total del contrato: ${formatoBs(resumen.total)} en ${resumen.cantidadCuotas} pagos.`] : []),
            ],
          }
        : undefined,
    })
  }

  if (incluye('anticipo')) {
    const [enc] = clausula('ANTICIPO / GARANTÍA')
    parrafos.push({
      encabezado: enc,
      cuerpo: d.anticipo
        ? `LOS INQUILINOS entregan en este acto la suma de ${bsLegal(d.anticipo)} en calidad de anticipo/garantía, monto que será devuelto a la finalización del contrato, previa verificación del estado del inmueble y del cumplimiento de todas las obligaciones asumidas en este documento.`
        : `Las partes dejan constancia de que no se pactó anticipo ni garantía adicional al canon de alquiler establecido en este contrato.`,
    })
  }

  if (incluye('plazo')) {
    const [enc, k] = clausula('VIGENCIA, PLAZO Y DEVOLUCIÓN EN LAS MISMAS CONDICIONES')
    parrafos.push({
      encabezado: enc,
      cuerpo:
        `${k}.1. **Plazo:** El presente contrato ${d.fechaFin ? `tendrá vigencia comenzando a regir el **${formatearFecha(d.fechaInicio).toUpperCase()}** y concluyendo de forma impostergable el **${formatearFecha(d.fechaFin).toUpperCase()}**` : `tiene vigencia a partir del **${formatearFecha(d.fechaInicio).toUpperCase()}**, con carácter renovable mes a mes salvo aviso previo de cualquiera de las partes con al menos treinta (30) días de anticipación`}.\n` +
        `${k}.2. **Devolución en las Mismas Condiciones:** Al vencimiento del plazo o en caso de resolución, LOS INQUILINOS se obligan a restituir el inmueble totalmente desocupado, en las mismas condiciones óptimas de habitabilidad, limpieza y conservación en que lo reciben. Cualquier renovación requerirá la suscripción previa de un nuevo acuerdo escrito, negándose expresamente la tácita reconducción.`,
    })
  }

  if (incluye('obligacionesInquilino')) {
    const [enc] = clausula('OBLIGACIONES DE LOS INQUILINOS')
    parrafos.push({
      encabezado: enc,
      cuerpo: `LOS INQUILINOS se comprometen a:\n• a) cancelar puntualmente el canon de alquiler en la fecha pactada;\n• b) usar el inmueble con el cuidado debido, haciéndose responsables de los daños ocasionados por mal uso;\n• c) no realizar modificaciones a la infraestructura sin autorización escrita;\n• d) comunicar oportunamente a LOS PROPIETARIOS cualquier desperfecto o necesidad de reparación;\n• e) no subarrendar total ni parcialmente el inmueble sin consentimiento expreso.`,
    })
  }

  if (incluye('obligacionesArrendador')) {
    const [enc] = clausula('OBLIGACIONES DE LOS PROPIETARIOS')
    parrafos.push({
      encabezado: enc,
      cuerpo: `LOS PROPIETARIOS se comprometen a entregar el inmueble en condiciones habitables y a realizar, por su cuenta, las reparaciones estructurales que no sean atribuibles a mal uso de LOS INQUILINOS, dentro de un plazo razonable desde que sean notificados.`,
    })
  }

  if (incluye('serviciosBasicos')) {
    const [enc, k] = clausula('SERVICIOS BÁSICOS Y MANTENIMIENTO')
    parrafos.push({
      encabezado: enc,
      cuerpo: `${k}.1. **Servicios Básicos:** El pago de los servicios básicos (energía eléctrica, gas natural, agua potable) corre por cuenta de LOS INQUILINOS según medidor propio o prorrateo equitativo entre los ocupantes del inmueble.\n${k}.2. **Mantenimiento:** LOS INQUILINOS se comprometen a realizar las reparaciones menores de uso diario y a mantener el inmueble en perfectas condiciones de higiene y conservación.`,
    })
  }

  if (incluye('mascotas')) {
    const [enc] = clausula('PROHIBICIÓN DE MASCOTAS')
    parrafos.push({
      encabezado: enc,
      cuerpo: `Se establece la **PROHIBICIÓN ABSOLUTA DE TENENCIA, PERMANENCIA O INGRESO DE MASCOTAS** o animales de cualquier especie dentro del inmueble, constituyendo su incumplimiento causal de resolución inmediata del presente contrato.`,
    })
  }

  if (incluye('mora')) {
    const [enc] = clausula('PENALIDAD POR MORA')
    parrafos.push({
      encabezado: enc,
      cuerpo: `El pago realizado después del día ${Math.max(1, Number(d.diaCobro) || 1)} de cada mes generará un recargo sancionatorio de ${bsLegal(moraDiaria)} por cada día de retraso, hasta la cancelación efectiva de la mensualidad adeudada.`,
    })
  }

  if (incluye('resolucionAutomatica')) {
    const [enc, k] = clausula('RESOLUCIÓN AUTOMÁTICA')
    parrafos.push({
      encabezado: enc,
      cuerpo: `${k}.1. El presente contrato quedará resuelto de pleno derecho y en forma automática por cualquiera de las siguientes causales:\n• a) Mora en el pago de dos (2) mensualidades consecutivas de alquiler.\n• b) Incumplimiento de las prohibiciones establecidas en este contrato.\n• c) Provocar daños o deterioros graves al inmueble.\n• d) Subalquilar, ceder a terceros o dar un uso distinto al de vivienda familiar autorizado.`,
    })
  }

  if (incluye('confidencialidad')) {
    const [enc] = clausula('ACUERDO PRIVADO Y CARÁCTER CONFIDENCIAL')
    parrafos.push({
      encabezado: enc,
      cuerpo: `El presente documento constituye un acuerdo estrictamente privado y confidencial celebrado de buena fe entre las partes, surtiendo plena fuerza obligatoria entre las mismas conforme al Art. 519 del Código Civil de la República de Bolivia.`,
    })
  }

  if (incluye('rescision')) {
    const [enc] = clausula('RESCISIÓN ANTICIPADA')
    parrafos.push({
      encabezado: enc,
      cuerpo: `Cualquiera de las partes podrá dar por concluido el presente contrato antes de su vencimiento, debiendo notificar a la otra parte con una anticipación mínima de treinta (30) días, sin perjuicio de las obligaciones pendientes al momento de la rescisión.`,
    })
  }

  for (const extra of d.clausulasExtra ?? []) {
    const titulo = extra.titulo?.trim().toUpperCase() || 'CLÁUSULA ADICIONAL'
    const [enc] = clausula(titulo)
    parrafos.push({ encabezado: enc, cuerpo: extra.texto.trim() })
  }

  {
    const [enc, k] = clausula('CONFORMIDAD Y FIRMAS')
    parrafos.push({
      encabezado: enc,
      cuerpo: `${k}.1. En señal de absoluta conformidad con todas y cada una de las cláusulas estipuladas, las partes firman el presente contrato en la ciudad de ${ciudadTxt}, a los ${Number(d.fechaInicio.slice(8, 10))} días del mes de ${MESES[Number(d.fechaInicio.slice(5, 7)) - 1]} de ${d.fechaInicio.slice(0, 4)}.`,
    })
  }

  const subtitulo = direccionCompleta ? `(Inmueble ${direccionCompleta})` : ''
  const referencia = `Contrato de Alquiler – ${d.propiedadDireccion || d.propiedadNombre || ''}${d.unidadNombre ? ` (${d.unidadNombre})` : ''}`.trim()

  return {
    titulo: tituloSegunTipo(d.unidadTipo),
    subtitulo,
    referencia,
    parrafos,
    propietarios,
    inquilinos,
    cronograma,
    resumen,
    incluirCronograma: d.incluirCronograma !== false && cronograma.length > 0,
    ciudad,
  }
}

export { fechaCorta }
