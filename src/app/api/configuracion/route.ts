import { NextRequest, NextResponse } from 'next/server'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { espacioDe } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

// Datos que salen en los avisos, liquidaciones y recibos: el nombre de
// la administración, quién administra, contacto y la cuenta para
// cobrar. Uno por espacio (Familia o Mis finanzas de cada usuario), así
// toda la familia ve los mismos datos en cualquier dispositivo.
const CAMPOS = ['nombreAdministracion', 'administrador', 'direccion', 'telefono', 'titular', 'banco', 'cuenta'] as const

const idDoc = (espId: string) => `datosCobro__${espId.replace(/[^a-zA-Z0-9_-]/g, '_')}`

export async function GET(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  const doc = await getDb().collection('configuracion').doc(idDoc(esp.id)).get()
  return NextResponse.json({ datosCobro: doc.exists ? doc.data() : null })
}

export async function PUT(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  try {
    const body = await req.json()
    const datos: Record<string, string> = {}
    for (const c of CAMPOS) datos[c] = String(body?.[c] ?? '').trim().slice(0, 160)
    await getDb()
      .collection('configuracion')
      .doc(idDoc(esp.id))
      .set({ ...datos, espacio: esp.id, actualizadoPor: chequeo.perfil.nombre, actualizadoEn: new Date().toISOString() }, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('PUT /api/configuracion', err)
    return NextResponse.json({ error: err?.message || 'No se pudo guardar.' }, { status: 500 })
  }
}
