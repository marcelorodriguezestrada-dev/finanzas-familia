'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useEspacio } from '@/lib/espacioCliente'

// soloFamilia: no aparecen en "Mis finanzas" (no tienen sentido en lo personal).
const LINKS: { href: string; label: string; soloFamilia?: boolean }[] = [
  { href: '/', label: 'Resumen' },
  { href: '/informe', label: 'Informe' },
  { href: '/movimientos', label: 'Ingresos y gastos' },
  { href: '/propiedades', label: 'Propiedades' },
  { href: '/alquileres', label: 'Alquileres' },
  { href: '/deudas', label: 'Deudas' },
  { href: '/pendientes', label: 'Por pagar' },
  { href: '/plantillas-contrato', label: 'Plantillas de contrato', soloFamilia: true },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendario', label: 'Calendario' },
  { href: '/administracion', label: 'Fee admin.', soloFamilia: true },
  { href: '/patrimonio', label: 'Patrimonio' },
  { href: '/balance', label: 'Balance mensual' },
]

export function Header() {
  const pathname = usePathname()
  const { perfil, cerrarSesion } = useAuth()
  const { esPersonal, cambiarEspacio } = useEspacio()

  return (
    <div className={`${esPersonal ? 'bg-[#0F4C4A] border-b-4 border-[#3FB8AF]' : 'bg-ink'} px-4 py-3 print:hidden`}>
      <div className="max-w-[880px] mx-auto flex items-center gap-2 flex-wrap">
        <Link href="/" className="font-display text-lg font-bold text-white shrink-0 mr-2">
          {esPersonal ? '👤 Mis finanzas' : '🏠 Finanzas Familia'}
        </Link>
        {/* Selector de espacio: familia (compartido) o lo personal de quien está logueado */}
        <div className="flex rounded-md overflow-hidden border border-white/25 shrink-0" role="group" aria-label="Espacio">
          <button
            onClick={() => cambiarEspacio('familia')}
            aria-pressed={!esPersonal}
            className={`px-2.5 py-1.5 font-body text-[12px] ${!esPersonal ? 'bg-white text-ink font-semibold' : 'text-white/75'}`}
          >
            Familia
          </button>
          <button
            onClick={() => cambiarEspacio('personal')}
            aria-pressed={esPersonal}
            className={`px-2.5 py-1.5 font-body text-[12px] ${esPersonal ? 'bg-white text-[#0F4C4A] font-semibold' : 'text-white/75'}`}
          >
            Mis finanzas
          </button>
        </div>
        <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
          {LINKS.filter((l) => !(esPersonal && l.soloFamilia)).map((l) => (
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
          {!esPersonal && (
          <Link
            href="/familia"
            className={`px-2.5 py-1.5 rounded-md font-body text-[13px] whitespace-nowrap ${
              pathname === '/familia' ? 'bg-white/15 text-white font-semibold' : 'text-white/70'
            }`}
          >
            Miembros
          </Link>
          )}
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
