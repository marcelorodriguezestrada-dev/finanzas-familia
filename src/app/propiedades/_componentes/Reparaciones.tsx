'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { subirArchivo } from '@/lib/subirArchivo'
import { PrioridadReparacion } from '@/data/inmuebles'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

const COLOR_PRIORIDAD: Record<PrioridadReparacion, string> = {
  baja: 'text-inksoft',
  media: 'text-amber-600',
  urgente: 'text-rojo',
}

export function Reparaciones({ propiedadId, unidadId }: { propiedadId: string; unidadId?: string }) {
  const { obtenerToken, perfil } = useAuth()
  const [reparaciones, setReparaciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  const [detalle, setDetalle] = useState('')
  const [prioridad, setPrioridad] = useState<PrioridadReparacion>('media')
  const [solicitadoPor, setSolicitadoPor] = useState('')
  const [costoEstimado, setCostoEstimado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [resolviendoId, setResolviendoId] = useState<string | null>(null)
  const [montoGasto, setMontoGasto] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [subiendoComprobante, setSubiendoComprobante] = useState(false)

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const params = unidadId ? `unidadId=${unidadId}` : `propiedadId=${propiedadId}`
    const res = await fetch(`/api/reparaciones?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setReparaciones(data.reparaciones || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadId, propiedadId])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!detalle.trim()) return setError('Contá qué hay que reparar.')
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/reparaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ propiedadId, unidadId: unidadId || null, detalle, prioridad, solicitadoPor, costoEstimado: costoEstimado || null }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      setDetalle(''); setSolicitadoPor(''); setCostoEstimado(''); setPrioridad('media')
      setMostrarForm(false)
      cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function marcarResuelta(id: string) {
    setSubiendoComprobante(true)
    try {
      let comprobanteUrl: string | undefined
      if (comprobante) {
        comprobanteUrl = await subirArchivo(comprobante, obtenerToken)
      }
      const token = await obtenerToken()
      await fetch(`/api/reparaciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resuelta: true, montoGasto: montoGasto || null, comprobanteUrl }),
      })
      setResolviendoId(null)
      setMontoGasto('')
      setComprobante(null)
      cargar()
    } catch (err: any) {
      alert(err.message || 'No se pudo marcar como resuelta.')
    } finally {
      setSubiendoComprobante(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar esta reparación del historial?')) return
    const token = await obtenerToken()
    await fetch(`/api/reparaciones/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  const pendientes = reparaciones.filter((r) => !r.resuelta)
  const resueltas = reparaciones.filter((r) => r.resuelta)

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-body text-xs font-semibold text-ink">
          Reparaciones {pendientes.length > 0 && <span className="text-rojo">({pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''})</span>}
        </div>
        <button onClick={() => setMostrarForm((v) => !v)} className="font-body text-[11px] text-ink underline">
          {mostrarForm ? 'Cancelar' : '+ Anotar reparación'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={agregar} className="bg-panel border border-line rounded-lg p-3 mb-3">
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Qué hay que arreglar (ej: gotera en el techo del baño)"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-line font-body text-xs mb-2"
          />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadReparacion)} className="px-3 py-2 rounded-lg border border-line font-body text-xs bg-white">
              <option value="baja">Prioridad baja</option>
              <option value="media">Prioridad media</option>
              <option value="urgente">Urgente</option>
            </select>
            <input value={costoEstimado} onChange={(e) => setCostoEstimado(e.target.value)} type="number" placeholder="Costo estimado (opcional)" className="px-3 py-2 rounded-lg border border-line font-body text-xs" />
          </div>
          <input value={solicitadoPor} onChange={(e) => setSolicitadoPor(e.target.value)} placeholder="Quién lo pidió (inquilino, o alguien de la familia)" className="w-full px-3 py-2 rounded-lg border border-line font-body text-xs mb-2" />
          {error && <div className="font-body text-[11px] text-rojo mb-2">{error}</div>}
          <button type="submit" disabled={guardando} className="w-full py-2 rounded-lg border-none bg-ink text-white font-body text-xs font-semibold disabled:opacity-60">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      )}

      {cargando && <div className="font-body text-[11px] text-inksoft">Cargando reparaciones...</div>}

      {pendientes.map((r) => (
        <div key={r.id} className="border border-line rounded-lg p-3 mb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-body text-xs text-ink">{r.detalle}</div>
              <div className={`font-body text-[10px] mt-0.5 ${COLOR_PRIORIDAD[r.prioridad as PrioridadReparacion]}`}>
                {r.prioridad === 'urgente' ? '● Urgente' : r.prioridad === 'media' ? '● Prioridad media' : '● Prioridad baja'}
                {r.solicitadoPor && <span className="text-inksoft"> · Pidió: {r.solicitadoPor}</span>}
                {r.costoEstimado ? <span className="text-inksoft"> · Est. {bs(r.costoEstimado)}</span> : null}
              </div>
            </div>
            <button onClick={() => borrar(r.id)} className="font-body text-[10px] text-inksoft underline shrink-0">Borrar</button>
          </div>

          {resolviendoId === r.id ? (
            <div className="mt-2 bg-panel rounded-lg p-2.5">
              <div className="font-body text-[11px] text-inksoft mb-1.5">
                Si hubo gasto de arreglo, cargalo acá con su comprobante para que se descuente en el dashboard.
              </div>
              <input value={montoGasto} onChange={(e) => setMontoGasto(e.target.value)} type="number" placeholder="Monto gastado en Bs (opcional)" className="w-full px-3 py-1.5 rounded-lg border border-line font-body text-xs mb-2" />
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setComprobante(e.target.files?.[0] || null)} className="w-full font-body text-[11px] mb-2" />
              <div className="flex gap-2">
                <button onClick={() => marcarResuelta(r.id)} disabled={subiendoComprobante} className="flex-1 py-1.5 rounded-lg border-none bg-verde text-white font-body text-[11px] font-semibold disabled:opacity-60">
                  {subiendoComprobante ? 'Guardando...' : 'Confirmar resuelta'}
                </button>
                <button onClick={() => setResolviendoId(null)} className="px-3 py-1.5 rounded-lg border border-line font-body text-[11px] text-inksoft">Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setResolviendoId(r.id)} className="mt-2 font-body text-[11px] text-verde underline">
              Marcar como resuelta
            </button>
          )}
        </div>
      ))}

      {pendientes.length === 0 && !cargando && (
        <div className="font-body text-[11px] text-inksoft mb-2">No hay reparaciones pendientes.</div>
      )}

      {resueltas.length > 0 && (
        <details className="mt-1">
          <summary className="font-body text-[11px] text-inksoft cursor-pointer">Ver {resueltas.length} reparación(es) resuelta(s)</summary>
          {resueltas.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-line">
              <div className="font-body text-[11px] text-inksoft line-through">{r.detalle}</div>
              <div className="font-body text-[10px] text-inksoft">{r.resueltaEn?.slice(0, 10)}</div>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
