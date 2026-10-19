// Informe individual por administrador: lo que entró y salió de los
// departamentos que administra cada persona y cuánta plata debería
// tener en mano. Reusa armarInforme con un filtro que decide, para cada
// movimiento, de quién es:
// - con alquiler: de quien administraba ese alquiler en la fecha
//   (historialAdministracion, igual que el fee);
// - con unidad: de quien administraba el alquiler de esa unidad;
// - solo con propiedad: de quien la administra, si es una sola persona;
//   si son varias queda como "compartido" y no se descuenta a nadie;
// - sin propiedad: es de la familia en general y no entra.

import { armarInforme, DatosInforme, Informe, ultimoDia } from './informe'
import { redondear } from './esquemaPago'

type Admin = { uid: string; nombre: string }
type Asignacion = { tipo: 'uno'; uid: string } | { tipo: 'varios'; uids: string[] } | null

export type Compartido = { descripcion: string; fecha: string; lugar: string; monto: number; tipo: 'ingreso' | 'gasto'; entre: string[] }

export type InformeAdministrador = {
  uid: string
  nombre: string
  inf: Informe
  compartidos: Compartido[]
  // Plata que debería tener en mano al cierre (acumulado de todo lo
  // que cobró menos lo que pagó de sus departamentos).
  enMano: number
}

export function adminEnFecha(a: any, fecha: string): Admin | null {
  const h: any[] = Array.isArray(a?.historialAdministracion) ? a.historialAdministracion : []
  const vigente = [...h].reverse().find((x) => x.desde <= fecha)
  if (vigente?.uid) return { uid: vigente.uid, nombre: vigente.nombre || '' }
  return a?.administradorUid ? { uid: a.administradorUid, nombre: a.administradorNombre || '' } : null
}

const vigenteEn = (a: any, fecha: string) => !!a.fechaInicio && a.fechaInicio <= fecha && (!a.fechaFin || a.fechaFin >= fecha)

// Todas las personas que administran (o administraron) algún alquiler.
export function administradores(d: { alquileres: any[]; miembros?: any[] }): Admin[] {
  const mapa = new Map<string, string>()
  for (const a of d.alquileres) {
    const h: any[] = Array.isArray(a.historialAdministracion) ? a.historialAdministracion : []
    for (const x of [...h, { uid: a.administradorUid, nombre: a.administradorNombre }]) {
      if (x?.uid && !mapa.get(x.uid)) mapa.set(x.uid, x.nombre || '')
    }
  }
  return Array.from(mapa.entries())
    .map(([uid, nombre]) => ({ uid, nombre: d.miembros?.find((m) => m.uid === uid)?.nombre || nombre || 'Sin nombre' }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre))
}

function asignador(alquileres: any[]) {
  const porId = new Map<string, any>(alquileres.map((a) => [a.id, a]))
  const deUnidad = (unidadId: string, fecha: string) => {
    const lista = alquileres.filter((a) => a.unidadId === unidadId)
    return (
      lista.find((a) => vigenteEn(a, fecha)) ||
      lista.filter((a) => a.fechaInicio && a.fechaInicio <= fecha).sort((x, y) => y.fechaInicio.localeCompare(x.fechaInicio))[0] ||
      lista[0]
    )
  }
  return (x: any, fecha: string): Asignacion => {
    const alq = (x?.alquilerId && porId.get(x.alquilerId)) || (x?.unidadId && deUnidad(x.unidadId, fecha))
    if (alq) {
      const ad = adminEnFecha(alq, fecha)
      return ad ? { tipo: 'uno', uid: ad.uid } : null
    }
    if (!x?.propiedadId) return null
    const delEdificio = alquileres.filter((a) => a.propiedadId === x.propiedadId)
    const enFecha = delEdificio.filter((a) => vigenteEn(a, fecha))
    const uids = Array.from(new Set((enFecha.length ? enFecha : delEdificio).map((a) => adminEnFecha(a, fecha)?.uid).filter(Boolean))) as string[]
    if (!uids.length) return null
    return uids.length === 1 ? { tipo: 'uno', uid: uids[0] } : { tipo: 'varios', uids }
  }
}

export function armarInformeAdministrador(d: DatosInforme & { miembros?: any[] }, mes: string, uid: string, opts: { hoy?: string } = {}): InformeAdministrador {
  const hoy = opts.hoy || new Date().toISOString().slice(0, 10)
  const inicio = `${mes}-01`
  const fin = ultimoDia(mes)
  const referencia = hoy < inicio ? inicio : hoy > fin ? fin : hoy
  const de = asignador(d.alquileres)
  const esMio = (x: any, fecha: string) => {
    const a = de(x, fecha)
    return a?.tipo === 'uno' && a.uid === uid
  }

  const inf = armarInforme(d, mes, {
    hoy,
    filtro: {
      movimiento: (m) => !!m.fecha && esMio(m, m.fecha),
      alquiler: (a) => adminEnFecha(a, referencia)?.uid === uid,
      deuda: (x) => esMio(x, referencia),
      pendiente: (p) => esMio(p, referencia),
    },
  })

  const lista = administradores(d)
  const nombreDe = (u: string) => lista.find((x) => x.uid === u)?.nombre || 'Sin nombre'
  const nombreProp = (id: string) => d.propiedades.find((p) => p.id === id)?.nombre || ''
  const compartidos: Compartido[] = d.movimientos
    .filter((m) => m.fecha >= inicio && m.fecha <= fin)
    .flatMap((m) => {
      const a = de(m, m.fecha)
      if (a?.tipo !== 'varios' || !a.uids.includes(uid)) return []
      return [{ descripcion: m.descripcion || m.categoria, fecha: m.fecha, lugar: nombreProp(m.propiedadId) || 'General', monto: Number(m.monto) || 0, tipo: m.tipo === 'ingreso' ? 'ingreso' : 'gasto', entre: a.uids.map(nombreDe) } as Compartido]
    })
    .sort((x, y) => x.fecha.localeCompare(y.fecha))

  return { uid, nombre: nombreDe(uid), inf, compartidos, enMano: redondear(inf.caja.saldoCierre) }
}
