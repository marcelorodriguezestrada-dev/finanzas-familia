'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'

const LINKS = [
  { href: '/', label: 'Resumen' },
  { href: '/movimientos', label: 'Ingresos y gastos' },
  { href: '/propiedades', label: 'Propiedades' },
  { href: '/alquileres', label: 'Alquileres' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendario', label: 'Calendario' },
  { href: '/administracion', label: 'Fee admin.' },
  { href: '/patrimonio', label: 'Patrimonio' },
  { href: '/balance', label: 'Balance mensual' },
]

export function Header() {
  const pathname = usePathname()
  const { perfil, cerrarSesion } = useAuth()

  return (
    <div className="bg-ink px-4 py-3">
      <div className="max-w-[880px] mx-auto flex items-center gap-2 flex-wrap">
        <Link href="/" className="font-display text-lg font-bold text-white shrink-0 mr-2">
          🏠 Finanzas Familia
        </Link>
        <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-2.5 py-1.5 rounded-md font-body text-[13px] whitespace-nowrap ${
                pathname === l.href ? 'bg-white/15 text-white font-semibold' : 'text-white/70'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/familia"
            className={`px-2.5 py-1.5 rounded-md font-body text-[13px] whitespace-nowrap ${
              pathname === '/familia' ? 'bg-white/15 text-white font-semibold' : 'text-white/70'
            }`}
          >
            Familia
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {perfil && <span className="font-body text-[12px] text-white/60 hidden sm:inline">{perfil.nombre}</span>}
          <button
            onClick={cerrarSesion}
            className="font-body text-[12px] text-white/70 border border-white/20 rounded-md px-2 py-1"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}
