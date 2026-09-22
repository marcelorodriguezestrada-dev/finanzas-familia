'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { subirArchivo } from '@/lib/subirArchivo'
import { detectarVariacion } from '@/data/inmuebles'
import { CLAUSULAS_DISPONIBLES, CLAUSULAS_POR_DEFECTO, ClausulaId } from '@/lib/plantillaContrato'

type ClausulaExtra = { titulo: string; texto: string }

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function FormAlquiler({
  unidad,
  propiedad,
  miembros,
  onGuardado,
}: {
  unidad: any
  propiedad: any
  miembros: any[]
  onGuardado: () => void
}) {
  const { obtenerToken, perfil, usuario } = useAuth()

  const [inquilinoNombre, setInquilinoNombre] = useState('')
  const [inquilinoCI, setInquilinoCI] = useState('')
  const [inquilinoTelefono, setInquilinoTelefono] = useState('')
  const [inquilinoDireccionAnterior, setInquilinoDireccionAnterior] = useState('')
  const [montoMensual, setMontoMensual] = useState(unidad.canonEstandar?.toString() || '')
  const [anticipo, setAnticipo] = useState('')
  const [diaCobro, setDiaCobro] = useState('1')
  const [fechaInicio, setFechaInicio] = useState(hoyISO())
  const [fechaFin, setFechaFin] = useState('')
  const [administradorUid, setAdministradorUid] = useState(usuario?.uid || '')

  const [contratoFile, setContratoFile] = useState<File | null>(null)
  const [contratoUrl, setContratoUrl] = useState('')
  const [subiendoContrato, setSubiendoContrato] = useState(false)
  const [generandoContrato, setGenerandoContrato] = useState(false)

  // Checklist de cláusulas del contrato, en base a la plantilla de
  // ejemplo. Por defecto van todas tildadas.
  const [clausulasElegidas, setClausulasElegidas] = useState<Set<ClausulaId>>(new Set(CLAUSULAS_POR_DEFECTO))
  const [clausulasExtra, setClausulasExtra] = useState<ClausulaExtra[]>([])
  const [pedidoIA, setPedidoIA] = useState('')
  const [redactandoIA, setRedactandoIA] = useState(false)
  const [mostrarClausulas, setMostrarClausulas] = useState(false)

  function toggleClausula(id: ClausulaId) {
    setClausulasElegidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function pedirClausulaIA() {
    if (!pedidoIA.trim()) return
    setRedactandoIA(true)
    setError('')
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/redactar-clausula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion: pedidoIA }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      setClausulasExtra((prev) => [...prev, { titulo: data.titulo, texto: data.texto }])
      setPedidoIA('')
    } catch (err: any) {
      setError(err.message || 'No se pudo redactar la cláusula.')
    } finally {
      setRedactandoIA(false)
    }
  }

  function quitarClausulaExtra(i: number) {
    setClausulasExtra((prev) => prev.filter((_, idx) => idx !== i))
  }

  function actualizarClausulaExtra(i: number, campo: 'titulo' | 'texto', valor: string) {
    setClausulasExtra((prev) => prev.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)))
  }

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const variacionPreview = montoMensual ? detectarVariacion(Number(montoMensual), Number(unidad.canonEstandar || 0)) : null

  async function generarContratoPDF() {
    setError('')
    if (!inquilinoNombre.trim() || !inquilinoCI.trim() || !montoMensual) {
      setError('Completá al menos nombre, C.I. y monto mensual antes de generar el contrato.')
      return
    }
    setGenerandoContrato(true)
    try {
      const administradorNombre = miembros.find((m) => m.uid === administradorUid)?.nombre || perfil?.nombre || ''
      const token = await obtenerToken()
      const res = await fetch('/api/generar-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          propiedadNombre: propiedad.nombre,
          propiedadDireccion: propiedad.direccion || '',
          unidadNombre: unidad.nombre,
          unidadTipo: unidad.tipo,
          inquilinoNombre,
          inquilinoCI,
          inquilinoTelefono,
          inquilinoDireccionAnterior,
          montoMensual: Number(montoMensual),
          anticipo: anticipo ? Number(anticipo) : null,
          diaCobro: Number(diaCobro),
          fechaInicio,
          fechaFin: fechaFin || null,
          administradorNombre,
          clausulasSeleccionadas: Array.from(clausulasElegidas),
          clausulasExtra,
        }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)

      // Descarga directa del PDF generado, para imprimir y firmar.
      const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contrato-${unidad.nombre.replace(/\s+/g, '-')}-${inquilinoNombre.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'No se pudo generar el contrato.')
    } finally {
      setGenerandoContrato(false)
    }
  }

  async function subirContratoFirmado() {
    if (!contratoFile) return
    setSubiendoContrato(true)
    setError('')
    try {
      const url = await subirArchivo(contratoFile, obtenerToken)
      setContratoUrl(url)
    } catch (err: any) {
      setError(err.message || 'No se pudo subir el contrato.')
    } finally {
      setSubiendoContrato(false)
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!inquilinoNombre.trim() || !inquilinoCI.trim()) return setError('Faltan datos del inquilino (nombre y C.I.).')
    if (!montoMensual || Number(montoMensual) <= 0) return setError('Cargá el monto mensual acordado.')
    if (!administradorUid) return setError('Indicá quién de la familia administra este espacio.')
    // Subir el contrato firmado ya no es obligatorio: se puede
    // registrar el alquiler y subirlo (o modificarlo) más adelante.

    setGuardando(true)
    try {
      const administradorNombre = miembros.find((m) => m.uid === administradorUid)?.nombre || ''
      const token = await obtenerToken()
      const res = await fetch('/api/alquileres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          unidadId: unidad.id,
          inquilinoNombre, inquilinoCI, inquilinoTelefono, inquilinoDireccionAnterior,
          montoMensual, anticipo: anticipo || null, diaCobro, fechaInicio, fechaFin: fechaFin || null,
          administradorUid, administradorNombre, contratoUrl,
        }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="bg-panel border border-line rounded-xl p-5 mb-6">
      <div className="font-body text-sm font-semibold text-ink mb-1">Datos del inquilino</div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <input value={inquilinoNombre} onChange={(e) => setInquilinoNombre(e.target.value)} placeholder="Nombre completo" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        <input value={inquilinoCI} onChange={(e) => setInquilinoCI(e.target.value)} placeholder="C.I." className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <input value={inquilinoTelefono} onChange={(e) => setInquilinoTelefono(e.target.value)} placeholder="Teléfono (opcional)" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        <input value={inquilinoDireccionAnterior} onChange={(e) => setInquilinoDireccionAnterior(e.target.value)} placeholder="Dirección anterior (opcional)" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Condiciones de pago</div>
      <div className="grid sm:grid-cols-3 gap-3 mb-1">
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Monto mensual (Bs)</label>
          <input value={montoMensual} onChange={(e) => setMontoMensual(e.target.value)} type="number" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Anticipo / garantía (opcional)</label>
          <input value={anticipo} onChange={(e) => setAnticipo(e.target.value)} type="number" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Día de cobro</label>
          <input value={diaCobro} onChange={(e) => setDiaCobro(e.target.value)} type="number" min={1} max={31} className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
      </div>

      {variacionPreview && (
        <div className={`font-body text-[11px] mt-1.5 mb-3 ${variacionPreview.esMenor ? 'text-amber-600' : 'text-verde'}`}>
          ⚠ {variacionPreview.texto} (canon: {bs(Number(unidad.canonEstandar))})
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-4 mt-3">
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Fecha de inicio</label>
          <input value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} type="date" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Vencimiento del contrato (opcional)</label>
          <input value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} type="date" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Administración</div>
      <select value={administradorUid} onChange={(e) => setAdministradorUid(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-white mb-4">
        <option value="">Quién de la familia administra este espacio</option>
        {miembros.map((m) => (
          <option key={m.uid} value={m.uid}>{m.nombre}</option>
        ))}
      </select>

      <div className="font-body text-sm font-semibold text-ink mb-1">Contrato</div>

      <button
        type="button"
        onClick={() => setMostrarClausulas((v) => !v)}
        className="w-full flex items-center justify-between py-2 px-1 font-body text-xs text-inksoft mb-2"
      >
        <span>Cláusulas a incluir en el contrato</span>
        <span>{mostrarClausulas ? '▲ ocultar' : '▼ elegir'}</span>
      </button>

      {mostrarClausulas && (
        <div className="border border-line rounded-lg p-3 mb-3 bg-white/50">
          <div className="font-body text-[11px] text-inksoft mb-2">
            Basado en el modelo de contrato de alquiler de vivienda familiar. Destildá lo que no aplique.
          </div>
          {CLAUSULAS_DISPONIBLES.map((c) => (
            <label key={c.id} className="flex items-start gap-2 py-1 font-body text-xs text-ink">
              <input
                type="checkbox"
                checked={clausulasElegidas.has(c.id)}
                disabled={c.obligatoria}
                onChange={() => toggleClausula(c.id)}
                className="mt-0.5"
              />
              <span className={c.obligatoria ? 'text-inksoft' : ''}>
                {c.numero ? `${c.numero}. ` : ''}{c.titulo}{c.obligatoria ? ' (siempre incluida)' : ''}
              </span>
            </label>
          ))}

          <div className="border-t border-line mt-3 pt-3">
            <div className="font-body text-[11px] font-semibold text-ink mb-1.5">Cláusulas adicionales</div>

            {clausulasExtra.map((c, i) => (
              <div key={i} className="border border-line rounded-lg p-2.5 mb-2 bg-white">
                <div className="flex items-center justify-between mb-1.5">
                  <input
                    value={c.titulo}
                    onChange={(e) => actualizarClausulaExtra(i, 'titulo', e.target.value)}
                    className="font-body text-[11px] font-semibold text-ink bg-transparent border-none flex-1 outline-none"
                  />
                  <button type="button" onClick={() => quitarClausulaExtra(i)} className="font-body text-[11px] text-rojo shrink-0">
                    Quitar
                  </button>
                </div>
                <textarea
                  value={c.texto}
                  onChange={(e) => actualizarClausulaExtra(i, 'texto', e.target.value)}
                  rows={3}
                  className="w-full px-2 py-1.5 rounded border border-line font-body text-xs"
                />
              </div>
            ))}

            <div className="flex gap-2">
              <input
                value={pedidoIA}
                onChange={(e) => setPedidoIA(e.target.value)}
                placeholder="Describí lo que querés pactar y la IA redacta la cláusula (ej: se permiten mascotas)"
                className="flex-1 px-2.5 py-2 rounded-lg border border-line font-body text-xs"
              />
              <button
                type="button"
                onClick={pedirClausulaIA}
                disabled={!pedidoIA.trim() || redactandoIA}
                className="px-3 py-1.5 rounded-lg border border-line font-body text-xs text-ink disabled:opacity-50 shrink-0"
              >
                {redactandoIA ? 'Redactando...' : '✨ Redactar con IA'}
              </button>
            </div>
          </div>
        </div>
      )}

      <button type="button" onClick={generarContratoPDF} disabled={generandoContrato} className="w-full py-2.5 rounded-lg border border-line font-body text-sm text-ink mb-3 disabled:opacity-60">
        {generandoContrato ? 'Generando...' : '📄 Generar contrato automáticamente (PDF para imprimir y firmar)'}
      </button>

      <label className="font-body text-[11px] text-inksoft block mb-1">Subir el contrato ya firmado (imagen o PDF) — opcional</label>
      <div className="flex gap-2 mb-4">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setContratoFile(e.target.files?.[0] || null)} className="flex-1 font-body text-xs" />
        <button type="button" onClick={subirContratoFirmado} disabled={!contratoFile || subiendoContrato} className="px-3 py-1.5 rounded-lg border border-line font-body text-xs text-ink disabled:opacity-50">
          {subiendoContrato ? 'Subiendo...' : 'Subir'}
        </button>
      </div>
      {contratoUrl && <div className="font-body text-[11px] text-verde mb-3">✓ Contrato subido correctamente.</div>}
      {!contratoUrl && (
        <div className="font-body text-[11px] text-inksoft mb-3">
          Podés registrar el alquiler sin subir el contrato ahora y subirlo más adelante.
        </div>
      )}

      {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}

      <button type="submit" disabled={guardando} className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
        {guardando ? 'Registrando...' : 'Registrar alquiler'}
      </button>
    </form>
  )
}
