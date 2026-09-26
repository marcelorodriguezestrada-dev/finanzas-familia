import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { generarClausulasContrato, DatosContrato } from '@/lib/plantillaContrato'
import { renderizarContratoPDF } from '@/lib/pdfContrato'
import { normalizarEsquema } from '@/lib/esquemaPago'

export const dynamic = 'force-dynamic'

// POST — recibe los datos del inquilino + condiciones + esquema de pago
// + propiedad (y opcionalmente las firmas en imagen) y devuelve el PDF
// armado en color (base64), listo para descargar, imprimir y firmar.
// No guarda nada en la base de datos: el contrato firmado se sube
// aparte al registrar el alquiler.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const datos = (await req.json()) as DatosContrato

    if (!datos.inquilinos?.length || !datos.inquilinos[0]?.nombre || !datos.inquilinos[0]?.ci || !datos.montoMensual || !datos.fechaInicio) {
      return NextResponse.json({ error: 'Faltan datos del inquilino o de las condiciones del alquiler.' }, { status: 400 })
    }

    datos.esquemaPago = normalizarEsquema(datos.esquemaPago, Number(datos.montoMensual))

    const contrato = generarClausulasContrato(datos)
    const bytes = await renderizarContratoPDF(contrato)
    return NextResponse.json({ pdfBase64: Buffer.from(bytes).toString('base64') })
  } catch (err: any) {
    console.error('POST /api/generar-contrato', err)
    return NextResponse.json({ error: err?.message || 'No se pudo generar el contrato.' }, { status: 500 })
  }
}
