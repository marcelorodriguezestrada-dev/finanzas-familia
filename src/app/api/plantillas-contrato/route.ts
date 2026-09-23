import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado, getDb } from '@/lib/firebaseAdmin'
import { pedirJsonAGroq, GroqError } from '@/lib/groq'
import { extraerTextoDePDFBase64, PdfTextoError } from '@/lib/pdfTexto'

export const dynamic = 'force-dynamic'

// GET — lista las plantillas de contrato subidas, más recientes primero.
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const snap = await getDb().collection('plantillasContrato').orderBy('creadoEn', 'desc').get()
    const plantillas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return NextResponse.json({ plantillas })
  } catch (err: any) {
    console.error('GET /api/plantillas-contrato', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron cargar las plantillas.' }, { status: 500 })
  }
}

// POST { nombre: string, pdfBase64: string, pdfUrl?: string }
//
// Recibe un PDF de contrato ya subido (pdfUrl, del flujo existente en
// /api/subir-pdf) más su contenido en base64 para poder leerlo acá,
// le extrae el texto, y le pide a la IA que identifique y separe sus
// cláusulas. Guarda todo en Firestore como una plantilla reutilizable.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { nombre, pdfBase64, pdfUrl } = (await req.json()) as { nombre?: string; pdfBase64?: string; pdfUrl?: string }
    if (!pdfBase64) {
      return NextResponse.json({ error: 'Falta el archivo PDF.' }, { status: 400 })
    }

    let textoRecortado: string
    try {
      textoRecortado = await extraerTextoDePDFBase64(pdfBase64)
    } catch (err) {
      if (err instanceof PdfTextoError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }

    const systemPrompt = `Analizás contratos de alquiler de vivienda en Bolivia. Se te da el texto completo (o parcial) de un contrato real. Tu trabajo es identificar sus cláusulas y devolverlas separadas, cada una con un título corto y su texto completo tal como aparece en el documento (podés limpiar saltos de línea raros de la extracción, pero no reescribas el contenido).

Reglas:
- Ignorá encabezados, membretes, numeración de página y firmas — solo cláusulas de fondo (objeto, canon, plazo, obligaciones, garantías, rescisión, etc.).
- Si una cláusula del documento no tiene título propio, ponele uno corto vos mismo (2-5 palabras, mayúsculas).
- Máximo 12 cláusulas. Si el documento tiene más, elegí las más relevantes/sustanciales.
- Respondé SOLO con un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"clausulas": [{"titulo": "TÍTULO CORTO", "texto": "texto completo de la cláusula"}]}`

    const resultado = await pedirJsonAGroq<{ clausulas?: { titulo: string; texto: string }[] }>(
      systemPrompt,
      textoRecortado,
      4000
    )

    const clausulas = (resultado.clausulas || []).filter((c) => c?.texto?.trim())
    if (clausulas.length === 0) {
      return NextResponse.json({ error: 'La IA no pudo identificar cláusulas en este PDF. Probá con otro documento.' }, { status: 502 })
    }

    const doc = await getDb().collection('plantillasContrato').add({
      nombre: nombre?.trim() || 'Contrato sin nombre',
      pdfUrl: pdfUrl || null,
      clausulas,
      creadoEn: new Date().toISOString(),
    })

    return NextResponse.json({ id: doc.id, nombre: nombre?.trim() || 'Contrato sin nombre', clausulas })
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/plantillas-contrato', err)
    return NextResponse.json({ error: err?.message || 'No se pudo procesar el PDF.' }, { status: 500 })
  }
}
