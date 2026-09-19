'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { Header } from './Header'

export function PaginaProtegida({ children }: { children: React.ReactNode }) {
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
      <div className="max-w-[880px] mx-auto px-5 py-8">{children}</div>
    </div>
  )
}
