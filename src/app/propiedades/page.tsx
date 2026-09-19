'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { mesActual } from '@/data/categorias'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

export default function PropiedadesPage() {
  const { obtenerToken, perfil } = useAuth()
  const [propiedades, setPropiedades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [inquilino, setInquilino] = useState('')
  const [montoAlquiler, setMontoAlquiler] = useState('')
  const [diaCobro, setDiaCobro] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [mensajeCobro, setMensajeCobro] = useState<Record<string, string>>({})

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const res = await fetch('/api/propiedades', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setPropiedades(data.propiedades || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombre.trim() || !montoAlquiler) {
      setError('Poné al menos el nombre y el monto del alquiler.')
      return
    }
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/propiedades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre, direccion, inquilino, montoAlquiler, diaCobro: diaCobro || null }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setNombre(''); setDireccion(''); setInquilino(''); setMontoAlquiler(''); setDiaCobro('')
      setMostrarForm(false)
      cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function cobrarAlquiler(propiedadId: string) {
    setCobrando(propiedadId)
    setMensajeCobro((m) => ({ ...m, [propiedadId]: '' }))
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/cobrar-alquiler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ propiedadId, mes: mesActual() }),
      })
      const data = await res.json()
      setMensajeCobro((m) => ({ ...m, [propiedadId]: data.error || '✓ Registrado como ingreso de este mes.' }))
    } finally {
      setCobrando(null)
    }
  }

  return (
    <PaginaProtegida>
      <div className="flex items-center justify-between mb-6">
        <div className="font-display text-xl font-bold text-ink">Propiedades</div>
        <button
          onClick={() => setMostrarForm((v) => !v)}
          className="px-3.5 py-2 rounded-lg border-none bg-ink text-white font-body text-xs font-semibold"
        >
          {mostrarForm ? 'Cancelar' : '+ Agregar propiedad'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={agregar} className="bg-panel border border-line rounded-xl p-5 mb-6">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej: Depto Sopocachi)" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección (opcional)" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          <input value={inquilino} onChange={(e) => setInquilino(e.target.value)} placeholder="Inquilino actual (opcional)" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={montoAlquiler} onChange={(e) => setMontoAlquiler(e.target.value)} type="number" placeholder="Alquiler mensual (Bs)" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
            <input value={diaCobro} onChange={(e) => setDiaCobro(e.target.value)} type="number" min={1} max={31} placeholder="Día de cobro (opcional)" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
          </div>
          {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}
          <button type="submit" disabled={guardando} className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Guardando...' : 'Guardar propiedad'}
          </button>
        </form>
      )}

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      {!cargando && propiedades.length === 0 && (
        <div className="font-body text-sm text-inksoft">Todavía no cargaste ninguna propiedad.</div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {propiedades.map((p) => (
          <div key={p.id} className="bg-panel border border-line rounded-xl p-4">
            <div className="font-body text-sm font-semibold text-ink">{p.nombre}</div>
            {p.direccion && <div className="font-body text-xs text-inksoft">{p.direccion}</div>}
            {p.inquilino && <div className="font-body text-xs text-inksoft">Inquilino: {p.inquilino}</div>}
            <div className="font-display text-lg font-bold text-verde mt-1">{bs(p.montoAlquiler)}/mes</div>
            {p.diaCobro && <div className="font-body text-[11px] text-inksoft mb-2">Se cobra el día {p.diaCobro}</div>}

            <button
              onClick={() => cobrarAlquiler(p.id)}
              disabled={cobrando === p.id}
              className="mt-2 px-3 py-1.5 rounded-md border border-line font-body text-xs text-verde disabled:opacity-50"
            >
              {cobrando === p.id ? 'Registrando...' : '✓ Marcar alquiler de este mes como cobrado'}
            </button>
            {mensajeCobro[p.id] && (
              <div className={`font-body text-[11px] mt-1.5 ${mensajeCobro[p.id].startsWith('✓') ? 'text-verde' : 'text-rojo'}`}>
                {mensajeCobro[p.id]}
              </div>
            )}
          </div>
        ))}
      </div>
    </PaginaProtegida>
  )
}
