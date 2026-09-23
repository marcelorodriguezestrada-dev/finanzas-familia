import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
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
}

// POST { pdfBase64: string }
//
// Lee un contrato de alquiler viejo ya firmado (en PDF, con texto
// seleccionable) y le pide a la IA que extraiga los datos concretos
// del alquiler (inquilinos, propietarios, montos, fechas, y qué
// cláusulas especiales tenía), para precargar el formulario de
// "Nuevo alquiler" y ahorrar la carga manual. No guarda nada — es
// solo lectura puntual; el usuario revisa y confirma todo antes de
// guardar el alquiler.
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

    const systemPrompt = `Extraés los datos concretos de un contrato de alquiler de vivienda ya firmado en Bolivia, a partir de su texto. El objetivo es precargar un formulario, así que priorizá precisión: si un dato no aparece claramente en el texto, devolvé null en vez de inventarlo.

Reglas:
- Fechas siempre en formato YYYY-MM-DD. Si el contrato dice "20 de septiembre de 2026", devolvé "2026-09-20".
- Montos como número (sin "Bs", sin puntos de miles, sin texto). Si hay un esquema de canon escalonado (distinto monto en distintos meses), devolvé el PRIMER monto mensual pactado en montoMensual.
- diaCobro es el día del mes límite para pagar (ej: si dice "dentro de los primeros 5 días", diaCobro es 5).
- inquilinos y propietarios: un objeto por persona con nombre completo y número de C.I. (sin puntos ni la palabra "N°"). Si no hay C.I. visible para alguien, poné ci: "".
- clausulasDetectadas: de esta lista de temas posibles, incluí SOLO los ids cuyo tema efectivamente aparece mencionado en el contrato:
${listaClausulasDetectables}
- direccionMencionada: la dirección o referencia del inmueble tal como aparece en el texto (para mostrársela al usuario como ayuda, no se usa para nada automático).
- Respondé SOLO con un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"inquilinos": [{"nombre": "", "ci": ""}], "propietarios": [{"nombre": "", "ci": ""}], "inquilinoTelefono": null, "montoMensual": null, "anticipo": null, "diaCobro": null, "fechaInicio": null, "fechaFin": null, "clausulasDetectadas": [], "direccionMencionada": null}`

    const datos = await pedirJsonAGroq<DatosImportados>(systemPrompt, texto, 1500)

    // Saneo mínimo: nunca devolver arrays undefined, y filtrar ids de
    // cláusulas que no existan en el catálogo actual (por si la IA
    // inventa alguno).
    const idsValidos = new Set(IDS_CLAUSULAS_DETECTABLES as string[])
    const resultado: DatosImportados = {
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
    }

    if (resultado.inquilinos.length === 0 && !resultado.montoMensual && !resultado.fechaInicio) {
      return NextResponse.json(
        { error: 'No se pudieron extraer datos reconocibles de este PDF. Revisá que sea un contrato de alquiler y que tenga texto legible.' },
        { status: 502 }
      )
    }

    return NextResponse.json(resultado)
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/importar-contrato', err)
    return NextResponse.json({ error: err?.message || 'No se pudo importar el contrato.' }, { status: 500 })
  }
}
