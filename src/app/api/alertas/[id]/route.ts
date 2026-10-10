import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, docDelEspacio } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

// PATCH { estado?: 'abierta' | 'reunion' | 'resuelta', fechaReunion?, decision? }
// - 'reunion': se agenda la reunión familiar (fechaReunion).
// - 'resuelta': la familia decidió qué hacer (decision: texto).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  const doc = await docDelEspacio('alertas', params.id, esp)
  if (!doc) return NextResponse.json({ error: 'No se encontró la alerta.' }, { status: 404 })
  try {
    const b = await req.json()
    const cambios: Record<string, any> = { actualizadoEn: new Date().toISOString() }
    if (b.estado !== undefined) {
      if (!['abierta', 'reunion', 'resuelta'].includes(b.estado)) return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
      cambios.estado = b.estado
    }
    if (b.fechaReunion !== undefined) {
      if (b.fechaReunion && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(b.fechaReunion)) return NextResponse.json({ error: 'Fecha de reunión no válida.' }, { status: 400 })
      cambios.fechaReunion = b.fechaReunion || null
      cambios.reunionAgendadaPor = chequeo.perfil.nombre
    }
    if (b.estado === 'resuelta') {
      const decision = String(b.decision || '').trim()
      if (decision.length < 3) return NextResponse.json({ error: 'Escribí qué se decidió.' }, { status: 400 })
      cambios.decision = decision.slice(0, 1000)
      cambios.resueltaPor = chequeo.perfil.nombre
      cambios.resueltaEn = new Date().toISOString()
    }
    await doc.ref.set(cambios, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PATCH /api/alertas/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar la alerta.' }, { status: 500 })
  }
}
