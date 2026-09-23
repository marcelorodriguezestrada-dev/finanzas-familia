'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'

type Clausula = { titulo: string; texto: string }
type Plantilla = { id: string; nombre: string; pdfUrl: string | null; clausulas: Clausula[]; creadoEn: string }

export default function PlantillasContratoPage() {
  const { obtenerToken } = useAuth()
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [nombre, setNombre] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const [expandidaId, setExpandidaId] = useState<string | null>(null)
  const [editando, setEditando] = useState<Record<string, Clausula[]>>({})
  const [guardandoId, setGuardandoId] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const res = await fetch('/api/plantillas-contrato', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setPlantillas(data.plantillas || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function subir(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!archivo) return setError('Elegí un PDF primero.')
    if (archivo.type !== 'application/pdf') return setError('Solo se aceptan archivos PDF.')
    if (archivo.size > 20 * 1024 * 1024) return setError('El PDF pesa más de 20 MB.')

    setSubiendo(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(archivo)
      })

      const token = await obtenerToken()

      // Se sube el PDF a Supabase Storage (para poder abrirlo después).
      const resSubida = await fetch('/api/subir-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ archivoBase64: base64, nombre: archivo.name }),
      }).then((r) => r.json())

      if (resSubida.error) {
        // No es bloqueante: igual seguimos con la extracción aunque no
        // se haya podido guardar el PDF original en Storage.
        console.warn('No se pudo subir el PDF a Storage:', resSubida.error)
      }

      const resPlantilla = await fetch('/api/plantillas-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: nombre || archivo.name, pdfBase64: base64, pdfUrl: resSubida.url || null }),
      })
      const data = await resPlantilla.json()
      if (data.error) return setError(data.error)

      setNombre('')
      setArchivo(null)
      cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo subir el contrato.')
    } finally {
      setSubiendo(false)
    }
  }

  function iniciarEdicion(p: Plantilla) {
    setExpandidaId(expandidaId === p.id ? null : p.id)
    if (!editando[p.id]) {
      setEditando((prev) => ({ ...prev, [p.id]: p.clausulas.map((c) => ({ ...c })) }))
    }
  }

  function actualizarClausula(pId: string, i: number, campo: 'titulo' | 'texto', valor: string) {
    setEditando((prev) => ({
      ...prev,
      [pId]: prev[pId].map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)),
    }))
  }

  function quitarClausula(pId: string, i: number) {
    setEditando((prev) => ({ ...prev, [pId]: prev[pId].filter((_, idx) => idx !== i) }))
  }

  async function guardarEdicion(pId: string) {
    setGuardandoId(pId)
    try {
      const token = await obtenerToken()
      await fetch(`/api/plantillas-contrato/${pId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clausulas: editando[pId] }),
      })
      cargar()
    } finally {
      setGuardandoId(null)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar esta plantilla? El PDF original queda guardado, solo se borra el registro y sus cláusulas.')) return
    const token = await obtenerToken()
    await fetch(`/api/plantillas-contrato/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Plantillas de contrato</div>
      <div className="font-body text-xs text-inksoft mb-6">
        Subí contratos de alquiler reales que ya usa la familia. La IA lee cada uno y separa sus cláusulas, para que después
        puedas elegirlas como checklist al generar un contrato nuevo en Alquileres.
      </div>

      <form onSubmit={subir} className="bg-panel border border-line rounded-xl p-5 mb-8">
        <div className="font-body text-sm font-semibold text-ink mb-3">Subir un contrato de ejemplo (PDF)</div>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre para identificarlo (ej: Contrato vivienda familiar)"
          className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-2"
        />
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          className="w-full font-body text-xs mb-3"
        />
        <button type="submit" disabled={subiendo} className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
          {subiendo ? 'Leyendo el contrato con IA...' : '📄 Subir y extraer cláusulas'}
        </button>
        {error && <div className="font-body text-xs text-rojo mt-2">{error}</div>}
        <div className="font-body text-[11px] text-inksoft mt-2">
          Solo funciona con PDFs que tengan texto seleccionable (no fotos escaneadas de papel).
        </div>
      </form>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      {!cargando && plantillas.length === 0 && (
        <div className="font-body text-sm text-inksoft">Todavía no subiste ninguna plantilla.</div>
      )}

      {plantillas.map((p) => (
        <div key={p.id} className="border border-line rounded-lg p-4 mb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-body text-sm font-semibold text-ink">{p.nombre}</div>
              <div className="font-body text-[11px] text-inksoft">
                {p.clausulas.length} cláusula{p.clausulas.length !== 1 ? 's' : ''} identificada{p.clausulas.length !== 1 ? 's' : ''}
                {p.pdfUrl && (
                  <>
                    {' · '}
                    <a href={p.pdfUrl} target="_blank" rel="noreferrer" className="underline">
                      ver PDF original
                    </a>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => iniciarEdicion(p)} className="font-body text-[11px] text-ink underline">
                {expandidaId === p.id ? 'Ocultar' : 'Ver cláusulas'}
              </button>
              <button onClick={() => borrar(p.id)} className="font-body text-[11px] text-rojo underline">
                Borrar
              </button>
            </div>
          </div>

          {expandidaId === p.id && (
            <div className="mt-3 border-t border-line pt-3">
              {(editando[p.id] || []).map((c, i) => (
                <div key={i} className="border border-line rounded-lg p-2.5 mb-2 bg-white/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <input
                      value={c.titulo}
                      onChange={(e) => actualizarClausula(p.id, i, 'titulo', e.target.value)}
                      className="font-body text-[11px] font-semibold text-ink bg-transparent border-none flex-1 outline-none"
                    />
                    <button type="button" onClick={() => quitarClausula(p.id, i)} className="font-body text-[11px] text-rojo shrink-0">
                      Quitar
                    </button>
                  </div>
                  <textarea
                    value={c.texto}
                    onChange={(e) => actualizarClausula(p.id, i, 'texto', e.target.value)}
                    rows={3}
                    className="w-full px-2 py-1.5 rounded border border-line font-body text-xs"
                  />
                </div>
              ))}
              <button
                onClick={() => guardarEdicion(p.id)}
                disabled={guardandoId === p.id}
                className="w-full py-2 rounded-lg border border-line font-body text-xs text-ink disabled:opacity-60"
              >
                {guardandoId === p.id ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </div>
      ))}
    </PaginaProtegida>
  )
}
