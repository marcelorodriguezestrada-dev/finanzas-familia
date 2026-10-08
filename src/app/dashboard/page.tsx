'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { useEspacio } from '@/lib/espacioCliente'
import { Panel } from './_componentes/Panel'

// Panel de finanzas del espacio activo (Familia o Mis finanzas).
export default function DashboardPage() {
  const { obtenerToken } = useAuth()
  const { esPersonal } = useEspacio()
  const [datos, setDatos] = useState<any | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const token = await obtenerToken()
        const h = { Authorization: `Bearer ${token}` }
        const urls = ['/api/movimientos', '/api/pendientes', '/api/alquileres', '/api/deudas', '/api/propiedades']
        const [mov, pen, alq, deu, prop] = await Promise.all(urls.map((u) => fetch(u, { headers: h }).then((r) => r.json())))
        if (mov.error) return setError(mov.error)
        setDatos({ movimientos: mov.movimientos || [], pendientes: pen.pendientes || [], alquileres: alq.alquileres || [], deudas: deu.deudas || [], propiedades: prop.propiedades || [] })
      } catch (err: any) {
        setError(err.message || 'No se pudieron cargar los datos.')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">{esPersonal ? 'Cómo van mis finanzas' : 'Cómo van las finanzas de la familia'}</div>
      <div className="font-body text-xs text-inksoft mb-5">Cuánto ahorrás, en qué se va la plata, si estás gastando más que lo normal y qué se viene.</div>
      {error && <div className="font-body text-sm text-rojo mb-4">{error}</div>}
      {!datos && !error && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      {datos && <Panel datos={datos} propiedades={datos.propiedades} mostrarPersonas={!esPersonal} />}
    </PaginaProtegida>
  )
}
