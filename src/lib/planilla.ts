// Utilidades de la planilla de alquileres (edición masiva en reuniones):
// meses a mostrar, CSV para Excel y lectura de alquileres pegados desde
// una planilla.

import { parsearTabla, leerMonto, leerFecha } from './importarGastos'

export function mesesHasta(hasta: string, cantidad: number): string[] {
  const [a, m] = hasta.split('-').map(Number)
  const out: string[] = []
  for (let i = cantidad - 1; i >= 0; i--) {
    const t = a * 12 + (m - 1) - i
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

const MC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const mesCorto = (m: string) => `${MC[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`

// CSV con ";" y BOM: así Excel en español lo abre bien con las comas decimales.
export function aCSV(filas: (string | number | null | undefined)[][]): string {
  const celda = (v: any) => {
    const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
}

export function descargarArchivo(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const norm = (s: any) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export type NuevaFila = {
  key: string
  unidadId: string
  inquilinoNombre: string
  inquilinoCI: string
  inquilinoTelefono: string
  canon: string
  fechaInicio: string
  fechaFin: string
  diaCobro: string
  administradorUid: string
  aviso?: string
}

const COLS: Record<string, string[]> = {
  unidad: ['departamento', 'depto', 'unidad', 'inmueble', 'habitacion', 'espacio', 'lugar'],
  nombre: ['inquilino', 'nombre', 'arrendatario'],
  ci: ['ci', 'c i', 'carnet', 'cedula', 'documento', 'dni'],
  telefono: ['telefono', 'tel', 'celular', 'cel', 'whatsapp'],
  canon: ['canon', 'monto', 'alquiler', 'precio', 'mensual', 'importe'],
  inicio: ['inicio', 'desde', 'fecha inicio', 'entrada'],
  fin: ['fin', 'hasta', 'vencimiento', 'fecha fin', 'salida'],
  dia: ['dia de pago', 'paga hasta', 'dia', 'dia cobro'],
  admin: ['administra', 'administrador', 'administradora', 'responsable', 'encargado'],
}

// Lee alquileres pegados desde Excel/Sheets (con fila de títulos) y los
// convierte en filas nuevas, ubicando departamento y administrador.
export function leerAlquileresPegados(texto: string, unidades: any[], propiedades: any[], miembros: any[]): { filas: NuevaFila[]; error?: string } {
  const m = parsearTabla(texto)
  if (m.length < 2) return { filas: [], error: 'Pegá la fila de títulos y al menos un alquiler.' }
  const enc = m[0].map(norm)
  const idx: Record<string, number> = {}
  for (const [campo, sin] of Object.entries(COLS)) {
    const i = enc.findIndex((h) => sin.some((s) => h === s || h.startsWith(s)))
    if (i >= 0 && !Object.values(idx).includes(i)) idx[campo] = i
  }
  if (idx.unidad === undefined || idx.nombre === undefined) return { filas: [], error: 'Faltan columnas: necesito al menos "departamento" e "inquilino".' }
  const nombreUnidad = (u: any) => norm(`${propiedades.find((p) => p.id === u.propiedadId)?.nombre || ''} ${u.nombre}`)
  const filas = m.slice(1).map((f, i) => {
    const t = (k: string) => (idx[k] !== undefined ? String(f[idx[k]] ?? '').trim() : '')
    const nu = norm(t('unidad'))
    const unidad = unidades.find((u) => nombreUnidad(u) === nu) || unidades.find((u) => nombreUnidad(u).includes(nu) || (nu && nu.includes(norm(u.nombre)) && norm(u.nombre).length >= 3))
    const na = norm(t('admin'))
    const admin = na ? miembros.find((x) => norm(x.nombre).startsWith(na) || na.startsWith(norm(x.nombre).split(' ')[0])) : null
    const avisos: string[] = []
    if (!unidad) avisos.push(`no encontré el departamento "${t('unidad')}"`)
    if (na && !admin) avisos.push(`no encontré a "${t('admin')}" entre los miembros`)
    return {
      key: `p${Date.now()}-${i}`,
      unidadId: unidad?.id || '',
      inquilinoNombre: t('nombre'),
      inquilinoCI: t('ci'),
      inquilinoTelefono: t('telefono'),
      canon: String(leerMonto(t('canon')) ?? ''),
      fechaInicio: leerFecha(t('inicio')) || '',
      fechaFin: leerFecha(t('fin')) || '',
      diaCobro: String(Number(t('dia')) || 5),
      administradorUid: admin?.uid || '',
      aviso: avisos.join(' · '),
    }
  })
  return { filas: filas.filter((x) => x.inquilinoNombre || x.unidadId) }
}
