'use client'

import { useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { TIPOS_UNIDAD, COMODIDADES, Comodidad, TipoUnidad } from '@/data/inmuebles'

type UnidadSugerida = { nombre: string; tipo: TipoUnidad; comodidades: Comodidad[]; notas: string }

export function IngresoInteligenteEspacios({
  propiedadId,
  onCreadas,
  onCancelar,
}: {
  propiedadId: string
  onCreadas: () => void
  onCancelar: () => void
}) {
  const { obtenerToken } = useAuth()

  const [modo, setModo] = useState<'texto' | 'audio'>('texto')
  const [descripcion, setDescripcion] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)

  const [grabando, setGrabando] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [sugeridas, setSugeridas] = useState<UnidadSugerida[] | null>(null)
  const [creando, setCreando] = useState(false)

  async function iniciarGrabacion() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioFile(new File([blob], 'grabacion.webm', { type: 'audio/webm' }))
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setGrabando(true)
    } catch {
      setError('No se pudo acceder al micrófono. Revisá los permisos del navegador, o subí un archivo de audio ya grabado.')
    }
  }

  function detenerGrabacion() {
    mediaRecorderRef.current?.stop()
    setGrabando(false)
  }

  async function procesarTexto() {
    if (!descripcion.trim()) return setError('Escribí una descripción de los ambientes primero.')
    setError('')
    setProcesando(true)
    setSugeridas(null)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/interpretar-espacios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      setSugeridas(data.unidades)
    } catch (err: any) {
      setError(err.message || 'No se pudo interpretar la descripción.')
    } finally {
      setProcesando(false)
    }
  }

  async function procesarAudio() {
    if (!audioFile) return setError('Grabá o subí un audio primero.')
    setError('')
    setProcesando(true)
    setSugeridas(null)
    try {
      const token = await obtenerToken()

      const formAudio = new FormData()
      formAudio.append('audio', audioFile)
      const resAudio = await fetch('/api/transcribir-audio', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formAudio,
      })
      const dataAudio = await resAudio.json()
      if (dataAudio.error) return setError(dataAudio.error)

      setDescripcion(dataAudio.texto) // se muestra al usuario lo que se entendió, por transparencia

      const res = await fetch('/api/interpretar-espacios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion: dataAudio.texto }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      setSugeridas(data.unidades)
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar el audio.')
    } finally {
      setProcesando(false)
    }
  }

  function actualizarSugerida(i: number, campo: keyof UnidadSugerida, valor: any) {
    setSugeridas((prev) => (prev ? prev.map((u, idx) => (idx === i ? { ...u, [campo]: valor } : u)) : prev))
  }

  function toggleComodidadSugerida(i: number, c: Comodidad) {
    setSugeridas((prev) =>
      prev
        ? prev.map((u, idx) =>
            idx === i ? { ...u, comodidades: u.comodidades.includes(c) ? u.comodidades.filter((x) => x !== c) : [...u.comodidades, c] } : u
          )
        : prev
    )
  }

  function quitarSugerida(i: number) {
    setSugeridas((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev))
  }

  async function crearTodas() {
    if (!sugeridas || sugeridas.length === 0) return
    setCreando(true)
    setError('')
    try {
      const token = await obtenerToken()
      for (const u of sugeridas) {
        if (!u.nombre.trim()) continue
        await fetch('/api/unidades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            propiedadId,
            nombre: u.nombre,
            tipo: u.tipo,
            comodidades: u.comodidades,
            canonEstandar: 1, // placeholder editable: el usuario carga el canon real desde la ficha de cada unidad después de crearlas
            notas: u.notas,
          }),
        })
      }
      onCreadas()
    } catch (err: any) {
      setError(err.message || 'No se pudieron crear los espacios.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="bg-white border border-line rounded-lg p-4 mb-3">
      <div className="font-body text-sm font-semibold text-ink mb-1">Agregar varios espacios de una (con IA)</div>
      <div className="font-body text-[11px] text-inksoft mb-3">
        Describí los ambientes por texto o por audio. La IA sugiere una lista de espacios — vos la
        revisás, editás lo que haga falta, y confirmás la creación.
      </div>

      <div className="flex gap-2 mb-3">
        {(['texto', 'audio'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setModo(m); setError(''); setSugeridas(null) }}
            className={`px-3 py-1.5 rounded-full font-body text-xs border ${modo === m ? 'bg-ink text-white border-ink' : 'border-line text-inksoft'}`}
          >
            {m === 'texto' ? 'Texto' : 'Audio'}
          </button>
        ))}
      </div>

      {modo === 'texto' && (
        <>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder='Ej: "En planta baja hay 3 consultorios y 2 tiendas hacia la calle. Al fondo hay 2 cuartos para estudiantes. Arriba vive la familia y hay un cuarto más alquilado a un vendedor de Natura."'
            rows={4}
            className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-2"
          />
          <button type="button" onClick={procesarTexto} disabled={procesando} className="w-full py-2.5 rounded-lg border border-line font-body text-sm text-ink disabled:opacity-60">
            {procesando ? 'Analizando...' : '✨ Interpretar descripción'}
          </button>
        </>
      )}

      {modo === 'audio' && (
        <>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={grabando ? detenerGrabacion : iniciarGrabacion}
              className={`flex-1 py-2.5 rounded-lg border font-body text-sm ${grabando ? 'bg-rojo text-white border-rojo' : 'border-line text-ink'}`}
            >
              {grabando ? '⏹ Detener grabación' : '🎙 Grabar descripción'}
            </button>
          </div>
          <div className="font-body text-[11px] text-inksoft mb-2">o subí un audio ya grabado:</div>
          <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} className="w-full font-body text-xs mb-2" />
          {audioFile && <div className="font-body text-[11px] text-verde mb-2">Audio listo: {audioFile.name}</div>}
          <button type="button" onClick={procesarAudio} disabled={procesando || !audioFile} className="w-full py-2.5 rounded-lg border border-line font-body text-sm text-ink disabled:opacity-60">
            {procesando ? 'Transcribiendo y analizando...' : '✨ Interpretar audio'}
          </button>
          {descripcion && !procesando && (
            <div className="mt-2 font-body text-[11px] text-inksoft">
              <b>Se entendió:</b> "{descripcion}"
            </div>
          )}
        </>
      )}

      {error && <div className="font-body text-xs text-rojo mt-2">{error}</div>}

      {sugeridas && sugeridas.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="font-body text-[11px] font-semibold text-ink mb-2">
            Se identificaron {sugeridas.length} espacio{sugeridas.length !== 1 ? 's' : ''} — revisá y ajustá antes de crear:
          </div>
          {sugeridas.map((u, i) => (
            <div key={i} className="border border-line rounded-lg p-2.5 mb-2 bg-panel/40">
              <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mb-2">
                <input
                  value={u.nombre}
                  onChange={(e) => actualizarSugerida(i, 'nombre', e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-line font-body text-xs"
                />
                <select
                  value={u.tipo}
                  onChange={(e) => actualizarSugerida(i, 'tipo', e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-line font-body text-xs bg-white"
                >
                  {TIPOS_UNIDAD.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => quitarSugerida(i)} className="font-body text-xs text-rojo px-2">
                  Quitar
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {COMODIDADES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleComodidadSugerida(i, c.id)}
                    className={`px-2 py-0.5 rounded-full font-body text-[10px] border ${
                      u.comodidades.includes(c.id) ? 'bg-ink text-white border-ink' : 'border-line text-inksoft'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <input
                value={u.notas}
                onChange={(e) => actualizarSugerida(i, 'notas', e.target.value)}
                placeholder="Notas (opcional)"
                className="w-full px-2.5 py-1.5 rounded-lg border border-line font-body text-xs"
              />
            </div>
          ))}
          <div className="font-body text-[11px] text-inksoft mb-2">
            Se crean con canon de alquiler provisorio (Bs 1) — entrá a cada espacio después para cargar el valor real.
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={crearTodas} disabled={creando} className="flex-1 py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
              {creando ? 'Creando...' : `Crear ${sugeridas.length} espacio${sugeridas.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={onCancelar} className="w-full py-2 mt-3 font-body text-xs text-inksoft">
        Cancelar
      </button>
    </div>
  )
}
