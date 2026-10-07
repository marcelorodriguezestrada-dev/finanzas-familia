// Lado servidor de los espacios (Familia / Mis finanzas). El espacio
// activo viaja en una cookie que pone el selector de la barra; el
// servidor la traduce SIEMPRE al uid del usuario logueado, así nadie
// puede pedir el espacio personal de otro: lo peor que puede pasar es
// ver el suyo propio.

import { NextRequest } from 'next/server'
import { getDb } from './firebaseAdmin'
import { COOKIE_ESPACIO, ESPACIO_FAMILIA, MONEDA_FAMILIA, MONEDA_PERSONAL_POR_DEFECTO, espacioDeDoc, espacioPersonal } from './monedas'

export type Espacio = {
  id: string // 'familia' | 'personal:<uid>'
  tipo: 'familia' | 'personal'
  moneda: string
}

export const ESPACIO_FAMILIA_OBJ: Espacio = { id: ESPACIO_FAMILIA, tipo: 'familia', moneda: MONEDA_FAMILIA }

export function espacioDe(req: NextRequest, chequeo: { usuario: { uid: string }; perfil: any }): Espacio {
  const pedido = req.cookies.get(COOKIE_ESPACIO)?.value || req.headers.get('x-espacio') || ''
  if (pedido === 'personal') {
    return {
      id: espacioPersonal(chequeo.usuario.uid),
      tipo: 'personal',
      moneda: chequeo.perfil?.monedaPersonal || MONEDA_PERSONAL_POR_DEFECTO,
    }
  }
  return ESPACIO_FAMILIA_OBJ
}

// ¿Este documento es del espacio activo?
export function esDelEspacio(data: any, esp: Espacio) {
  return espacioDeDoc(data) === esp.id
}

// Filtra una lista de documentos ya leídos (se filtra en memoria y no en
// la consulta porque los registros viejos no tienen el campo).
export function enEspacio<T>(lista: T[], esp: Espacio): T[] {
  return lista.filter((d) => esDelEspacio(d, esp))
}

// Para editar/borrar por id: el documento tiene que existir Y ser del
// espacio activo. Si no, para el usuario "no existe".
export async function docDelEspacio(coleccion: string, id: string, esp: Espacio) {
  const snap = await getDb().collection(coleccion).doc(id).get()
  if (!snap.exists || !esDelEspacio(snap.data(), esp)) return null
  return snap
}
