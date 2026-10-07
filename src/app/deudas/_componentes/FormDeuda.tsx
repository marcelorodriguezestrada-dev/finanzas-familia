'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { subirArchivo } from '@/lib/subirArchivo'
import {
  CuotaDeuda, generarCuotasDeuda, resumirDeuda, describirPlan, ordenarCuotas, normalizarCI, normalizarNombre, fechaLarga,
} from '@/lib/deudas'
import { formatoBs } from '@/lib/esquemaPago'
import { monedaActual, simboloDe } from '@/lib/monedas'

type CuotaForm = { monto: string; vence: string }

// Alta de un plan de pago de deuda. Se puede precargar subiendo el PDF
// del reconocimiento de deuda (la IA + un lector por texto sacan
// partes, montos y TODAS las cuotas), y se vincula al alquiler que la
// originó para saber de qué departamento y de qué inquilino viene.
export function FormDeuda({
  alquileres,
  propiedades,
  unidades,
  alquilerIdInicial,
  onGuardado,
  onCancelar,
}: {
  alquileres: any[]
  propiedades: any[]
  unidades: any[]
  alquilerIdInicial?: string
  onGuardado: () => void
  onCancelar: () => void
}) {
  const { obtenerToken } = useAuth()

  const [alquilerId, setAlquilerId] = useState(alquilerIdInicial || '')
  const [propiedadId, setPropiedadId] = useState('')
  const [unidadId, setUnidadId] = useState('')
  const [concepto, setConcepto] = useState('Alquileres impagos')
  const [deudorNombre, setDeudorNombre] = useState('')
  const [deudorCI, setDeudorCI] = useState('')
  const [deudorTelefono, setDeudorTelefono] = useState('')
  const [deudorDomicilio, setDeudorDomicilio] = useState('')
  const [acreedorNombre, setAcreedorNombre] = useState('')
  const [acreedorCI, setAcreedorCI] = useState('')
  const [montoTotal, setMontoTotal] = useState('')
  const [tasa, setTasa] = useState('')
  const [fechaAcuerdo, setFechaAcuerdo] = useState(new Date().toISOString().slice(0, 10))
  const [lugar, setLugar] = useState('Potosí')
  const [garantia, setGarantia] = useState('')
  const [notas, setNotas] = useState('')
  const [cuotas, setCuotas] = useState<CuotaForm[]>([])
  const [documentoUrl, setDocumentoUrl] = useState('')

  // Generador rápido de cuotas
  const [genMonto, setGenMonto] = useState('')
  const [genPrimera, setGenPrimera] = useState('')

  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const alquiler = alquileres.find((a) => a.id === alquilerId)
  const nombreProp = (id: string) => propiedades.find((p) => p.id === id)?.nombre || '—'
  const nombreUni = (id: string) => unidades.find((u) => u.id === id)?.nombre || '—'

  // Al elegir el alquiler de origen, se completan el departamento y
  // (si están vacíos) los datos del deudor con los del inquilino.
  useEffect(() => {
    if (!alquiler) return
    setPropiedadId(alquiler.propiedadId || '')
    setUnidadId(alquiler.unidadId || '')
    setDeudorNombre((v) => v || alquiler.inquilinoNombre || '')
    setDeudorCI((v) => v || alquiler.inquilinoCI || '')
    setDeudorTelefono((v) => v || alquiler.inquilinoTelefono || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alquilerId])

  // Inquilinos cuyo C.I. o nombre coincide con el deudor: sugerencia
  // de a qué alquiler pertenece la deuda.
  const sugeridos = useMemo(() => {
    const ci = normalizarCI(deudorCI)
    const nom = normalizarNombre(deudorNombre)
    if (!ci && nom.length < 5) return []
    return alquileres.filter((a) => {
      if (ci && normalizarCI(a.inquilinoCI) === ci) return true
      const n = normalizarNombre(a.inquilinoNombre)
      return nom.length >= 5 && (n === nom || (n.includes(nom) && nom.split(' ').length >= 2) || (nom.includes(n) && n.split(' ').length >= 2))
    })
  }, [alquileres, deudorCI, deudorNombre])

  async function leerPDF(archivo: File) {
    setError('')
    setAviso('')
    setLeyendo(true)
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = rej
        r.readAsDataURL(archivo)
      })
      const token = await obtenerToken()
      // En paralelo: la lectura con IA y el archivo del PDF original
      // (queda guardado como respaldo del acuerdo).
      const [res, url] = await Promise.all([
        fetch('/api/deudas/importar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pdfBase64: base64 }),
        }),
        subirArchivo(archivo, obtenerToken).catch(() => ''),
      ])
      if (url) setDocumentoUrl(url)
      const d = await res.json()
      if (d.error) return setError(d.error + (url ? ' (El PDF igual quedó adjuntado.)' : ''))

      if (d.deudorNombre) setDeudorNombre(d.deudorNombre)
      if (d.deudorCI) setDeudorCI(d.deudorCI)
      if (d.deudorDomicilio) setDeudorDomicilio(d.deudorDomicilio)
      if (d.acreedorNombre) setAcreedorNombre(d.acreedorNombre)
      if (d.acreedorCI) setAcreedorCI(d.acreedorCI)
      if (d.montoTotal) setMontoTotal(String(d.montoTotal))
      if (d.tasaInteresMensual !== null && d.tasaInteresMensual !== undefined) setTasa(String(d.tasaInteresMensual))
      if (d.fechaAcuerdo) setFechaAcuerdo(d.fechaAcuerdo)
      if (d.lugar) setLugar(d.lugar)
      if (d.concepto) setConcepto(d.concepto)
      if (d.garantia) setGarantia(d.garantia)
      if (d.notas) setNotas(d.notas)
      if (d.cuotas?.length) setCuotas(d.cuotas.map((c: CuotaDeuda) => ({ monto: String(c.monto), vence: c.vence })))
      setAviso(
        `Se leyó el documento: ${d.cuotas?.length || 0} cuotas${d.montoTotal ? ` por ${formatoBs(d.montoTotal)}` : ''}. ` +
          `${url ? 'El PDF quedó adjuntado. ' : ''}Elegí de qué alquiler/departamento viene la deuda y revisá antes de guardar.`
      )
    } catch (err: any) {
      setError(err.message || 'No se pudo leer el PDF.')
    } finally {
      setLeyendo(false)
    }
  }

  function generar() {
    const cs = generarCuotasDeuda({ montoTotal: Number(montoTotal), montoCuota: Number(genMonto), primerVence: genPrimera })
    if (!cs.length) return setError('Para generar, completá el monto total, el monto de cada cuota y el primer vencimiento.')
    setError('')
    setCuotas(cs.map((c) => ({ monto: String(c.monto), vence: c.vence })))
  }

  const cuotasValidas: CuotaDeuda[] = ordenarCuotas(
    cuotas.filter((c) => Number(c.monto) > 0 && c.vence).map((c, i) => ({ numero: i + 1, monto: Number(c.monto), vence: c.vence, pagada: false }))
  )
  const resumen = resumirDeuda({ cuotas: cuotasValidas, montoTotal: Number(montoTotal) || 0 })

  async function guardar() {
    setError('')
    if (!deudorNombre.trim()) return setError('Falta el nombre del deudor.')
    if (!(Number(montoTotal) > 0)) return setError('Falta el monto total reconocido.')
    if (!cuotasValidas.length) return setError('Cargá las cuotas (o generalas).')
    if (!alquilerId && !unidadId) {
      if (!confirm('No elegiste de qué alquiler ni de qué departamento viene la deuda. ¿Guardar igual?')) return
    }
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/deudas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          alquilerId: alquilerId || null,
          propiedadId: propiedadId || null,
          unidadId: unidadId || null,
          concepto, deudorNombre, deudorCI, deudorTelefono, deudorDomicilio, acreedorNombre, acreedorCI,
          montoTotal: Number(montoTotal),
          tasaInteresMensual: tasa === '' ? null : Number(tasa),
          fechaAcuerdo, lugar, garantia, notas, documentoUrl: documentoUrl || null,
          cuotas: cuotasValidas,
        }),
      })
      const d = await res.json()
      if (d.error) return setError(d.error)
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  const input = 'w-full px-3 py-2 rounded-lg border border-line font-body text-sm'
  const etiqueta = 'font-body text-[11px] text-inksoft block mb-1'
  const unidadesDeProp = unidades.filter((u) => !propiedadId || u.propiedadId === propiedadId)

  return (
    <div className="bg-panel border border-line rounded-xl p-5 mb-6">
      <div className="font-display text-base font-bold text-ink mb-3">Nuevo plan de pago de deuda</div>

      <div className="border border-line rounded-lg p-3 mb-5 bg-white/50">
        <div className="font-body text-sm font-semibold text-ink mb-1">📄 Subí el reconocimiento de deuda (PDF)</div>
        <div className="font-body text-[11px] text-inksoft mb-2">Se leen las partes, el monto, el interés y todas las cuotas, y el PDF queda archivado con la deuda.</div>
        <input type="file" accept="application/pdf" disabled={leyendo} onChange={(e) => e.target.files?.[0] && leerPDF(e.target.files[0])} className="w-full font-body text-xs" />
        {leyendo && <div className="font-body text-[11px] text-inksoft mt-2">Leyendo el documento...</div>}
        {aviso && <div className="font-body text-[11px] text-verde mt-2">{aviso}</div>}
        {documentoUrl && !leyendo && (
          <a href={documentoUrl} target="_blank" rel="noreferrer" className="font-body text-[11px] text-ink underline mt-1 inline-block">Ver PDF adjuntado</a>
        )}
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">¿De dónde viene la deuda?</div>
      <label className={etiqueta}>Alquiler (inquilino) que la generó</label>
      <select value={alquilerId} onChange={(e) => setAlquilerId(e.target.value)} className={`${input} bg-white mb-2`}>
        <option value="">— Sin vincular a un alquiler —</option>
        {alquileres.map((a) => (
          <option key={a.id} value={a.id}>
            {a.inquilinoNombre} — {nombreProp(a.propiedadId)} / {nombreUni(a.unidadId)} ({a.estado}, desde {a.fechaInicio})
          </option>
        ))}
      </select>
      {!alquilerId && sugeridos.length > 0 && (
        <div className="bg-verdesoft border border-verde/30 rounded-lg p-2 mb-2">
          <div className="font-body text-[11px] text-ink mb-1">El deudor coincide con {sugeridos.length === 1 ? 'este inquilino' : 'estos inquilinos'}:</div>
          {sugeridos.map((a) => (
            <button key={a.id} type="button" onClick={() => setAlquilerId(a.id)} className="block font-body text-[11px] text-verde underline">
              Vincular a {a.inquilinoNombre} — {nombreProp(a.propiedadId)} / {nombreUni(a.unidadId)}
            </button>
          ))}
        </div>
      )}
      {!alquilerId && (
        <div className="grid sm:grid-cols-2 gap-3 mb-2">
          <div>
            <label className={etiqueta}>O elegí la propiedad</label>
            <select value={propiedadId} onChange={(e) => { setPropiedadId(e.target.value); setUnidadId('') }} className={`${input} bg-white`}>
              <option value="">—</option>
              {propiedades.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={etiqueta}>y el departamento / unidad</label>
            <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} className={`${input} bg-white`}>
              <option value="">—</option>
              {unidadesDeProp.map((u) => <option key={u.id} value={u.id}>{nombreProp(u.propiedadId)} — {u.nombre}</option>)}
            </select>
          </div>
        </div>
      )}
      {alquiler && (
        <div className="font-body text-[11px] text-inksoft mb-2">
          Departamento: <b className="text-ink">{nombreProp(alquiler.propiedadId)} — {nombreUni(alquiler.unidadId)}</b> · alquilaba {alquiler.inquilinoNombre} (C.I. {alquiler.inquilinoCI}) desde {alquiler.fechaInicio}
          {alquiler.fechaFin ? ` hasta ${alquiler.fechaFin}` : ''}.
        </div>
      )}
      <div className="mb-4">
        <label className={etiqueta}>Concepto de la deuda</label>
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Alquileres impagos, daños, servicios..." className={input} />
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Partes</div>
      <div className="grid sm:grid-cols-2 gap-3 mb-2">
        <div><label className={etiqueta}>Deudor</label><input value={deudorNombre} onChange={(e) => setDeudorNombre(e.target.value)} className={input} /></div>
        <div><label className={etiqueta}>C.I. del deudor</label><input value={deudorCI} onChange={(e) => setDeudorCI(e.target.value)} className={input} /></div>
        <div><label className={etiqueta}>Teléfono</label><input value={deudorTelefono} onChange={(e) => setDeudorTelefono(e.target.value)} className={input} /></div>
        <div><label className={etiqueta}>Domicilio actual del deudor</label><input value={deudorDomicilio} onChange={(e) => setDeudorDomicilio(e.target.value)} className={input} /></div>
        <div><label className={etiqueta}>Acreedor/a (a quién se le debe)</label><input value={acreedorNombre} onChange={(e) => setAcreedorNombre(e.target.value)} className={input} /></div>
        <div><label className={etiqueta}>C.I. del acreedor/a</label><input value={acreedorCI} onChange={(e) => setAcreedorCI(e.target.value)} className={input} /></div>
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1 mt-4">Acuerdo</div>
      <div className="grid sm:grid-cols-4 gap-3 mb-3">
        <div><label className={etiqueta}>Monto reconocido ({simboloDe(monedaActual())})</label><input type="number" value={montoTotal} onChange={(e) => setMontoTotal(e.target.value)} className={input} /></div>
        <div><label className={etiqueta}>Interés mensual (%)</label><input type="number" value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="opcional" className={input} /></div>
        <div><label className={etiqueta}>Fecha del acuerdo</label><input type="date" value={fechaAcuerdo} onChange={(e) => setFechaAcuerdo(e.target.value)} className={input} /></div>
        <div><label className={etiqueta}>Lugar</label><input value={lugar} onChange={(e) => setLugar(e.target.value)} className={input} /></div>
      </div>
      <div className="mb-4"><label className={etiqueta}>Garantía</label><input value={garantia} onChange={(e) => setGarantia(e.target.value)} className={input} /></div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Cuotas</div>
      <div className="border border-line rounded-lg p-3 mb-3 bg-white/50">
        <div className="font-body text-[11px] text-inksoft mb-2">Generador rápido: cuotas iguales mensuales hasta completar el monto (la última ajusta el resto).</div>
        <div className="flex gap-2 flex-wrap items-end">
          <div><label className={etiqueta}>Cuota de ({simboloDe(monedaActual())})</label><input type="number" value={genMonto} onChange={(e) => setGenMonto(e.target.value)} className="w-28 px-3 py-2 rounded-lg border border-line font-body text-sm" /></div>
          <div><label className={etiqueta}>Primer vencimiento</label><input type="date" value={genPrimera} onChange={(e) => setGenPrimera(e.target.value)} className="px-3 py-2 rounded-lg border border-line font-body text-sm" /></div>
          <button type="button" onClick={generar} className="px-3 py-2 rounded-lg border border-line font-body text-xs text-ink">Generar cuotas</button>
        </div>
      </div>

      {cuotas.length > 0 && (
        <div className="max-h-72 overflow-y-auto border border-line rounded-lg mb-2">
          <table className="w-full font-body text-xs">
            <thead className="sticky top-0 bg-ink text-white">
              <tr><th className="text-left px-2 py-1.5">#</th><th className="text-left px-2 py-1.5">Vence</th><th className="text-left px-2 py-1.5">Monto ({simboloDe(monedaActual())})</th><th /></tr>
            </thead>
            <tbody>
              {cuotas.map((c, i) => (
                <tr key={i} className={i % 2 ? 'bg-panelalt' : ''}>
                  <td className="px-2 py-1 text-inksoft">{i + 1}</td>
                  <td className="px-2 py-1"><input type="date" value={c.vence} onChange={(e) => setCuotas((p) => p.map((x, j) => (j === i ? { ...x, vence: e.target.value } : x)))} className="px-2 py-1 rounded border border-line" /></td>
                  <td className="px-2 py-1"><input type="number" value={c.monto} onChange={(e) => setCuotas((p) => p.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} className="w-24 px-2 py-1 rounded border border-line" /></td>
                  <td className="px-2 py-1 text-right"><button type="button" onClick={() => setCuotas((p) => p.filter((_, j) => j !== i))} className="text-rojo text-[11px]">Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={() => setCuotas((p) => [...p, { monto: p[p.length - 1]?.monto || '', vence: '' }])} className="font-body text-[11px] text-ink underline mb-3">
        + Agregar cuota a mano
      </button>

      {cuotasValidas.length > 0 && (
        <div className="border border-ocre/40 bg-ocresoft/60 rounded-lg p-3 mb-4 font-body text-xs text-ink">
          <div className="font-semibold mb-1">📋 Resumen del plan</div>
          <div>{describirPlan(cuotasValidas)}.</div>
          <div className="mt-1">Total en cuotas: <b>{formatoBs(resumen.totalCuotas)}</b>{Number(montoTotal) > 0 && ` · monto reconocido: ${formatoBs(Number(montoTotal))}`}</div>
          {Number(montoTotal) > 0 && resumen.diferenciaConTotal !== 0 && (
            <div className="text-rojo mt-1">
              ⚠ Las cuotas suman {formatoBs(Math.abs(resumen.diferenciaConTotal))} {resumen.diferenciaConTotal > 0 ? 'más' : 'menos'} que el monto reconocido. Revisá antes de guardar.
            </div>
          )}
          {Number(tasa) > 0 && resumen.diferenciaConTotal === 0 && (
            <div className="text-inksoft mt-1">
              Nota: el acuerdo menciona {tasa}% de interés mensual, pero las cuotas suman exactamente el capital, así que el interés no está dentro del cronograma. El sistema cobra las cuotas tal cual figuran.
            </div>
          )}
          {resumen.ultima && <div className="text-inksoft mt-1">Última cuota: {fechaLarga(resumen.ultima.vence)}.</div>}
        </div>
      )}

      <div className="mb-4"><label className={etiqueta}>Notas</label><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={input} /></div>

      {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={guardar} disabled={guardando} className="flex-1 py-2.5 rounded-lg bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
          {guardando ? 'Guardando...' : 'Registrar plan de pago'}
        </button>
        <button type="button" onClick={onCancelar} className="px-4 py-2.5 rounded-lg border border-line font-body text-sm text-ink">Cancelar</button>
      </div>
    </div>
  )
}
