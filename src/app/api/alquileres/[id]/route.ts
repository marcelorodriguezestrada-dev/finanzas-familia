import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb, requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { normalizarEsquema } from '@/lib/esquemaPago'
import { espacioDe, docDelEspacio } from '@/lib/espacioServidor'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const ETIQUETAS: Record<string, string> = {
  inquilinoNombre: 'nombre del inquilino', inquilinoCI: 'C.I.', inquilinoTelefono: 'teléfono',
  inquilinoDireccionAnterior: 'dirección anterior', diaCobro: 'día de pago', fechaInicio: 'fecha de inicio',
  fechaFin: 'fecha de fin', administradorUid: 'administrador', anticipo: 'anticipo', notas: 'notas',
  unidadId: 'departamento', estado: 'estado', esquemaPago: 'plan de pago', montoMensual: 'canon', contratoUrl: 'contrato',
}

// PATCH — modifica un alquiler. Cada cambio queda anotado en
// `historialCambios` (quién, cuándo, qué). Casos especiales:
// - administradorUid: se valida contra los miembros y se guarda en
//   `historialAdministracion` desde qué fecha administra cada uno, así
//   el fee de los meses anteriores le sigue correspondiendo al anterior.
// - unidadId: pasa el alquiler a otro departamento libre del mismo
//   espacio (actualiza qué unidad queda libre/ocupada).
// - estado 'activo': reactiva uno finalizado si la unidad está libre.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  const doc = await docDelEspacio('alquileres', params.id, esp)
  if (!doc) return NextResponse.json({ error: 'No se encontró (o es de otro espacio).' }, { status: 404 })
  const actual = doc.data()!

  try {
    const body = await req.json()
    const db = getDb()
    const cambios: Record<string, any> = {}

    for (const campo of ['inquilinoNombre', 'inquilinoCI', 'inquilinoTelefono', 'inquilinoDireccionAnterior', 'contratoUrl', 'notas']) {
      if (body[campo] !== undefined) cambios[campo] = typeof body[campo] === 'string' ? body[campo].trim() : body[campo]
    }
    if (cambios.inquilinoNombre === '') return NextResponse.json({ error: 'El nombre del inquilino no puede quedar vacío.' }, { status: 400 })

    if (body.diaCobro !== undefined) {
      const d = Number(body.diaCobro)
      if (!(d >= 1 && d <= 28)) return NextResponse.json({ error: 'El día de pago tiene que estar entre 1 y 28.' }, { status: 400 })
      cambios.diaCobro = d
    }
    if (body.fechaInicio !== undefined) {
      if (!FECHA.test(body.fechaInicio)) return NextResponse.json({ error: 'Fecha de inicio no válida.' }, { status: 400 })
      cambios.fechaInicio = body.fechaInicio
    }
    if (body.fechaFin !== undefined) {
      if (body.fechaFin && !FECHA.test(body.fechaFin)) return NextResponse.json({ error: 'Fecha de fin no válida.' }, { status: 400 })
      cambios.fechaFin = body.fechaFin || null
    }
    const ini = cambios.fechaInicio ?? actual.fechaInicio
    const fin = cambios.fechaFin !== undefined ? cambios.fechaFin : actual.fechaFin
    if (fin && ini && fin <= ini) return NextResponse.json({ error: 'La fecha de fin tiene que ser posterior a la de inicio.' }, { status: 400 })

    if (body.montoMensual !== undefined) cambios.montoMensual = Number(body.montoMensual)
    if (body.esquemaPago !== undefined) {
      const esquema = normalizarEsquema(body.esquemaPago, Number(body.montoMensual) || undefined)
      cambios.esquemaPago = esquema
      if (esquema) cambios.montoMensual = esquema.tramos[0].monto
    }
    if (body.contratoUrl) cambios.contratoSubidoEn = new Date().toISOString()
    if (body.anticipo !== undefined) cambios.anticipo = body.anticipo ? Number(body.anticipo) : null

    // ---- Administrador
    if (body.administradorUid !== undefined && body.administradorUid !== actual.administradorUid) {
      const perfil = await db.collection('perfiles').doc(String(body.administradorUid)).get()
      if (!perfil.exists || !perfil.data()!.aprobado) return NextResponse.json({ error: 'Esa persona no es un miembro aprobado de la familia.' }, { status: 400 })
      const desde = FECHA.test(body.administradorDesde || '') ? body.administradorDesde : new Date().toISOString().slice(0, 10)
      const historial: any[] = Array.isArray(actual.historialAdministracion) && actual.historialAdministracion.length
        ? [...actual.historialAdministracion]
        : actual.administradorUid
        ? [{ uid: actual.administradorUid, nombre: actual.administradorNombre || '', desde: actual.fechaInicio || '0000-01-01' }]
        : []
      const ultimo = historial[historial.length - 1]
      if (ultimo && desde < ultimo.desde) {
        return NextResponse.json({ error: `"Desde" no puede ser anterior al ${ultimo.desde}, cuando empezó ${ultimo.nombre || 'el administrador anterior'}.` }, { status: 400 })
      }
      // Si el cambio es el mismo día que el anterior, lo reemplaza.
      if (ultimo && ultimo.desde === desde) historial.pop()
      historial.push({ uid: perfil.id, nombre: perfil.data()!.nombre || '', desde })
      cambios.administradorUid = perfil.id
      cambios.administradorNombre = perfil.data()!.nombre || ''
      cambios.historialAdministracion = historial
    }

    // ---- Departamento
    if (body.unidadId !== undefined && body.unidadId !== actual.unidadId) {
      const nueva = await docDelEspacio('unidades', body.unidadId, esp)
      if (!nueva) return NextResponse.json({ error: 'Ese departamento no existe en este espacio.' }, { status: 400 })
      const estadoFinal = body.estado || actual.estado
      if (estadoFinal === 'activo') {
        const ocupada = await db.collection('alquileres').where('unidadId', '==', body.unidadId).where('estado', '==', 'activo').limit(1).get()
        if (!ocupada.empty) return NextResponse.json({ error: `Ese departamento ya tiene un alquiler activo (${ocupada.docs[0].data().inquilinoNombre}).` }, { status: 409 })
      }
      cambios.unidadId = body.unidadId
      cambios.propiedadId = nueva.data()!.propiedadId
    }

    // ---- Estado
    if (body.estado && body.estado !== actual.estado) {
      if (!['activo', 'finalizado', 'rescindido'].includes(body.estado)) return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
      cambios.estado = body.estado
      if (body.estado === 'activo') {
        const unidadId = cambios.unidadId || actual.unidadId
        const ocupada = await db.collection('alquileres').where('unidadId', '==', unidadId).where('estado', '==', 'activo').get()
        if (ocupada.docs.some((d) => d.id !== params.id)) return NextResponse.json({ error: 'No se puede reactivar: el departamento ya tiene otro alquiler activo.' }, { status: 409 })
      } else if (body.fechaFin === undefined && !actual.fechaFin) {
        cambios.fechaFin = new Date().toISOString().slice(0, 10)
      }
    }

    const camposCambiados = Object.keys(cambios).filter((k) => ETIQUETAS[k] && JSON.stringify(cambios[k]) !== JSON.stringify(actual[k] ?? null))
    if (!camposCambiados.length) return NextResponse.json({ ok: true, sinCambios: true })

    // Ocupación de las unidades según el resultado final.
    const unidadFinal = cambios.unidadId || actual.unidadId
    const estadoFinal = cambios.estado || actual.estado
    if (cambios.unidadId && actual.unidadId) await db.collection('unidades').doc(actual.unidadId).set({ estado: 'disponible' }, { merge: true })
    if (unidadFinal) await db.collection('unidades').doc(unidadFinal).set({ estado: estadoFinal === 'activo' ? 'alquilada' : 'disponible' }, { merge: true })

    cambios.historialCambios = FieldValue.arrayUnion({
      fecha: new Date().toISOString(),
      porUid: chequeo.usuario.uid,
      porNombre: chequeo.perfil.nombre,
      cambios: camposCambiados.map((k) => ETIQUETAS[k]),
      motivo: String(body.motivo || '').slice(0, 300),
    })
    cambios.actualizadoEn = new Date().toISOString()
    await doc.ref.set(cambios, { merge: true })
    return NextResponse.json({ ok: true, cambiados: camposCambiados.map((k) => ETIQUETAS[k]) })
  } catch (err: any) {
    console.error('PATCH /api/alquileres/[id]', err)
    return NextResponse.json({ error: err?.message || 'No se pudo actualizar el alquiler.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })
  const esp = espacioDe(req, chequeo)
  if (!(await docDelEspacio('alquileres', params.id, esp))) return NextResponse.json({ error: 'No se encontró (o es de otro espacio).' }, { status: 404 })

  await getDb().collection('alquileres').doc(params.id).delete()
  return NextResponse.json({ ok: true })
}
