import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe } from '@/lib/espacioServidor'

// La nota de la familia sigue con id = mes (como siempre); la personal
// se guarda aparte con el uid adelante.
const idNota = (mes: string, espId: string) => (espId === 'familia' ? mes : `${espId}__${mes}`)

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { mes: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)

  try {
    const doc = await getDb().collection('notasMensuales').doc(idNota(params.mes, esp.id)).get()
    return NextResponse.json({ nota: doc.exists ? doc.data() : null })
  } catch (err: any) {
    console.error('GET /api/notas-mensuales', err)
    return NextResponse.json({ error: err?.message || 'No se pudo leer la nota.' }, { status: 500 })
  }
}

// POST { texto } — cualquier miembro aprobado puede dejar/actualizar
// el comentario del balance de ese mes (es colaborativo, no hace
// falta ser admin para anotar "este mes gastamos de más en salud").
export async function POST(req: NextRequest, { params }: { params: { mes: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)

  try {
    const { texto } = await req.json()
    await getDb().collection('notasMensuales').doc(idNota(params.mes, esp.id)).set(
      {
        texto: texto || '',
        actualizadoPor: chequeo.perfil.nombre,
        actualizadoEn: new Date().toISOString(),
      },
      { merge: true }
    )
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('POST /api/notas-mensuales', err)
    return NextResponse.json({ error: err?.message || 'No se pudo guardar la nota.' }, { status: 500 })
  }
}
