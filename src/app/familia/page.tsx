'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'

export default function FamiliaPage() {
  const { obtenerToken, usuario } = useAuth()
  const [miembros, setMiembros] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const token = await obtenerToken()
      const res = await fetch('/api/familia', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setMiembros(data.miembros || [])
      setCargando(false)
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Familia</div>
      <div className="font-body text-xs text-inksoft mb-6">
        Todos los que se registran entran con el mismo acceso, sin aprobación previa.
      </div>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}

      {!cargando && (
        <div>
          <div className="font-body text-sm font-semibold text-ink mb-3">
            Miembros de la familia ({miembros.length})
          </div>
          {miembros.map((m) => (
            <div key={m.uid} className="flex items-center justify-between py-2.5 border-b border-line">
              <div>
                <div className="font-body text-sm text-ink">
                  {m.nombre} {m.uid === usuario?.uid && <span className="text-inksoft">(vos)</span>}
                </div>
                <div className="font-body text-[11px] text-inksoft">{m.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PaginaProtegida>
  )
}
