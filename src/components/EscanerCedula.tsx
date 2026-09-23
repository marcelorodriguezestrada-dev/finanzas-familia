'use client'

import { useState } from 'react'
import { extraerDatosMRZ, extraerCIDelFrente } from '@/lib/mrz'

type Props = {
  // Se llama cuando el OCR logra leer algo útil. El padre decide qué
  // hacer (completar inputs, etc.) — este componente no toca ningún
  // estado ajeno directamente.
  onDatosDetectados: (datos: { nombre?: string; ci?: string }) => void
}

// Escanea una cédula boliviana (frente + reverso) enteramente en el
// navegador con Tesseract.js: las imágenes NUNCA se suben a ningún
// servidor ni pasan por la API de Groq — el procesamiento ocurre en
// la máquina de quien está usando la app. Solo el resultado (nombre y
// número de C.I., ya extraídos) queda disponible para completar el
// formulario.
export function EscanerCedula({ onDatosDetectados }: Props) {
  const [frente, setFrente] = useState<File | null>(null)
  const [reverso, setReverso] = useState<File | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<{ nombre?: string; ci?: string } | null>(null)

  async function procesar() {
    if (!frente && !reverso) return setError('Subí al menos una foto de la cédula (idealmente ambos lados).')
    setError('')
    setResultado(null)
    setProcesando(true)
    setProgreso(0)

    try {
      // Carga dinámica: Tesseract.js pesa varios MB (incluye el motor
      // de OCR + datos del idioma), así que solo se descarga cuando
      // el usuario realmente va a escanear una cédula.
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('spa', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') setProgreso(Math.round(m.progress * 100))
        },
      })

      let textoFrente = ''
      let textoReverso = ''
      if (frente) {
        const { data } = await worker.recognize(frente)
        textoFrente = data.text
      }
      if (reverso) {
        const { data } = await worker.recognize(reverso)
        textoReverso = data.text
      }
      await worker.terminate()

      // El MRZ (más confiable) está en el reverso; si no se subió
      // reverso, se intenta igual sobre el frente por si el usuario
      // se equivocó de lado.
      const mrz = extraerDatosMRZ(textoReverso || textoFrente)
      const ciFrente = extraerCIDelFrente(textoFrente || textoReverso)

      const datos = {
        nombre: mrz.nombre || undefined,
        ci: mrz.ci || ciFrente || undefined,
      }

      if (!datos.nombre && !datos.ci) {
        setError('No se pudo leer la cédula con claridad. Probá con fotos más nítidas, bien iluminadas y derechas, o cargá los datos a mano.')
        return
      }

      setResultado(datos)
    } catch (err: any) {
      setError(err?.message || 'No se pudo procesar la imagen.')
    } finally {
      setProcesando(false)
    }
  }

  function usarResultado() {
    if (resultado) onDatosDetectados(resultado)
  }

  return (
    <div className="border border-line rounded-lg p-3 bg-white/50">
      <div className="font-body text-[11px] font-semibold text-ink mb-1">Completar con foto de la cédula (opcional)</div>
      <div className="font-body text-[10px] text-inksoft mb-2">
        El procesamiento ocurre en tu propio navegador — las fotos no se suben a ningún servidor. Funciona mejor con el
        reverso (donde está el código de líneas al final).
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="font-body text-[10px] text-inksoft block mb-1">Frente</label>
          <input type="file" accept="image/*" onChange={(e) => setFrente(e.target.files?.[0] || null)} className="w-full font-body text-[10px]" />
        </div>
        <div>
          <label className="font-body text-[10px] text-inksoft block mb-1">Reverso (recomendado)</label>
          <input type="file" accept="image/*" onChange={(e) => setReverso(e.target.files?.[0] || null)} className="w-full font-body text-[10px]" />
        </div>
      </div>

      <button
        type="button"
        onClick={procesar}
        disabled={procesando || (!frente && !reverso)}
        className="w-full py-2 rounded-lg border border-line font-body text-xs text-ink disabled:opacity-50"
      >
        {procesando ? `Leyendo... ${progreso}%` : '🔍 Leer datos de la cédula'}
      </button>

      {error && <div className="font-body text-[11px] text-rojo mt-2">{error}</div>}

      {resultado && (
        <div className="mt-2 border border-line rounded-lg p-2.5 bg-verde/5">
          <div className="font-body text-[11px] text-ink mb-1">Se detectó:</div>
          {resultado.nombre && <div className="font-body text-xs text-ink">Nombre: <b>{resultado.nombre}</b></div>}
          {resultado.ci && <div className="font-body text-xs text-ink">C.I.: <b>{resultado.ci}</b></div>}
          <div className="font-body text-[10px] text-inksoft mt-1 mb-2">Revisá que esté bien antes de usarlo — el OCR puede equivocarse.</div>
          <button type="button" onClick={usarResultado} className="w-full py-1.5 rounded-lg border-none bg-ink text-white font-body text-[11px] font-semibold">
            Usar estos datos
          </button>
        </div>
      )}
    </div>
  )
}
