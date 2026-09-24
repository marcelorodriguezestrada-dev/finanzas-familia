import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// Modelo de voz-a-texto de Groq. Igual que con los modelos de chat
// (ver src/lib/groq.ts), el catálogo disponible puede variar según la
// cuenta — si esto da 404 "model_not_found", entrar a
// console.groq.com/playground, cambiar a la pestaña de audio/STT si
// existe, y usar el nombre exacto que aparezca ahí.
const MODELO_WHISPER = 'whisper-large-v3-turbo'

// POST (multipart/form-data, campo "audio")
//
// Recibe un archivo de audio (grabado en el navegador o subido) y
// devuelve su transcripción en texto plano, usando Whisper alojado en
// Groq. No guarda el audio en ningún lado — es un paso intermedio
// antes de mandar el texto resultante a /api/interpretar-espacios.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar GROQ_API_KEY en el servidor.' }, { status: 500 })
  }

  try {
    const formEntrante = await req.formData()
    const audio = formEntrante.get('audio') as File | null
    if (!audio) {
      return NextResponse.json({ error: 'Falta el archivo de audio.' }, { status: 400 })
    }
    if (audio.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'El audio pesa más de 20 MB.' }, { status: 400 })
    }

    const formGroq = new FormData()
    formGroq.append('file', audio, audio.name || 'audio.webm')
    formGroq.append('model', MODELO_WHISPER)
    formGroq.append('language', 'es')
    formGroq.append('response_format', 'json')

    const respuesta = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formGroq,
    })

    if (!respuesta.ok) {
      const texto = await respuesta.text()
      console.error('Groq audio error', respuesta.status, texto)
      return NextResponse.json({ error: 'No se pudo transcribir el audio. Probá de nuevo o describí los espacios por texto.' }, { status: 502 })
    }

    const data = await respuesta.json()
    const texto = (data.text || '').trim()

    if (!texto) {
      return NextResponse.json({ error: 'No se detectó voz en el audio.' }, { status: 502 })
    }

    return NextResponse.json({ texto })
  } catch (err: any) {
    console.error('POST /api/transcribir-audio', err)
    return NextResponse.json({ error: err?.message || 'No se pudo procesar el audio.' }, { status: 500 })
  }
}
