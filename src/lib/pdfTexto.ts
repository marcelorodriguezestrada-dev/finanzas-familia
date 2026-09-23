// @ts-ignore — pdf-parse no trae tipos completos para su build interno,
// pero el import por defecto funciona bien en Node.
import pdfParse from 'pdf-parse'

export const MAX_CARACTERES_TEXTO_PDF = 12000 // recorte de seguridad para no pasarnos de tokens con contratos muy largos

export class PdfTextoError extends Error {}

// Extrae el texto de un PDF recibido en base64 (con o sin el prefijo
// "data:application/pdf;base64,"). Lanza PdfTextoError con un mensaje
// apto para mostrar al usuario si el PDF no tiene texto legible
// (por ejemplo, si es una foto escaneada sin OCR).
export async function extraerTextoDePDFBase64(pdfBase64: string): Promise<string> {
  const soloBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64
  const buffer = Buffer.from(soloBase64, 'base64')

  let textoCompleto = ''
  try {
    const resultado = await pdfParse(buffer)
    textoCompleto = (resultado.text || '').trim()
  } catch (err) {
    console.error('pdf-parse falló', err)
    throw new PdfTextoError('No se pudo leer el texto del PDF. Puede estar escaneado como imagen — probá con un PDF que tenga texto seleccionable.')
  }

  if (!textoCompleto || textoCompleto.length < 50) {
    throw new PdfTextoError('El PDF no tiene texto legible (¿es una foto escaneada?). Subí uno con texto seleccionable.')
  }

  return textoCompleto.slice(0, MAX_CARACTERES_TEXTO_PDF)
}
