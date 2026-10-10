'use client'

import { useState } from 'react'
import { useEspacio, MONEDAS } from '@/lib/espacioCliente'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Header } from './Header'

export function PaginaProtegida({ children, ancho = false }: { children: React.ReactNode; ancho?: boolean }) {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return <div className="max-w-[480px] mx-auto px-5 py-20 text-center font-body text-sm text-inksoft">Cargando...</div>
  }

  if (!usuario) {
    return (
      <div className="max-w-[420px] mx-auto px-5 py-20 text-center">
        <div className="font-display text-xl font-bold text-ink mb-3">Finanzas de la Familia</div>
        <div className="font-body text-sm text-inksoft mb-5">Necesitás iniciar sesión para entrar.</div>
        <Link href="/login" className="inline-block px-4 py-2.5 rounded-lg bg-ink text-white font-body text-sm font-semibold">
          Ir al login
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Header />
      <AvisoEspacioPersonal />
      <div className={`${ancho ? 'max-w-[1600px]' : 'max-w-[880px]'} mx-auto px-5 py-8 print:max-w-none print:p-0`}>{children}</div>
    </div>
  )
}

// Franja que aparece solo en "Mis finanzas": recuerda que lo que se carga
// acá es privado y permite elegir la moneda del espacio personal.
function AvisoEspacioPersonal() {
  const { esPersonal, moneda, cambiarMonedaPersonal } = useEspacio()
  const [guardando, setGuardando] = useState(false)
  if (!esPersonal) return null
  return (
    <div className="bg-[#E3F4F2] border-b border-[#9FD8D3] print:hidden">
      <div className="max-w-[880px] mx-auto px-5 py-2 flex items-center gap-3 flex-wrap font-body text-[12px] text-[#0F4C4A]">
        <span className="flex-1 min-w-[14rem]">
          <b>Estás en Mis finanzas.</b> Lo que cargues acá solo lo ves vos y no suma en los números de la familia.
        </span>
        <label className="flex items-center gap-1.5">
          Moneda
          <select
            value={moneda}
            disabled={guardando}
            onChange={async (e) => {
              const nueva = e.target.value
              if (!confirm(`¿Usar ${MONEDAS[nueva].nombre} en Mis finanzas? Solo se puede mientras no haya movimientos personales cargados en otra moneda.`)) return
              setGuardando(true)
              try {
                await cambiarMonedaPersonal(nueva)
              } catch (err: any) {
                alert(err.message || 'No se pudo cambiar la moneda.')
              } finally {
                setGuardando(false)
              }
            }}
            className="px-2 py-1 rounded border border-[#9FD8D3] bg-white text-[#0F4C4A]"
          >
            {Object.entries(MONEDAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.simbolo} · {v.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
