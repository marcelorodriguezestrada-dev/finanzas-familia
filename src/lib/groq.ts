// Helper compartido para llamar a Groq (API compatible con OpenAI
// chat completions, gratis/con límites generosos). Lo usan
// /api/redactar-clausula y /api/plantillas-contrato.
//
// Importante: el catálogo de modelos disponibles varía según la
// cuenta de Groq. Este proyecto usa 'openai/gpt-oss-120b' porque es
// el que está confirmado como disponible; si en el futuro da 404
// "model_not_found", entrar a https://console.groq.com/playground y
// fijarse qué modelos aparecen listados ahí para esa cuenta.
const MODELO_GROQ = 'openai/gpt-oss-120b'

export class GroqError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Pide una respuesta en JSON estricto a Groq. `systemPrompt` debe
// indicar explícitamente la forma del JSON esperado. Devuelve el
// objeto ya parseado.
export async function pedirJsonAGroq<T = any>(systemPrompt: string, mensajeUsuario: string, maxTokens = 500): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) {
    throw new GroqError(500, 'Falta configurar GROQ_API_KEY en el servidor.')
  }

  const respuesta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELO_GROQ,
      // gpt-oss es un modelo de razonamiento; con esfuerzo bajo
      // responde más rápido y directo, evitando que mezcle texto de
      // "pensamiento" en la respuesta final.
      reasoning_effort: 'low',
      temperature: 0.3,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensajeUsuario },
      ],
    }),
  })

  if (!respuesta.ok) {
    const texto = await respuesta.text()
    console.error('Groq error', respuesta.status, texto)
    throw new GroqError(502, 'No se pudo procesar con IA. Probá de nuevo.')
  }

  const data = await respuesta.json()
  const textoCrudo = data.choices?.[0]?.message?.content?.trim() || ''

  try {
    return JSON.parse(textoCrudo) as T
  } catch {
    throw new GroqError(502, 'La IA devolvió una respuesta que no se pudo interpretar. Probá de nuevo.')
  }
}
