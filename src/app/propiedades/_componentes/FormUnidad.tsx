'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { TIPOS_UNIDAD, COMODIDADES, Comodidad, TipoUnidad } from '@/data/inmuebles'

export function FormUnidad({
  propiedadId,
  onGuardado,
  onCancelar,
  inicial,
}: {
  propiedadId: string
  onGuardado: () => void
  onCancelar: () => void
  inicial?: any
}) {
  const { obtenerToken } = useAuth()
  const [nombre, setNombre] = useState(inicial?.nombre || '')
  const [tipo, setTipo] = useState<TipoUnidad>(inicial?.tipo || 'departamento')
  const [comodidades, setComodidades] = useState<Comodidad[]>(inicial?.comodidades || [])
  const [metros, setMetros] = useState(inicial?.metros?.toString() || '')
  const [canonEstandar, setCanonEstandar] = useState(inicial?.canonEstandar?.toString() || '')
  const [notas, setNotas] = useState(inicial?.notas || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function toggleComodidad(c: Comodidad) {
    setComodidades((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Ponele un nombre a este espacio (ej: "Depto 1").')
    if (!canonEstandar || Number(canonEstandar) <= 0) return setError('Cargá el canon de alquiler estándar recomendado.')

    setGuardando(true)
    try {
      const token = await obtenerToken()
      const body = { propiedadId, nombre, tipo, comodidades, metros: metros || null, canonEstandar, notas }
      const url = inicial ? `/api/unidades/${inicial.id}` : '/api/unidades'
      const res = await fetch(url, {
        method: inicial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="bg-white border border-line rounded-lg p-4 mb-3">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder='Nombre del espacio (ej: "Depto 1")'
          className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoUnidad)}
          className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-white"
        >
          {TIPOS_UNIDAD.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="font-body text-[11px] text-inksoft mb-1.5">Características del ambiente</div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {COMODIDADES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => toggleComodidad(c.id)}
            className={`px-2.5 py-1 rounded-full font-body text-[11px] border ${
              comodidades.includes(c.id) ? 'bg-ink text-white border-ink' : 'border-line text-inksoft'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Canon estándar recomendado (Bs/mes)</label>
          <input
            value={canonEstandar}
            onChange={(e) => setCanonEstandar(e.target.value)}
            type="number"
            placeholder="Ej: 1300"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm"
          />
        </div>
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Metros cuadrados (opcional)</label>
          <input
            value={metros}
            onChange={(e) => setMetros(e.target.value)}
            type="number"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm"
          />
        </div>
      </div>

      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas del espacio (opcional)"
        rows={2}
        className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
      />

      {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}

      <div className="flex gap-2">
        <button type="submit" disabled={guardando} className="flex-1 py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
          {guardando ? 'Guardando...' : inicial ? 'Guardar cambios' : 'Agregar espacio'}
        </button>
        <button type="button" onClick={onCancelar} className="px-4 py-2.5 rounded-lg border border-line font-body text-sm text-inksoft">
          Cancelar
        </button>
      </div>
    </form>
  )
}
