import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado, getDb } from '@/lib/firebaseAdmin'
import { pedirJsonAGroq, GroqError } from '@/lib/groq'

export const dynamic = 'force-dynamic'

// POST { descripcion: string, plantillaIds?: string[] }
//
// Recibe una descripción en lenguaje simple de lo que el usuario
// quiere pactar (ej: "que las mascotas están permitidas pero el
// inquilino paga cualquier daño") y devuelve un título + texto de
// cláusula redactado en un estilo formal, listo para agregarse al
// contrato. No guarda nada — es solo redacción.
//
// Si se pasan plantillaIds, usa el texto de esas plantillas (subidas
// en /plantillas-contrato) como referencia de estilo, para que la
// cláusula nueva suene como los contratos reales de la familia en vez
// de un estilo genérico.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { descripcion, plantillaIds } = (await req.json()) as { descripcion?: string; plantillaIds?: string[] }
    if (!descripcion || !descripcion.trim()) {
      return NextResponse.json({ error: 'Describí qué querés que diga la cláusula.' }, { status: 400 })
    }

    let ejemplos = `"El canon de alquiler mensual se fija de mutuo acuerdo en Bs 1.500 (mil quinientos bolivianos), monto que EL INQUILINO se compromete a cancelar puntualmente el día 5 de cada mes."

"EL INQUILINO se compromete a: a) cancelar puntualmente el canon de alquiler en la fecha pactada; b) usar el inmueble con el cuidado debido, haciéndose responsable de los daños ocasionados por mal uso; c) no realizar modificaciones a la infraestructura sin autorización escrita."`

    // Si el usuario eligió plantillas propias como referencia de
    // estilo, se reemplazan los ejemplos genéricos por 2-3 cláusulas
    // reales de esas plantillas.
    if (plantillaIds && plantillaIds.length > 0) {
      const db = getDb()
      const docs = await Promise.all(plantillaIds.slice(0, 3).map((id) => db.collection('plantillasContrato').doc(id).get()))
      const clausulasReferencia = docs
        .filter((d) => d.exists)
        .flatMap((d) => (d.data()?.clausulas || []).slice(0, 2).map((c: any) => c.texto))
        .filter(Boolean)
        .slice(0, 4)
      if (clausulasReferencia.length > 0) {
        ejemplos = clausulasReferencia.map((t: string) => `"${t}"`).join('\n\n')
      }
    }

    const systemPrompt = `Redactás cláusulas individuales para contratos de alquiler de vivienda en Bolivia, en español formal/legal boliviano, en el mismo estilo que estas cláusulas de ejemplo:

${ejemplos}

Reglas:
- Usá "EL ARRENDADOR" y "EL INQUILINO" en mayúsculas para referirte a las partes, igual que en los ejemplos.
- Tono formal, directo, sin ambigüedad. Sin firmas, encabezados ni numeración de cláusula (eso lo agrega el sistema).
- Un solo párrafo (podés usar incisos a), b), c) si hace falta enumerar).
- No inventes montos, fechas ni nombres que el usuario no haya dado: si faltan, dejá un espacio en blanco tipo "____________".
- Respondé SOLO con un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"titulo": "TÍTULO CORTO EN MAYÚSCULAS (2-5 palabras)", "texto": "el párrafo de la cláusula"}`

    const clausula = await pedirJsonAGroq<{ titulo?: string; texto?: string }>(systemPrompt, descripcion.trim())

    if (!clausula.texto) {
      return NextResponse.json({ error: 'No se pudo generar el texto de la cláusula.' }, { status: 502 })
    }

    return NextResponse.json({ titulo: clausula.titulo || 'CLÁUSULA ADICIONAL', texto: clausula.texto })
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/redactar-clausula', err)
    return NextResponse.json({ error: err?.message || 'No se pudo redactar la cláusula.' }, { status: 500 })
  }
}
