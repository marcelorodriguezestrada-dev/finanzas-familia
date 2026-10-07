import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { pedirJsonAGroq, GroqError } from '@/lib/groq'
import { extraerTextoDePDFBase64, PdfTextoError } from '@/lib/pdfTexto'
import { leerLiquidacionExpensas, sanearVencimientos, sanearConceptos } from '@/lib/pendientes'

export const dynamic = 'force-dynamic'

// POST { pdfBase64 } — lee una liquidación de expensas (o una factura
// de servicio con vencimientos) y devuelve los datos para precargar el
// formulario. Primero prueba el lector exacto del formato AdminProp /
// Mis Expensas; si no es ese formato, usa la IA. No guarda nada.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { pdfBase64 } = await req.json()
    if (!pdfBase64) return NextResponse.json({ error: 'Falta el archivo PDF.' }, { status: 400 })
    let texto: string
    try {
      texto = await extraerTextoDePDFBase64(pdfBase64, 60000)
    } catch (err) {
      if (err instanceof PdfTextoError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }

    const exacta = leerLiquidacionExpensas(texto)
    if (exacta) {
      return NextResponse.json({
        origen: 'lector',
        categoria: 'Expensas',
        titulo: `Expensas ${exacta.periodo ? `${Number(exacta.periodo.slice(5))}/${exacta.periodo.slice(0, 4)}` : ''}${exacta.unidad ? ` — ${exacta.unidad}` : ''}`.trim(),
        ...exacta,
      })
    }

    const sistema = `Extraés los datos de un comprobante a pagar (liquidación de expensas, factura de servicio, impuesto) de Argentina o Bolivia. No inventes: si un dato no está, null o "".
- Fechas YYYY-MM-DD. Montos como número (377.459,34 -> 377459.34).
- vencimientos: cada fecha de vencimiento con su monto, en orden, [{"fecha":"","monto":0,"recargo":null}] (recargo = % si se indica).
- conceptos: renglones de lo que compone el total [{"concepto":"","detalle":"","monto":0}].
- periodo: mes liquidado "YYYY-MM".
- categoria: "Expensas", "Servicios (luz, agua, gas, internet)", "Impuestos" u "Otro".
- unidad: piso/departamento si figura (ej "7-B"). proveedor: quien cobra.
- interesMora: monto cobrado por intereses/mora, o 0.
Respondé SOLO JSON: {"titulo":"","categoria":"","periodo":null,"proveedor":"","unidad":"","edificio":"","total":null,"vencimientos":[],"conceptos":[],"pagoProveedor":{"titular":"","banco":"","cbu":"","alias":""},"interesMora":0}`
    const d = await pedirJsonAGroq<any>(sistema, texto.replace(/\s+/g, ' ').slice(0, 14000), 2500)
    const vencimientos = sanearVencimientos(d?.vencimientos)
    if (!vencimientos.length) {
      return NextResponse.json({ error: 'No se encontraron vencimientos en el PDF. Cargalos a mano.' }, { status: 502 })
    }
    return NextResponse.json({
      origen: 'ia',
      titulo: d.titulo || '',
      categoria: d.categoria || 'Otro',
      periodo: /^\d{4}-\d{2}$/.test(d.periodo || '') ? d.periodo : null,
      proveedor: d.proveedor || '',
      unidad: d.unidad || '',
      edificio: d.edificio || '',
      total: Number(d.total) || vencimientos[0].monto,
      vencimientos,
      conceptos: sanearConceptos(d.conceptos),
      pagoProveedor: d.pagoProveedor || {},
      interesMora: Number(d.interesMora) || 0,
    })
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/pendientes/importar', err)
    return NextResponse.json({ error: err?.message || 'No se pudo leer el PDF.' }, { status: 500 })
  }
}
