// Helper de cliente para subir un archivo (contrato, comprobante de
// gasto, foto de reparación) sin que cada pantalla tenga que saber
// dónde termina guardado. Decide solo a cuál de los dos servicios
// mandarlo:
// - Imágenes (jpg/png/etc.) → ImgBB, vía /api/subir-archivo
// - PDF                     → Supabase Storage, vía /api/subir-pdf
// (ImgBB no acepta PDFs — por eso hacen falta los dos servicios en
// vez de uno solo).
export async function subirArchivo(file: File, obtenerToken: () => Promise<string>): Promise<string> {
  const esPDF = file.type === 'application/pdf'
  const esImagen = file.type.startsWith('image/')

  if (!esPDF && !esImagen) {
    throw new Error('Solo se pueden subir imágenes (jpg/png) o PDF.')
  }
  if (file.size > (esPDF ? 50 : 32) * 1024 * 1024) {
    throw new Error(`El archivo pesa más de ${esPDF ? 50 : 32} MB, el máximo permitido.`)
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const token = await obtenerToken()
  const endpoint = esPDF ? '/api/subir-pdf' : '/api/subir-archivo'
  const campo = esPDF ? 'archivoBase64' : 'imagenBase64'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ [campo]: base64, nombre: file.name }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'No se pudo subir el archivo.')
  return data.url as string
}
