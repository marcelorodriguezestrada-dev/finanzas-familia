import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { pedirJsonAGroq, GroqError } from '@/lib/groq'
import { TIPOS_UNIDAD, COMODIDADES } from '@/data/inmuebles'

export const dynamic = 'force-dynamic'

export type UnidadSugerida = {
  nombre: string
  tipo: string
  comodidades: string[]
  notas: string
}

// POST { descripcion: string }
//
// Recibe una descripción en lenguaje libre de los ambientes de un
// inmueble (escrita a mano, o transcripta de un audio en
// /api/transcribir-audio) y le pide a la IA que la convierta en una
// lista de unidades ya estructuradas según el mismo catálogo de tipos
// y comodidades que usa el formulario de "Agregar espacio" — así lo
// que devuelve encaja directo con /api/unidades sin traducción
// manual.
//
// Es solo una SUGERENCIA: no crea nada en la base de datos. El
// usuario revisa la lista, la edita si hace falta, y confirma la
// creación desde el cliente (unidad por unidad, llamando a
// /api/unidades como ya hace el formulario manual).
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const { descripcion } = (await req.json()) as { descripcion?: string }
    if (!descripcion || !descripcion.trim()) {
      return NextResponse.json({ error: 'Describí los ambientes del inmueble primero.' }, { status: 400 })
    }

    const tiposDisponibles = TIPOS_UNIDAD.map((t) => `"${t.id}" (${t.label})`).join(', ')
    const comodidadesDisponibles = COMODIDADES.map((c) => `"${c.id}" (${c.label})`).join(', ')

    const systemPrompt = `Convertís la descripción libre que hace una familia de los ambientes de un inmueble (para alquilar) en una lista estructurada de unidades/espacios, lista para cargar en un sistema.

Reglas:
- Cada ambiente distinto mencionado (consultorio, tienda, cuarto, departamento, cochera, etc.) es una unidad separada, aunque no tenga nombre propio en el texto.
- nombre: un nombre corto y único para identificar el espacio (ej: "Consultorio 1", "Cuarto al fondo", "Depto planta alta"). Si el texto ya usa un nombre o número, respetalo. Si hay varios ambientes iguales sin diferenciar, numéralos vos (Cuarto 1, Cuarto 2...).
- tipo: elegí el que mejor describe el espacio, SOLO de esta lista de ids: ${tiposDisponibles}. Si no calza ninguno bien, usá "departamento" para viviendas y "local" para comercios.
- comodidades: array con los ids que apliquen, SOLO de esta lista: ${comodidadesDisponibles}. Si el texto no menciona nada específico, dejá el array vacío en vez de inventar.
- notas: cualquier dato relevante que no encaje en los campos anteriores (a quién está alquilado actualmente, para qué se usa, ubicación dentro del inmueble, etc.), en una o dos líneas. Vacío si no hay nada que agregar.
- No inventes cantidades: si el texto dice "3 consultorios", generá exactamente 3 unidades de tipo consultorio, no más ni menos.
- Respondé SOLO con un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"unidades": [{"nombre": "", "tipo": "", "comodidades": [], "notas": ""}]}`

    const resultado = await pedirJsonAGroq<{ unidades?: UnidadSugerida[] }>(systemPrompt, descripcion.trim(), 3000)

    const idsTipoValidos = new Set(TIPOS_UNIDAD.map((t) => t.id))
    const idsComodidadValidos = new Set(COMODIDADES.map((c) => c.id))

    const unidades = (resultado.unidades || [])
      .filter((u) => u?.nombre?.trim())
      .map((u) => ({
        nombre: u.nombre.trim(),
        tipo: idsTipoValidos.has(u.tipo as any) ? u.tipo : 'departamento',
        comodidades: (u.comodidades || []).filter((c) => idsComodidadValidos.has(c as any)),
        notas: u.notas?.trim() || '',
      }))

    if (unidades.length === 0) {
      return NextResponse.json(
        { error: 'No se pudieron identificar espacios en esa descripción. Probá ser más específico (ej: "3 consultorios, 2 cuartos al fondo").' },
        { status: 502 }
      )
    }

    return NextResponse.json({ unidades })
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/interpretar-espacios', err)
    return NextResponse.json({ error: err?.message || 'No se pudo interpretar la descripción.' }, { status: 500 })
  }
}
