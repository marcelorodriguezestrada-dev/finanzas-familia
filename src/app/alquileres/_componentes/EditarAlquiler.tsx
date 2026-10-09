'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { useEspacio } from '@/lib/espacioCliente'
import { fechaCorta } from '@/lib/esquemaPago'

// Edición de un alquiler ya registrado: inquilino, quién administra
// (desde qué fecha), departamento, fechas, día de pago, anticipo, estado
// y notas. El plan de pago (canon) se edita aparte con "Editar plan de
// pago". Solo se mandan los campos que cambiaron.
export function EditarAlquiler({
  alquiler: a,
  miembros,
  propiedades,
  unidades,
  alquileres,
  onGuardado,
  onCancelar,
}: {
  alquiler: any
  miembros: any[]
  propiedades: any[]
  unidades: any[]
  alquileres: any[]
  onGuardado: (msg: string) => void
  onCancelar: () => void
}) {
  const { obtenerToken } = useAuth()
  const { esPersonal } = useEspacio()
  const hoy = new Date().toISOString().slice(0, 10)
  const inicial = {
    inquilinoNombre: a.inquilinoNombre || '',
    inquilinoCI: a.inquilinoCI || '',
    inquilinoTelefono: a.inquilinoTelefono || '',
    administradorUid: a.administradorUid || '',
    unidadId: a.unidadId || '',
    fechaInicio: a.fechaInicio || '',
    fechaFin: a.fechaFin || '',
    diaCobro: String(a.diaCobro || 1),
    anticipo: a.anticipo ? String(a.anticipo) : '',
    estado: a.estado || 'activo',
    notas: a.notas || '',
  }
  const [f, setF] = useState(inicial)
  const [administradorDesde, setAdministradorDesde] = useState(hoy)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof inicial, v: string) => setF((x) => ({ ...x, [k]: v }))

  const cambioAdmin = f.administradorUid !== inicial.administradorUid
  const cambioUnidad = f.unidadId !== inicial.unidadId
  const historialAdmin: any[] = a.historialAdministracion || []
  // Departamentos ocupados por otro alquiler activo.
  const ocupadas = new Set(alquileres.filter((x) => x.estado === 'activo' && x.id !== a.id).map((x) => x.unidadId))

  async function guardar() {
    setError('')
    const cuerpo: Record<string, any> = {}
    for (const k of Object.keys(inicial) as (keyof typeof inicial)[]) {
      if (f[k] !== inicial[k]) cuerpo[k] = k === 'fechaFin' ? f[k] || null : k === 'anticipo' ? (f[k] ? Number(f[k]) : null) : k === 'diaCobro' ? Number(f[k]) : f[k]
    }
    if (!Object.keys(cuerpo).length) return onCancelar()
    if (cambioAdmin) cuerpo.administradorDesde = administradorDesde
    if (motivo.trim()) cuerpo.motivo = motivo.trim()
    if (cambioUnidad && !confirm('¿Pasar este alquiler a otro departamento? El actual quedará libre.')) return
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const d = await fetch(`/api/alquileres/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cuerpo),
      }).then((r) => r.json())
      if (d.error) return setError(d.error)
      onGuardado(d.sinCambios ? 'No había cambios.' : `✓ Guardado: ${(d.cambiados || []).join(', ')}.`)
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const input = 'w-full px-3 py-2 rounded-lg border border-line font-body text-sm text-ink bg-white'
  const et = 'font-body text-[11px] text-inksoft block mb-1'
  const nombreProp = (id: string) => propiedades.find((p) => p.id === id)?.nombre || ''

  return (
    <div className="mt-3 border border-line rounded-lg p-4 bg-panelalt/60">
      <div className="font-body text-sm font-semibold text-ink mb-3">Editar alquiler</div>

      <div className="font-body text-xs font-semibold text-ink mb-1">Inquilino</div>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div><label className={et}>Nombre</label><input value={f.inquilinoNombre} onChange={(e) => set('inquilinoNombre', e.target.value)} className={input} /></div>
        <div><label className={et}>C.I.</label><input value={f.inquilinoCI} onChange={(e) => set('inquilinoCI', e.target.value)} className={input} /></div>
        <div><label className={et}>Teléfono</label><input value={f.inquilinoTelefono} onChange={(e) => set('inquilinoTelefono', e.target.value)} className={input} /></div>
      </div>

      {!esPersonal && (
        <>
          <div className="font-body text-xs font-semibold text-ink mb-1">Quién lo administra</div>
          <div className="grid sm:grid-cols-2 gap-3 mb-1">
            <div>
              <label className={et}>Administrador/a</label>
              <select value={f.administradorUid} onChange={(e) => set('administradorUid', e.target.value)} className={input}>
                {!f.administradorUid && <option value="">—</option>}
                {miembros.map((m) => <option key={m.uid} value={m.uid}>{m.nombre}</option>)}
              </select>
            </div>
            {cambioAdmin && (
              <div>
                <label className={et}>Administra desde</label>
                <input type="date" value={administradorDesde} onChange={(e) => setAdministradorDesde(e.target.value)} className={input} />
              </div>
            )}
          </div>
          {cambioAdmin && (
            <div className="font-body text-[11px] text-inksoft mb-1">
              Los cobros anteriores a esa fecha siguen contando para el fee de {a.administradorNombre || 'quien administraba antes'}; desde esa fecha, para la nueva persona.
            </div>
          )}
          {historialAdmin.length > 1 && (
            <div className="font-body text-[11px] text-inksoft mb-1">
              Historial: {historialAdmin.map((h) => `${h.nombre} desde ${fechaCorta(h.desde)}`).join(' → ')}
            </div>
          )}
          <div className="mb-4" />
        </>
      )}

      <div className="font-body text-xs font-semibold text-ink mb-1">Contrato</div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2">
          <label className={et}>Departamento</label>
          <select value={f.unidadId} onChange={(e) => set('unidadId', e.target.value)} className={input}>
            {unidades.map((u) => (
              <option key={u.id} value={u.id} disabled={u.id !== a.unidadId && ocupadas.has(u.id) && f.estado === 'activo'}>
                {nombreProp(u.propiedadId)} — {u.nombre}
                {u.id !== a.unidadId && ocupadas.has(u.id) ? ' (ocupado)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div><label className={et}>Fecha de inicio</label><input type="date" value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} className={input} /></div>
        <div><label className={et}>Fecha de fin / entrega (opcional)</label><input type="date" value={f.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} className={input} /></div>
        <div><label className={et}>Paga dentro de los primeros ... días</label><input type="number" min={1} max={28} value={f.diaCobro} onChange={(e) => set('diaCobro', e.target.value)} className={input} /></div>
        <div><label className={et}>Anticipo / garantía</label><input type="number" value={f.anticipo} onChange={(e) => set('anticipo', e.target.value)} className={input} /></div>
        <div>
          <label className={et}>Estado</label>
          <select value={f.estado} onChange={(e) => set('estado', e.target.value)} className={input}>
            <option value="activo">Activo</option>
            <option value="finalizado">Finalizado</option>
            <option value="rescindido">Rescindido</option>
          </select>
        </div>
      </div>
      {(f.fechaInicio !== inicial.fechaInicio || f.fechaFin !== inicial.fechaFin || f.diaCobro !== inicial.diaCobro) && (
        <div className="font-body text-[11px] text-[#6A5011] mb-3">Cambiar fechas o el día de pago recalcula el plan de pagos (cuotas proporcionales, vencimientos y moras).</div>
      )}

      <div className="mb-3"><label className={et}>Notas</label><textarea value={f.notas} onChange={(e) => set('notas', e.target.value)} rows={2} className={input} /></div>
      <div className="mb-3"><label className={et}>Motivo del cambio (opcional, queda en el historial)</label><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Verónica pasa a administrar desde noviembre" className={input} /></div>

      {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}
      <div className="flex gap-2">
        <button onClick={guardar} disabled={guardando} className="flex-1 min-h-[44px] rounded-lg bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button onClick={onCancelar} className="px-4 min-h-[44px] rounded-lg border border-line bg-white font-body text-sm text-ink">Cancelar</button>
      </div>

      {(a.historialCambios || []).length > 0 && (
        <details className="mt-4">
          <summary className="font-body text-[11px] text-ink underline cursor-pointer">Historial de cambios ({a.historialCambios.length})</summary>
          <ul className="mt-2 m-0 pl-0 list-none font-body text-[11px] text-inksoft">
            {[...a.historialCambios].reverse().map((h: any, i: number) => (
              <li key={i} className="py-1 border-b border-line last:border-0">
                {fechaCorta(String(h.fecha).slice(0, 10))} · {h.porNombre}: cambió {h.cambios.join(', ')}
                {h.motivo ? ` — "${h.motivo}"` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
