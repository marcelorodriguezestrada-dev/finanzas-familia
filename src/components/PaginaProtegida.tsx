'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Header } from './Header'

export function PaginaProtegida({ children, soloAdmin = false }: { children: React.ReactNode; soloAdmin?: boolean }) {
  const { usuario, perfil, cargando } = useAuth()

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

  if (!perfil || !perfil.aprobado) {
    return (
      <div className="max-w-[420px] mx-auto px-5 py-20 text-center">
        <div className="font-display text-xl font-bold text-ink mb-3">Esperando aprobación</div>
        <div className="font-body text-sm text-inksoft">
          Tu cuenta todavía no fue aprobada por un admin de la familia. Avisale para que te habilite desde la sección "Familia".
        </div>
      </div>
    )
  }

  if (soloAdmin && perfil.rol !== 'admin') {
    return (
      <div className="max-w-[420px] mx-auto px-5 py-20 text-center">
        <div className="font-body text-sm text-inksoft">Esta sección es solo para admins de la familia.</div>
      </div>
    )
  }

  return (
    <div>
      <Header />
      <div className="max-w-[880px] mx-auto px-5 py-8">{children}</div>
    </div>
  )
}
