import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// Nombre del bucket de Supabase Storage donde van los PDF. Hay que
// crearlo a mano una vez desde el dashboard de Supabase (Storage →
// New bucket → "contratos", marcado como público) antes de que esto
// funcione.
const BUCKET = 'contratos'

// POST { archivoBase64: string, nombre?: string }
// Sube un PDF a Supabase Storage. Existe aparte de /api/subir-archivo
// (que sube a ImgBB) porque ImgBB solo acepta imágenes — esto es
// específicamente para cuando el contrato ya es un PDF de verdad, no
// una foto.
//
// Igual que con ImgBB, esto pasa por el servidor a propósito: la
// "service_role key" de Supabase que hace falta para escribir en el
// bucket sin configurar políticas de seguridad (RLS) tiene permiso
// para leer y escribir CUALQUIER COSA del proyecto entero — si viajara
// al navegador de cualquiera, esa persona podría hacer lo que quiera
// con toda tu base de Supabase, no solo con este bucket.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/(rest|storage)\/v1\/?.*$/, '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Todavía no se configuró Supabase en el servidor (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json()
    const { archivoBase64, nombre } = body
    if (!archivoBase64) {
      return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
    }

    const soloBase64 = archivoBase64.includes(',') ? archivoBase64.split(',')[1] : archivoBase64
    const buffer = Buffer.from(soloBase64, 'base64')

    if (buffer.byteLength > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo pesa más de 50 MB.' }, { status: 400 })
    }

    // Sufijo al azar en el nombre: el bucket es público (así no hay que
    // mantener políticas de RLS para un caso de uso familiar chico),
    // así que esto es lo que evita que alguien adivine o liste
    // contratos ajenos por nombre de archivo.
    const sufijo = Math.random().toString(36).slice(2, 10)
    const nombreLimpio = (nombre || 'contrato.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')
    const rutaArchivo = `${Date.now()}-${sufijo}-${nombreLimpio}`

    // Content-Type según la extensión real del archivo: este endpoint
    // ya no sube solo PDFs de contrato, también fotos de croquis u
    // otras imágenes de referencia, y hace falta el tipo correcto para
    // que el navegador las muestre bien al abrir el link.
    const extension = nombreLimpio.split('.').pop()?.toLowerCase() || ''
    const tiposPorExtension: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    }
    const contentType = tiposPorExtension[extension] || 'application/octet-stream'

    const resSubida = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${rutaArchivo}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      body: buffer,
    })

    if (!resSubida.ok) {
      const detalle = await resSubida.text().catch(() => '')
      console.error('Supabase Storage rechazó la subida', resSubida.status, detalle)
      return NextResponse.json(
        {
          error: `Supabase no pudo guardar el archivo (código ${resSubida.status}): ${detalle || 'sin detalle'}. Revisá que el bucket "contratos" exista y esté marcado como público.`,
        },
        { status: 502 }
      )
    }

    const urlPublica = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${rutaArchivo}`
    return NextResponse.json({ url: urlPublica })
  } catch (err: any) {
    console.error('POST /api/subir-pdf', err)
    return NextResponse.json({ error: err?.message || 'No se pudo subir el archivo.' }, { status: 500 })
  }
}
