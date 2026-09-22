'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { ESTADOS_UNIDAD, COMODIDADES, TIPOS_UNIDAD } from '@/data/inmuebles'
import { FormUnidad } from './FormUnidad'
import { Reparaciones } from './Reparaciones'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

export function TarjetaUnidad({ unidad, onCambio }: { unidad: any; onCambio: () => void }) {
  const { obtenerToken } = useAuth()
  const [editando, setEditando] = useState(false)
  const [expandido, setExpandido] = useState(false)

  const estadoInfo = ESTADOS_UNIDAD.find((e) => e.id === unidad.estado)
  const tipoInfo = TIPOS_UNIDAD.find((t) => t.id === unidad.tipo)

  async function borrar() {
    if (!confirm(`¿Borrar "${unidad.nombre}"? Esto no se puede deshacer.`)) return
    const token = await obtenerToken()
    const res = await fetch(`/api/unidades/${unidad.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.error) return alert(data.error)
    onCambio()
  }

  if (editando) {
    return (
      <FormUnidad
        propiedadId={unidad.propiedadId}
        inicial={unidad}
        onGuardado={() => { setEditando(false); onCambio() }}
        onCancelar={() => setEditando(false)}
      />
    )
  }

  return (
    <div className="border border-line rounded-lg p-3.5 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-body text-sm font-semibold text-ink">{unidad.nombre}</div>
          <div className="font-body text-[11px] text-inksoft">{tipoInfo?.label}{unidad.metros ? ` · ${unidad.metros} m²` : ''}</div>
        </div>
        <div className={`font-body text-[10px] font-semibold ${estadoInfo?.color || 'text-inksoft'} shrink-0`}>
          ● {estadoInfo?.label}
        </div>
      </div>

      {unidad.comodidades?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {unidad.comodidades.map((c: string) => (
            <span key={c} className="px-2 py-0.5 rounded-full bg-panel font-body text-[10px] text-inksoft">
              {COMODIDADES.find((x) => x.id === c)?.label || c}
            </span>
          ))}
        </div>
      )}

      <div className="font-display text-base font-bold text-ink mt-2">
        {bs(unidad.canonEstandar)}<span className="font-body text-[11px] font-normal text-inksoft"> /mes canon estándar</span>
      </div>

      {unidad.notas && <div className="font-body text-[11px] text-inksoft mt-1">{unidad.notas}</div>}

      <div className="flex gap-2 flex-wrap mt-3">
        {unidad.estado !== 'alquilada' && (
          <Link href={`/alquileres?unidadId=${unidad.id}`} className="px-3 py-1.5 rounded-md bg-ink text-white font-body text-[11px] font-semibold">
            Asignar alquiler
          </Link>
        )}
        {unidad.estado === 'alquilada' && (
          <Link href={`/alquileres?unidadId=${unidad.id}`} className="px-3 py-1.5 rounded-md border border-line font-body text-[11px] text-ink">
            Ver alquiler activo
          </Link>
        )}
        <button onClick={() => setEditando(true)} className="px-3 py-1.5 rounded-md border border-line font-body text-[11px] text-inksoft">
          Editar ficha
        </button>
        <button onClick={borrar} className="px-3 py-1.5 rounded-md border border-line font-body text-[11px] text-rojo">
          Borrar
        </button>
        <button onClick={() => setExpandido((v) => !v)} className="px-3 py-1.5 rounded-md border border-line font-body text-[11px] text-inksoft ml-auto">
          {expandido ? 'Ocultar reparaciones' : 'Ver reparaciones'}
        </button>
      </div>

      {expandido && <Reparaciones propiedadId={unidad.propiedadId} unidadId={unidad.id} />}
    </div>
  )
}
