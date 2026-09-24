import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado, getDb } from '@/lib/firebaseAdmin'
import { pedirJsonAGroq, GroqError } from '@/lib/groq'
import { extraerTextoDePDFBase64, PdfTextoError } from '@/lib/pdfTexto'
import { CLAUSULAS_DISPONIBLES } from '@/lib/plantillaContrato'

export const dynamic = 'force-dynamic'

// IDs de cláusulas del checklist que tiene sentido que la IA marque
// automáticamente si detecta ese tema en el contrato viejo (se
// excluyen las estructurales 'partes' y 'conformidad', que siempre
// van, y no se le pide adivinar sobre ellas).
const IDS_CLAUSULAS_DETECTABLES = CLAUSULAS_DISPONIBLES.filter((c) => !c.obligatoria).map((c) => c.id)

type DatosImportados = {
  inquilinos: { nombre: string; ci: string }[]
  propietarios: { nombre: string; ci: string }[]
  inquilinoTelefono: string | null
  montoMensual: number | null
  anticipo: number | null
  diaCobro: number | null
  fechaInicio: string | null // YYYY-MM-DD
  fechaFin: string | null
  clausulasDetectadas: string[]
  direccionMencionada: string | null
  // Aviso en texto libre para condiciones que el formulario actual no
  // soporta como campo propio (ej. canon escalonado por meses,
  // comisión bancaria, prorrateo de servicios) — para no perder esa
  // información silenciosamente, se muestra como nota al usuario en
  // vez de forzarla en un campo que no le corresponde.
  notasAdicionales: string | null
  nombrePlantillaSugerido: string | null
}

