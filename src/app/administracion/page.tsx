'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

export default function AdministracionPage() {
  const { obtenerToken } = useAuth()
  const [liquidaciones, setLiquidaciones] = useState<any[]>([])
  const [porcentaje, setPorcentaje] = useState(0.05)
  const [cargando, setCargando] = useState(true)
  const [anio, setAnio] = useState(new Date().getFullYear().toString())
  const [calculando, setCalculando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const res = await fetch('/api/liquidaciones-fee', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setLiquidaciones(data.liquidaciones || [])
    setPorcentaje(data.porcentaje ?? 0.05)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function calcular(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCalculando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/liquidaciones-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ anio: Number(anio) }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      cargar()
    } finally {
      setCalculando(false)
    }
  }

  async function marcarPagada(id: string, pagada: boolean) {
    const token = await obtenerToken()
    await fetch(`/api/liquidaciones-fee/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pagada }),
    })
    cargar()
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar esta liquidación?')) return
    const token = await obtenerToken()
    await fetch(`/api/liquidaciones-fee/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  const liquidacionesPorAnio = liquidaciones.reduce((acc: Record<number, any[]>, l) => {
    acc[l.anio] = acc[l.anio] || []
    acc[l.anio].push(l)
    return acc
  }, {})

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Incentivo de administración</div>
      <div className="font-body text-xs text-inksoft mb-6">
        Fee del {Math.round(porcentaje * 100)}% sobre el monto total administrado por año, a favor de quien gestiona cada espacio.
        Se calcula una vez al año, en la reunión familiar de evaluación.
      </div>

      <form onSubmit={calcular} className="bg-panel border border-line rounded-xl p-5 mb-8">
        <div className="font-body text-sm font-semibold text-ink mb-2">Calcular liquidación de un año</div>
        <div className="flex gap-2">
          <input value={anio} onChange={(e) => setAnio(e.target.value)} type="number" className="flex-1 px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
          <button type="submit" disabled={calculando} className="px-4 py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
            {calculando ? 'Calculando...' : 'Calcular'}
          </button>
        </div>
        <div className="font-body text-[11px] text-inksoft mt-2">
          Suma todos los cobros de alquiler de ese año, agrupados por quién administra cada espacio, y calcula el {Math.round(porcentaje * 100)}% de cada uno.
        </div>
        {error && <div className="font-body text-xs text-rojo mt-2">{error}</div>}
      </form>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      {!cargando && liquidaciones.length === 0 && (
        <div className="font-body text-sm text-inksoft">Todavía no se calculó ninguna liquidación.</div>
      )}

      {Object.keys(liquidacionesPorAnio)
        .sort((a, b) => Number(b) - Number(a))
        .map((anioKey) => (
          <div key={anioKey} className="mb-6">
            <div className="font-body text-sm font-semibold text-ink mb-2">Año {anioKey}</div>
            {liquidacionesPorAnio[Number(anioKey)].map((l: any) => (
              <div key={l.id} className="border border-line rounded-lg p-4 mb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-body text-sm font-semibold text-ink">{l.administradorNombre}</div>
                    <div className="font-body text-[11px] text-inksoft">Administró {bs(l.totalAdministrado)} en cobros de alquiler</div>
                  </div>
                  <div className={`font-body text-[10px] font-semibold shrink-0 ${l.pagada ? 'text-verde' : 'text-amber-600'}`}>
                    ● {l.pagada ? 'Pagada' : 'Pendiente'}
                  </div>
                </div>
                <div className="font-display text-lg font-bold text-verde mt-2">{bs(l.fee)}</div>
                <div className="flex gap-3 mt-2">
                  <button onClick={() => marcarPagada(l.id, !l.pagada)} className="font-body text-[11px] text-ink underline">
                    {l.pagada ? 'Marcar como pendiente' : 'Marcar como pagada'}
                  </button>
                  <button onClick={() => borrar(l.id)} className="font-body text-[11px] text-rojo underline">
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
    </PaginaProtegida>
  )
}
