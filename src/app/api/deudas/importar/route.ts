import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { pedirJsonAGroq, GroqError } from '@/lib/groq'
import { extraerTextoDePDFBase64, PdfTextoError } from '@/lib/pdfTexto'
import { sanearCuotas, extraerCuotasDeTexto } from '@/lib/deudas'

export const dynamic = 'force-dynamic'

// POST { pdfBase64 } — lee un "Documento Privado de Reconocimiento de
// Deuda y Compromiso de Pago" (u otro acuerdo de pago en cuotas) y
// devuelve sus datos para precargar el formulario. No guarda nada.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { pdfBase64 } = await req.json()
    if (!pdfBase64) return NextResponse.json({ error: 'Falta el archivo PDF.' }, { status: 400 })

    let texto: string
    try {
      texto = await extraerTextoDePDFBase64(pdfBase64, 80000)
    } catch (err) {
      if (err instanceof PdfTextoError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }

    const sistema = `Extraés los datos de un documento boliviano de reconocimiento de deuda y compromiso de pago en cuotas. Precisión ante todo: si un dato no está, devolvé null (o "" en textos); no inventes.

Reglas:
- Fechas en formato YYYY-MM-DD ("15 de noviembre de la presente gestión 2026" -> "2026-11-15").
- Montos como número, sin "Bs" ni puntos de miles (Bs. 43.000 -> 43000).
- cuotas: TODAS las cuotas del cronograma, en orden, cada una {"numero": n, "monto": número, "vence": "YYYY-MM-DD"}. No omitas ninguna aunque sean muchas y todas iguales.
- tasaInteresMensual: el porcentaje mensual mencionado como número (3 % -> 3), o null.
- deudor = quien debe; acreedor = a quien se le debe. C.I. solo los dígitos y la extensión (ej. "1096388 Potosí").
- fechaAcuerdo: fecha de firma del documento. lugar: ciudad de firma.
- concepto: de qué es la deuda si se menciona (ej. "alquileres impagos"); si no dice, "".
- garantia: resumen en una línea de la garantía, o "".
- notas: 1-3 líneas con condiciones relevantes (incumplimiento, costas, etc.).
- Respondé SOLO con JSON, sin texto antes ni después, con esta forma exacta:
{"deudorNombre":"","deudorCI":"","deudorDomicilio":"","acreedorNombre":"","acreedorCI":"","montoTotal":null,"tasaInteresMensual":null,"fechaAcuerdo":null,"lugar":"","concepto":"","garantia":"","notas":"","cuotas":[{"numero":1,"monto":0,"vence":""}]}`

    // A la IA le va el texto compactado (sin espacios repetidos).
    const compacto = texto.replace(/\s+/g, ' ').slice(0, 24000)
    const datos = await pedirJsonAGroq<any>(sistema, compacto, 6000)
    // Cuotas: se queda con la lectura más completa entre la IA y el
    // lector por texto (que no se cansa con 40 cuotas iguales).
    const cuotasIA = sanearCuotas(datos?.cuotas)
    const cuotasTexto = extraerCuotasDeTexto(texto)
    const cuotas = cuotasTexto.length >= cuotasIA.length ? cuotasTexto : cuotasIA
    if (!datos?.deudorNombre && cuotas.length === 0) {
      return NextResponse.json({ error: 'No se pudieron leer datos de deuda en este PDF. Revisá que tenga texto seleccionable.' }, { status: 502 })
    }
    return NextResponse.json({
      deudorNombre: datos.deudorNombre || '',
      deudorCI: datos.deudorCI || '',
      deudorDomicilio: datos.deudorDomicilio || '',
      acreedorNombre: datos.acreedorNombre || '',
      acreedorCI: datos.acreedorCI || '',
      montoTotal: typeof datos.montoTotal === 'number' ? datos.montoTotal : Number(datos.montoTotal) || null,
      tasaInteresMensual: datos.tasaInteresMensual === null || datos.tasaInteresMensual === undefined ? null : Number(datos.tasaInteresMensual),
      fechaAcuerdo: datos.fechaAcuerdo || null,
      lugar: datos.lugar || '',
      concepto: datos.concepto || '',
      garantia: datos.garantia || '',
      notas: datos.notas || '',
      cuotas,
    })
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/deudas/importar', err)
    return NextResponse.json({ error: err?.message || 'No se pudo leer el documento.' }, { status: 500 })
  }
}
