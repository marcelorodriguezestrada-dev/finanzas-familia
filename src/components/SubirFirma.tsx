'use client'

import { useRef, useState } from 'react'

// Carga de una firma desde una FOTO (del celular o escaneada) para
// estamparla en el contrato PDF.
//
// La foto de una firma en papel casi nunca sirve tal cual: el papel
// sale gris o con sombras y queda un rectángulo feo sobre la línea de
// firma. Por eso acá, en el navegador y sin subir nada a ningún lado:
//   1. se achica la imagen (máx. 1000 px de ancho),
//   2. se separa la tinta del papel comparando cada punto con el fondo
//      local (así las sombras de la foto no cuentan como tinta),
//   3. el papel pasa a ser transparente y la tinta se oscurece un poco
//      conservando su color (azul sigue azul),
//   4. se recorta al borde de la firma.
// Resultado: un PNG transparente liviano (data URL) listo para el PDF.

export async function procesarFotoFirma(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('No se pudo leer la imagen.'))
      i.src = url
    })
    const escala = Math.min(1, 1000 / img.naturalWidth)
    const w = Math.max(1, Math.round(img.naturalWidth * escala))
    const h = Math.max(1, Math.round(img.naturalHeight * escala))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, w, h)
    const datos = ctx.getImageData(0, 0, w, h)
    const px = datos.data

    // Si ya viene con transparencia (PNG de una firma digital), no se
    // toca el fondo: solo se recorta.
    let transparentes = 0
    for (let i = 3; i < px.length; i += 4) if (px[i] < 20) transparentes++
    const yaTransparente = transparentes > (w * h) / 5

    if (!yaTransparente) {
      const lum = new Float32Array(w * h)
      for (let i = 0, j = 0; i < px.length; i += 4, j++) {
        lum[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      }
      // Fondo local: el papel en una foto de celular nunca es parejo
      // (sombra de la mano, luz de costado). Se estima el "blanco" de
      // cada bloque de 40x40 px (percentil 90 de su luminancia) y se lo
      // interpola; la tinta es lo que está bastante más oscuro que SU
      // fondo, no que un umbral fijo.
      const B = 40
      const bx = Math.ceil(w / B)
      const by = Math.ceil(h / B)
      const global = Array.from(lum).sort((x, y) => x - y)[Math.floor(lum.length * 0.9)]
      const fondo = new Float32Array(bx * by)
      for (let j = 0; j < by; j++) {
        for (let i = 0; i < bx; i++) {
          const vals: number[] = []
          for (let y = j * B; y < Math.min(h, (j + 1) * B); y++) {
            for (let x = i * B; x < Math.min(w, (i + 1) * B); x++) vals.push(lum[y * w + x])
          }
          vals.sort((x, y) => x - y)
          fondo[j * bx + i] = Math.max(vals[Math.floor(vals.length * 0.9)] || 0, global * 0.6)
        }
      }
      const fondoEn = (x: number, y: number) => {
        const fx = Math.min(Math.max(x / B - 0.5, 0), bx - 1)
        const fy = Math.min(Math.max(y / B - 0.5, 0), by - 1)
        const x0 = Math.floor(fx), y0 = Math.floor(fy)
        const x1 = Math.min(x0 + 1, bx - 1), y1 = Math.min(y0 + 1, by - 1)
        const dx = fx - x0, dy = fy - y0
        const a = fondo[y0 * bx + x0] * (1 - dx) + fondo[y0 * bx + x1] * dx
        const b = fondo[y1 * bx + x0] * (1 - dx) + fondo[y1 * bx + x1] * dx
        return a * (1 - dy) + b * dy
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const j = y * w + x
          const i = j * 4
          const r = lum[j] / Math.max(fondoEn(x, y), 1)
          // r < 0.70 -> tinta plena; r > 0.82 -> papel; en el medio, borde suave.
          const alfa = Math.min(1, Math.max(0, (0.82 - r) / 0.12))
          if (alfa <= 0) {
            px[i + 3] = 0
          } else {
            px[i] = Math.round(px[i] * 0.55)
            px[i + 1] = Math.round(px[i + 1] * 0.55)
            px[i + 2] = Math.round(px[i + 2] * 0.7)
            px[i + 3] = Math.round(255 * alfa)
          }
        }
      }
    }

    // Recorte: se descartan filas/columnas con casi nada de tinta, así
    // una mancha suelta en el borde de la foto no arruina el recorte.
    const filas = new Array(h).fill(0)
    const cols = new Array(w).fill(0)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 60) {
          filas[y]++
          cols[x]++
        }
      }
    }
    const minFila = Math.max(1, Math.round(w * 0.004))
    const minCol = Math.max(1, Math.round(h * 0.004))
    let y0 = filas.findIndex((n) => n >= minFila)
    let y1 = h - 1 - [...filas].reverse().findIndex((n) => n >= minFila)
    let x0 = cols.findIndex((n) => n >= minCol)
    let x1 = w - 1 - [...cols].reverse().findIndex((n) => n >= minCol)
    if (y0 < 0 || x0 < 0 || x1 - x0 < 15 || y1 - y0 < 8) {
      throw new Error('No se detectó una firma en la foto. Probá con buena luz, firma oscura sobre papel blanco.')
    }
    const tinta = filas.slice(y0, y1 + 1).reduce((s, n) => s + n, 0)
    if (tinta > (x1 - x0 + 1) * (y1 - y0 + 1) * 0.55) {
      throw new Error('La foto tiene demasiado fondo oscuro. Sacala sobre papel blanco, de cerca y sin sombras.')
    }
    const pad = 6
    x0 = Math.max(0, x0 - pad)
    y0 = Math.max(0, y0 - pad)
    x1 = Math.min(w - 1, x1 + pad)
    y1 = Math.min(h - 1, y1 + pad)

    ctx.putImageData(datos, 0, 0)
    const recorte = document.createElement('canvas')
    recorte.width = x1 - x0 + 1
    recorte.height = y1 - y0 + 1
    recorte.getContext('2d')!.drawImage(canvas, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height)
    return recorte.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function SubirFirma({
  valor,
  onCambio,
  etiqueta = 'Firma (foto)',
  onGuardarComoMia,
}: {
  valor: string | null | undefined
  onCambio: (dataUrl: string | null) => void
  etiqueta?: string
  // Si viene, muestra el botón para dejarla guardada en el perfil.
  onGuardarComoMia?: (dataUrl: string) => Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardada, setGuardada] = useState(false)

  async function elegir(archivo: File) {
    setError('')
    setGuardada(false)
    if (!archivo.type.startsWith('image/')) return setError('Tiene que ser una imagen (foto JPG o PNG).')
    setProcesando(true)
    try {
      onCambio(await procesarFotoFirma(archivo))
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar la foto de la firma.')
    } finally {
      setProcesando(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const a = e.target.files?.[0]
          if (a) elegir(a)
        }}
      />
      {valor ? (
        <div
          className="h-12 w-36 rounded border border-line flex items-center justify-center overflow-hidden"
          style={{ backgroundImage: 'repeating-conic-gradient(#f1f0ea 0% 25%, #ffffff 0% 50%)', backgroundSize: '12px 12px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={valor} alt="Firma" className="max-h-11 max-w-[8.5rem] object-contain" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={procesando}
        className="px-2.5 py-1.5 rounded-lg border border-line font-body text-[11px] text-ink disabled:opacity-50"
      >
        {procesando ? 'Procesando...' : valor ? '↻ Cambiar firma' : `✍ ${etiqueta}`}
      </button>
      {valor && (
        <button type="button" onClick={() => onCambio(null)} className="font-body text-[11px] text-rojo">
          Quitar
        </button>
      )}
      {valor && onGuardarComoMia && (
        <button
          type="button"
          disabled={guardando || guardada}
          onClick={async () => {
            setGuardando(true)
            setError('')
            try {
              await onGuardarComoMia(valor)
              setGuardada(true)
            } catch (err: any) {
              setError(err.message || 'No se pudo guardar la firma.')
            } finally {
              setGuardando(false)
            }
          }}
          className="font-body text-[11px] text-verde underline disabled:no-underline disabled:opacity-70"
        >
          {guardada ? '✓ Guardada en tu perfil' : guardando ? 'Guardando...' : 'Guardar como mi firma'}
        </button>
      )}
      {error && <div className="w-full font-body text-[11px] text-rojo">{error}</div>}
    </div>
  )
}
