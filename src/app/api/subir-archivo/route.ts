import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// POST { imagenBase64: string, nombre?: string }
// Sube un archivo a ImgBB (contratos escaneados, comprobantes de
// gastos, fotos de reparaciones) y devuelve la URL pública.
//
// Pasa por acá en vez de subir directo desde el navegador por dos
// motivos: (1) la API key de ImgBB queda solo en el servidor, nunca
// expuesta en el código del cliente, y (2) de paso exigimos sesión
// iniciada, así nadie ajeno puede usar tu cuenta de ImgBB como subidor
// gratis de lo que sea.
//
// LIMITACIÓN IMPORTANTE: ImgBB solo aloja IMÁGENES (jpg, png, etc.),
// no PDFs ni Word. Si el contrato ya está firmado en papel, hay que
// FOTOGRAFIARLO o escanearlo como imagen (no como PDF) antes de
// subirlo acá. Si en algún momento hace falta subir PDFs de verdad,
// esto hay que migrarlo a otro servicio (Firebase Storage, Cloudinary
// con soporte de "raw files", etc.) — ImgBB no lo permite bajo ningún
// parámetro.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const apiKey = process.env.IMGBB_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Todavía no se configuró IMGBB_API_KEY en el servidor.' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { imagenBase64, nombre } = body
    if (!imagenBase64) {
      return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 })
    }

    // Por si viene como data URL completa ("data:image/png;base64,...")
    // — ImgBB solo quiere la parte de después de la coma.
    const soloBase64 = imagenBase64.includes(',') ? imagenBase64.split(',')[1] : imagenBase64

    const form = new FormData()
    form.append('image', soloBase64)
    if (nombre) form.append('name', nombre)

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: form,
    })
    const data = await res.json()

    if (!res.ok || !data?.data?.url) {
      console.error('ImgBB rechazó la subida', data)
      return NextResponse.json({ error: data?.error?.message || 'ImgBB no pudo subir el archivo.' }, { status: 502 })
    }

    return NextResponse.json({ url: data.data.url as string, deleteUrl: data.data.delete_url as string })
  } catch (err: any) {
    console.error('POST /api/subir-archivo', err)
    return NextResponse.json({ error: err?.message || 'No se pudo subir el archivo.' }, { status: 500 })
  }
}
