'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, mesActual } from '@/data/categorias'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function MovimientosPage() {
  const { obtenerToken, perfil, usuario } = useAuth()

  const [mesFiltro, setMesFiltro] = useState(mesActual())
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto')
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS_GASTO[0])
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const res = await fetch(`/api/movimientos?mes=${mesFiltro}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setMovimientos(data.movimientos || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesFiltro])

  function cambiarTipo(nuevo: 'gasto' | 'ingreso') {
    setTipo(nuevo)
    setCategoria(nuevo === 'gasto' ? CATEGORIAS_GASTO[0] : CATEGORIAS_INGRESO[0])
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!monto || Number(monto) <= 0) {
      setError('Poné un monto válido.')
      return
    }
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo, monto, categoria, descripcion, fecha }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setMonto('')
      setDescripcion('')
      setFecha(hoyISO())
      if (fecha.slice(0, 7) === mesFiltro) cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este movimiento?')) return
    const token = await obtenerToken()
    await fetch(`/api/movimientos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const gastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-6">Ingresos y gastos</div>

      <form onSubmit={agregar} className="bg-panel border border-line rounded-xl p-5 mb-8">
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => cambiarTipo('gasto')}
            className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border ${tipo === 'gasto' ? 'bg-rojo text-white border-rojo' : 'border-line text-inksoft'}`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => cambiarTipo('ingreso')}
            className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border ${tipo === 'ingreso' ? 'bg-verde text-white border-verde' : 'border-line text-inksoft'}`}
          >
            Ingreso
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            type="number"
            placeholder="Monto en Bs"
            className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm"
          />
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-panel"
          >
            {(tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción (opcional)"
          className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
        />

        <input
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          type="date"
          className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
        />

        {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}

        <button
          type="submit"
          disabled={guardando}
          className={`w-full py-2.5 rounded-lg border-none text-white font-body text-sm font-semibold disabled:opacity-60 ${tipo === 'gasto' ? 'bg-rojo' : 'bg-verde'}`}
        >
          {guardando ? 'Guardando...' : `Cargar ${tipo}`}
        </button>
      </form>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <input
          type="month"
          value={mesFiltro}
          onChange={(e) => setMesFiltro(e.target.value)}
          className="px-3 py-2 rounded-lg border border-line font-body text-sm"
        />
        <div className="font-body text-xs text-inksoft">
          Ingresos: <span className="text-verde font-semibold">{bs(ingresos)}</span> · Gastos: <span className="text-rojo font-semibold">{bs(gastos)}</span>
        </div>
      </div>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      {!cargando && movimientos.length === 0 && (
        <div className="font-body text-sm text-inksoft">No hay movimientos este mes.</div>
      )}
      {!cargando && [...movimientos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map((m) => (
        <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-line">
          <div>
            <div className="font-body text-sm text-ink">{m.descripcion || m.categoria}</div>
            <div className="font-body text-[11px] text-inksoft">{m.categoria} · {m.fecha} · {m.registradoPorNombre}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`font-body text-sm font-semibold ${m.tipo === 'ingreso' ? 'text-verde' : 'text-rojo'}`}>
              {m.tipo === 'ingreso' ? '+' : '-'}{bs(m.monto)}
            </div>
            <button onClick={() => borrar(m.id)} className="font-body text-[11px] text-rojo underline">
              Borrar
            </button>
          </div>
        </div>
      ))}
    </PaginaProtegida>
  )
}
