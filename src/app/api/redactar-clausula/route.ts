import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'

export const dynamic = 'force-dynamic'

// POST — recibe una descripción en lenguaje simple de lo que el
// usuario quiere pactar (ej: "que las mascotas están permitidas pero
// el inquilino paga cualquier daño") y devuelve un título + texto de
// cláusula redactado en el mismo estilo formal que el resto del
// contrato (ver src/lib/plantillaContrato.ts), listo para agregarse
// al documento. No guarda nada — es solo redacción.
//
// Usa Groq (API compatible con OpenAI chat completions, gratis/con
// límites generosos). Requiere la variable de entorno GROQ_API_KEY
// (conseguila en https://console.groq.com/keys).
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: 'Falta configurar GROQ_API_KEY en el servidor.' }, { status: 500 })
  }

  try {
    const { descripcion } = (await req.json()) as { descripcion?: string }
    if (!descripcion || !descripcion.trim()) {
      return NextResponse.json({ error: 'Describí qué querés que diga la cláusula.' }, { status: 400 })
    }

    const systemPrompt = `Redactás cláusulas individuales para contratos de alquiler de vivienda en Bolivia, en español formal/legal boliviano, en el mismo estilo que estas cláusulas de ejemplo:

"El canon de alquiler mensual se fija de mutuo acuerdo en Bs 1.500 (mil quinientos bolivianos), monto que EL INQUILINO se compromete a cancelar puntualmente el día 5 de cada mes."

"EL INQUILINO se compromete a: a) cancelar puntualmente el canon de alquiler en la fecha pactada; b) usar el inmueble con el cuidado debido, haciéndose responsable de los daños ocasionados por mal uso; c) no realizar modificaciones a la infraestructura sin autorización escrita."

Reglas:
- Usá "EL ARRENDADOR" y "EL INQUILINO" en mayúsculas para referirte a las partes, igual que en los ejemplos.
- Tono formal, directo, sin ambigüedad. Sin firmas, encabezados ni numeración de cláusula (eso lo agrega el sistema).
- Un solo párrafo (podés usar incisos a), b), c) si hace falta enumerar).
- No inventes montos, fechas ni nombres que el usuario no haya dado: si faltan, dejá un espacio en blanco tipo "____________".
- Respondé SOLO con un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"titulo": "TÍTULO CORTO EN MAYÚSCULAS (2-5 palabras)", "texto": "el párrafo de la cláusula"}`

    const respuesta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Modelo confirmado como disponible en esta cuenta de Groq
        // (ver el selector de modelos en console.groq.com/playground —
        // el catálogo varía según la cuenta). Si en el futuro esto
        // cambia, revisar ahí qué modelos aparecen listados.
        model: 'openai/gpt-oss-120b',
        // gpt-oss es un modelo de razonamiento; con esfuerzo bajo
        // responde más rápido y directo, evitando que mezcle texto de
        // "pensamiento" en la respuesta final.
        reasoning_effort: 'low',
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: descripcion.trim() },
        ],
      }),
    })

    if (!respuesta.ok) {
      const texto = await respuesta.text()
      console.error('POST /api/redactar-clausula — Groq error', respuesta.status, texto)
      return NextResponse.json({ error: 'No se pudo redactar la cláusula con IA. Probá de nuevo.' }, { status: 502 })
    }

    const data = await respuesta.json()
    const textoCrudo = data.choices?.[0]?.message?.content?.trim() || ''

    let clausula: { titulo?: string; texto?: string }
    try {
      clausula = JSON.parse(textoCrudo)
    } catch {
      return NextResponse.json({ error: 'La IA devolvió una respuesta que no se pudo interpretar. Probá reformular el pedido.' }, { status: 502 })
    }

    if (!clausula.texto) {
      return NextResponse.json({ error: 'No se pudo generar el texto de la cláusula.' }, { status: 502 })
    }

    return NextResponse.json({ titulo: clausula.titulo || 'CLÁUSULA ADICIONAL', texto: clausula.texto })
  } catch (err: any) {
    console.error('POST /api/redactar-clausula', err)
    return NextResponse.json({ error: err?.message || 'No se pudo redactar la cláusula.' }, { status: 500 })
  }
}
