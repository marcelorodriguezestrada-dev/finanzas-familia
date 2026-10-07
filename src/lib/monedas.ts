// Monedas y espacios, compartido entre navegador y servidor.
//
// Cada registro (movimiento, propiedad, unidad, alquiler, deuda,
// patrimonio, reparación) pertenece a un ESPACIO:
//   'familia'          -> lo compartido por toda la familia (lo de siempre)
//   'personal:<uid>'   -> "Mis finanzas" de un usuario, solo lo ve él
// Los registros viejos no tienen el campo y cuentan como 'familia', así
// que no hace falta migrar nada.

export const ESPACIO_FAMILIA = 'familia'
export const COOKIE_ESPACIO = 'espacio'
export const MONEDA_FAMILIA = 'BOB'
export const MONEDA_PERSONAL_POR_DEFECTO = 'ARS'

export const MONEDAS: Record<string, { simbolo: string; nombre: string }> = {
  BOB: { simbolo: 'Bs', nombre: 'Bolivianos' },
  ARS: { simbolo: '$', nombre: 'Pesos argentinos' },
  USD: { simbolo: 'US$', nombre: 'Dólares' },
  USDT: { simbolo: 'USDT', nombre: 'Tether (USDT)' },
}

export function simboloDe(moneda: string | undefined | null) {
  return MONEDAS[moneda || '']?.simbolo || moneda || 'Bs'
}

export function espacioPersonal(uid: string) {
  return `personal:${uid}`
}

export function espacioDeDoc(data: any): string {
  return data?.espacio || ESPACIO_FAMILIA
}

// ---- Moneda "vigente" en el navegador: la del espacio activo. La fija
// EspacioProvider; en el servidor nunca se toca y queda en Bs (así el
// contrato PDF y todo lo que se arma del lado servidor siguen en Bs).
let monedaVigente = MONEDA_FAMILIA
export function fijarMonedaVigente(moneda: string) {
  if (typeof window !== 'undefined') monedaVigente = moneda
}
export function monedaActual() {
  return typeof window !== 'undefined' ? monedaVigente : MONEDA_FAMILIA
}