// POST { pdfBase64: string }
//
// Lee un contrato de alquiler viejo ya firmado (en PDF, con texto
// seleccionable) y hace dos cosas:
//
// 1) Le pide a la IA los datos concretos del alquiler (inquilinos,
//    propietarios, montos, fechas, cláusulas detectadas) para
//    precargar el formulario de "Nuevo alquiler" — no guarda nada de
//    esto, el usuario revisa y confirma antes de guardar el alquiler.
//
// 2) Además, extrae las cláusulas reales de ESE contrato (igual que
//    /api/plantillas-contrato) y las guarda como una plantilla nueva
//    reutilizable, para que sus cláusulas propias (redactadas tal
//    como estaban, no genéricas) queden disponibles como checklist en
//    futuros contratos y como referencia de estilo para la redacción
//    con IA — así el sistema se retroalimenta con cada contrato viejo
//    que se importa.
//
// A propósito NO intenta adivinar a qué propiedad/unidad de las ya
// cargadas en el sistema corresponde: el usuario la elige a mano
// (ver conversación — es más seguro que dejarlo librado a un match
// automático por texto libre).
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { pdfBase64 } = (await req.json()) as { pdfBase64?: string }
    if (!pdfBase64) {
      return NextResponse.json({ error: 'Falta el archivo PDF.' }, { status: 400 })
    }

    let texto: string
    try {
      texto = await extraerTextoDePDFBase64(pdfBase64)
    } catch (err) {
      if (err instanceof PdfTextoError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }

    const listaClausulasDetectables = IDS_CLAUSULAS_DETECTABLES.map((id) => {
      const c = CLAUSULAS_DISPONIBLES.find((x) => x.id === id)!
      return `- "${id}": ${c.titulo}`
    }).join('\n')

    const systemPromptDatos = `Extraés los datos concretos de un contrato de alquiler de vivienda ya firmado en Bolivia, a partir de su texto. El objetivo es precargar un formulario, así que priorizá precisión: si un dato no aparece claramente en el texto, devolvé null en vez de inventarlo. Extraé TODO lo que puedas, no dejes campos vacíos si el dato está en el texto aunque sea de forma indirecta.

Reglas:
- Fechas siempre en formato YYYY-MM-DD. Si el contrato dice "20 de septiembre de 2026", devolvé "2026-09-20".
- Montos como número (sin "Bs", sin puntos de miles, sin texto). Si hay un esquema de canon ESCALONADO (distinto monto en distintos meses) o cualquier otra condición de pago que no sea un monto fijo simple, devolvé en montoMensual el PRIMER monto mensual pactado, y describí el esquema completo (todos los tramos, con sus fechas o meses) en notasAdicionales para que el usuario lo vea y decida cómo manejarlo.
- diaCobro es el día del mes límite para pagar (ej: si dice "dentro de los primeros 5 días", diaCobro es 5).
- inquilinos y propietarios: un objeto por persona con nombre completo y número de C.I. (sin puntos ni la palabra "N°"). Si no hay C.I. visible para alguien, poné ci: "". Incluí a TODAS las personas mencionadas de cada lado, no solo la primera.
- clausulasDetectadas: de esta lista de temas posibles, incluí SOLO los ids cuyo tema efectivamente aparece mencionado en el contrato:
${listaClausulasDetectables}
- direccionMencionada: la dirección o referencia del inmueble tal como aparece en el texto.
- notasAdicionales: cualquier condición relevante que no encaje en los campos anteriores (esquemas de pago escalonados o proporcionales, comisiones bancarias, prorrateo de servicios, muebles en custodia, restricciones de acceso, etc.), resumida en 2-4 líneas. null si no hay nada así de particular.
- nombrePlantillaSugerido: un nombre corto (3-6 palabras) para identificar este contrato como plantilla reutilizable, ej. "Contrato vivienda familiar Potosí".
- Respondé SOLO con un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"inquilinos": [{"nombre": "", "ci": ""}], "propietarios": [{"nombre": "", "ci": ""}], "inquilinoTelefono": null, "montoMensual": null, "anticipo": null, "diaCobro": null, "fechaInicio": null, "fechaFin": null, "clausulasDetectadas": [], "direccionMencionada": null, "notasAdicionales": null, "nombrePlantillaSugerido": null}`

    const systemPromptClausulas = `Analizás contratos de alquiler de vivienda en Bolivia. Se te da el texto completo (o parcial) de un contrato real. Tu trabajo es identificar sus cláusulas y devolverlas separadas, cada una con un título corto y su texto completo tal como aparece en el documento (podés limpiar saltos de línea raros de la extracción, pero no reescribas el contenido).

Reglas:
- Ignorá encabezados, membretes, numeración de página y firmas — solo cláusulas de fondo (objeto, canon, plazo, obligaciones, garantías, rescisión, etc.).
- Si una cláusula del documento no tiene título propio, ponele uno corto vos mismo (2-5 palabras, mayúsculas).
- Máximo 12 cláusulas. Si el documento tiene más, elegí las más relevantes/sustanciales.
- Respondé SOLO con un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"clausulas": [{"titulo": "TÍTULO CORTO", "texto": "texto completo de la cláusula"}]}`

    // Las dos extracciones son independientes entre sí, así que van en
    // paralelo para no duplicar el tiempo de espera.
    const [datos, resultadoClausulas] = await Promise.all([
      pedirJsonAGroq<DatosImportados>(systemPromptDatos, texto, 2000),
      pedirJsonAGroq<{ clausulas?: { titulo: string; texto: string }[] }>(systemPromptClausulas, texto, 4000),
    ])

    // Saneo mínimo: nunca devolver arrays undefined, y filtrar ids de
    // cláusulas que no existan en el catálogo actual (por si la IA
    // inventa alguno).
    const idsValidos = new Set(IDS_CLAUSULAS_DETECTABLES as string[])
    const resultado: DatosImportados & { plantillaId?: string; plantillaNombre?: string; plantillaClausulas?: { titulo: string; texto: string }[] } = {
      inquilinos: (datos.inquilinos || []).filter((p) => p?.nombre?.trim()),
      propietarios: (datos.propietarios || []).filter((p) => p?.nombre?.trim()),
      inquilinoTelefono: datos.inquilinoTelefono || null,
      montoMensual: typeof datos.montoMensual === 'number' ? datos.montoMensual : null,
      anticipo: typeof datos.anticipo === 'number' ? datos.anticipo : null,
      diaCobro: typeof datos.diaCobro === 'number' ? datos.diaCobro : null,
      fechaInicio: datos.fechaInicio || null,
      fechaFin: datos.fechaFin || null,
      clausulasDetectadas: (datos.clausulasDetectadas || []).filter((id) => idsValidos.has(id)),
      direccionMencionada: datos.direccionMencionada || null,
      notasAdicionales: datos.notasAdicionales || null,
      nombrePlantillaSugerido: datos.nombrePlantillaSugerido || null,
    }

    if (resultado.inquilinos.length === 0 && !resultado.montoMensual && !resultado.fechaInicio) {
      return NextResponse.json(
        { error: 'No se pudieron extraer datos reconocibles de este PDF. Revisá que sea un contrato de alquiler y que tenga texto legible.' },
        { status: 502 }
      )
    }

    // Se guarda automáticamente como plantilla reutilizable, con las
    // cláusulas reales de este contrato (no genéricas), para que el
    // sistema se retroalimente: cada contrato viejo que se importa
    // queda disponible como checklist y como referencia de estilo
    // para redactar cláusulas nuevas con IA en el futuro.
    const clausulasPlantilla = (resultadoClausulas.clausulas || []).filter((c) => c?.texto?.trim())
    if (clausulasPlantilla.length > 0) {
      const nombrePlantilla = resultado.nombrePlantillaSugerido || `Contrato importado ${new Date().toLocaleDateString('es-BO')}`
      const doc = await getDb().collection('plantillasContrato').add({
        nombre: nombrePlantilla,
        pdfUrl: null,
        clausulas: clausulasPlantilla,
        creadoEn: new Date().toISOString(),
        origen: 'importacion-alquiler',
      })
      resultado.plantillaId = doc.id
      resultado.plantillaNombre = nombrePlantilla
      resultado.plantillaClausulas = clausulasPlantilla
    }

    return NextResponse.json(resultado)
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/importar-contrato', err)
    return NextResponse.json({ error: err?.message || 'No se pudo importar el contrato.' }, { status: 500 })
  }
}
