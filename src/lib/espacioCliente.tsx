'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { COOKIE_ESPACIO, MONEDA_FAMILIA, MONEDA_PERSONAL_POR_DEFECTO, fijarMonedaVigente, simboloDe, MONEDAS } from './monedas'

// Espacio activo en el navegador: "familia" (lo compartido) o
// "personal" (Mis finanzas, solo del usuario logueado). Se guarda en
// una cookie para que TODAS las llamadas a la API la manden solas, sin
// tocar cada fetch; el servidor la traduce al uid de quien está
// logueado (ver src/lib/espacioServidor.ts).

export type TipoEspacio = 'familia' | 'personal'

type Ctx = {
  espacio: TipoEspacio
  esPersonal: boolean
  moneda: string
  simbolo: string
  cambiarEspacio: (e: TipoEspacio) => void
  cambiarMonedaPersonal: (m: string) => Promise<void>
}

const Contexto = createContext<Ctx | null>(null)

function leerCookie(): TipoEspacio {
  if (typeof document === 'undefined') return 'familia'
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_ESPACIO}=([^;]*)`))
  return m?.[1] === 'personal' ? 'personal' : 'familia'
}

export function EspacioProvider({ children }: { children: React.ReactNode }) {
  const { perfil, obtenerToken, recargarPerfil, usuario, cargando } = useAuth() as any
  const [espacio, setEspacio] = useState<TipoEspacio>('familia')

  useEffect(() => {
    setEspacio(leerCookie())
  }, [])

  // Al cerrar sesión vuelve a la familia (para que el próximo que entre
  // en este navegador no arranque en un espacio personal vacío). OJO: solo
  // cuando Firebase YA terminó de restaurar la sesión (cargando=false):
  // al abrir la página `usuario` es null por un instante y antes esto
  // volvía la cookie a "familia" en cada recarga, así que el botón
  // "Mis finanzas" parecía no hacer nada.
  useEffect(() => {
    if (!cargando && usuario === null && leerCookie() === 'personal') {
      document.cookie = `${COOKIE_ESPACIO}=familia; path=/; max-age=31536000; SameSite=Lax`
      setEspacio('familia')
    }
  }, [usuario, cargando])

  const moneda = espacio === 'personal' ? perfil?.monedaPersonal || MONEDA_PERSONAL_POR_DEFECTO : MONEDA_FAMILIA
  // Antes de que pinten los hijos: los formateadores de montos leen esto.
  fijarMonedaVigente(moneda)

  function cambiarEspacio(e: TipoEspacio) {
    if (e === espacio) return
    document.cookie = `${COOKIE_ESPACIO}=${e}; path=/; max-age=31536000; SameSite=Lax`
    // Recarga completa: así cada pantalla vuelve a pedir sus datos ya
    // filtrados por el espacio nuevo, sin datos viejos en memoria.
    window.location.reload()
  }

  async function cambiarMonedaPersonal(m: string) {
    const token = await obtenerToken()
    const res = await fetch('/api/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ monedaPersonal: m }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    if (recargarPerfil) await recargarPerfil()
    else window.location.reload()
  }

  return (
    <Contexto.Provider
      value={{ espacio, esPersonal: espacio === 'personal', moneda, simbolo: simboloDe(moneda), cambiarEspacio, cambiarMonedaPersonal }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useEspacio(): Ctx {
  const c = useContext(Contexto)
  if (!c) {
    return {
      espacio: 'familia',
      esPersonal: false,
      moneda: MONEDA_FAMILIA,
      simbolo: 'Bs',
      cambiarEspacio: () => {},
      cambiarMonedaPersonal: async () => {},
    }
  }
  return c
}

export { MONEDAS }
