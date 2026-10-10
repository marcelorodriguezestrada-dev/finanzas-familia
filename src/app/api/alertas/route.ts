import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe, enEspacio } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

// GET ?todas=1 — alertas del espacio. Por defecto solo las que están
// para tratar (abiertas o con reunión agendada).
export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  try {
    const snap = await getDb().collection('alertas').get()
    let alertas = enEspacio(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[], esp)
    if (req.nextUrl.searchParams.get('todas') !== '1') alertas = alertas.filter((a) => a.estado === 'abierta' || a.estado === 'reunion')
    alertas.sort((a, b) => (a.mes || '').localeCompare(b.mes || '') || (a.inquilinoNombre || '').localeCompare(b.inquilinoNombre || ''))
    return NextResponse.json({ alertas })
  } catch (err: any) {
    console.error('GET /api/alertas', err)
    return NextResponse.json({ error: err?.message || 'No se pudieron leer las alertas.' }, { status: 500 })
  }
}
