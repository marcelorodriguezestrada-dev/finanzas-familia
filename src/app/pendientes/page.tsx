'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { subirArchivo } from '@/lib/subirArchivo'
import { CATEGORIAS_GASTO } from '@/data/categorias'
import { formatoBs, fechaCorta, etiquetaMes, redondear } from '@/lib/esquemaPago'
import { Vencimiento, Concepto, vencimientoVigente, situacion, SituacionPendiente, ubicarUnidad } from '@/lib/pendientes'
import { Historial } from './_componentes/Historial'
import { ImportarGastos } from './_componentes/ImportarGastos'
import { useEspacio } from '@/lib/espacioCliente'

const SITUACION: Record<SituacionPendiente, { txt: string; cls: string }> = {
  pagado: { txt: 'Pagado', cls: 'bg-[#E8F3EC] text-[#1F5E43]' },
  anulado: { txt: 'Anulado', cls: 'bg-panelalt text-inksoft' },
  al_dia: { txt: 'A pagar', cls: 'bg-[#EAF0F7] text-[#1C3A5E]' },
  por_vencer: { txt: 'Vence pronto', cls: 'bg-[#FBF4E4] text-[#6A5011]' },
  con_recargo: { txt: 'Con recargo', cls: 'bg-[#FBEDEA] text-[#8A3324]' },
  vencido: { txt: 'Vencido', cls: 'bg-[#8A3324] text-white' },
}

type VForm = { fecha: string; monto: string; recargo: string }

// Gastos por pagar: expensas, servicios, impuestos... llegan con
// vencimientos y se pagan después. Al pagar se crea el gasto en
// "Ingresos y gastos" con la categoría y el departamento.
export default function PendientesPage() {
  const { obtenerToken } = useAuth()
  const { esPersonal } = useEspacio()
  const hoy = new Date().toISOString().slice(0, 10)

  const [pendientes, setPendientes] = useState<any[]>([])
  const [propiedades, setPropiedades] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarImportar, setMostrarImportar] = useState(false)
  const [verPagados, setVerPagados] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Record<string, string>>({})
  const [fechaPago, setFechaPago] = useState<Record<string, string>>({})
  const [montoPago, setMontoPago] = useState<Record<string, string>>({})
  const [procesando, setProcesando] = useState<string | null>(null)
  const [pestania, setPestania] = useState<'porPagar' | 'historial'>('porPagar')

  async function cargar() {
    const token = await obtenerToken()
    const h = { Authorization: `Bearer ${token}` }
    const [p, pr, u] = await Promise.all(['/api/pendientes', '/api/propiedades', '/api/unidades'].map((x) => fetch(x, { headers: h }).then((r) => r.json())))
    setPendientes(p.pendientes || [])
    setPropiedades(pr.propiedades || [])
    setUnidades(u.unidades || [])
    setCargando(false)
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nombreLugar = (p: any) =>
    [propiedades.find((x) => x.id === p.propiedadId)?.nombre, unidades.find((x) => x.id === p.unidadId)?.nombre].filter(Boolean).join(' — ')

  const activos = pendientes.filter((p) => p.estado === 'pendiente')
  const resumen = useMemo(() => {
    let aPagar = 0, ahorro = 0, vencido = 0
    for (const p of activos) {
      const v = vencimientoVigente(p, hoy)
      if (!v) continue
      aPagar += v.vencimiento.monto
      ahorro += v.ahorroSiPagaHoy
      if (v.vencidoTodo) vencido += v.vencimiento.monto
    }
    const anio = hoy.slice(0, 4)
    const moraAnio = pendientes.filter((p) => (p.periodo || '').startsWith(anio) && p.estado !== 'anulado').reduce((s, p) => s + (Number(p.interesMora) || 0), 0)
    const recargosPagados = pendientes
      .filter((p) => p.estado === 'pagado' && (p.pago?.fecha || '').startsWith(anio))
      .reduce((s, p) => s + Math.max(0, (Number(p.pago?.monto) || 0) - (p.vencimientos?.[0]?.monto || 0)), 0)
    return { aPagar: redondear(aPagar), ahorro: redondear(ahorro), vencido: redondear(vencido), moraAnio: redondear(moraAnio), recargosPagados: redondear(recargosPagados) }
  }, [pendientes, hoy]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pagar(p: any, deshacer = false) {
    if (deshacer && !confirm('¿Anular el pago? Se borra el gasto de "Ingresos y gastos".')) return
    setProcesando(p.id)
    try {
      const token = await obtenerToken()
      const res = await fetch(`/api/pendientes/${p.id}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(deshacer ? { deshacer: true } : { fecha: fechaPago[p.id] || hoy, monto: Number(montoPago[p.id]) || undefined }),
      })
      const d = await res.json()
      setMensajes((m) => ({ ...m, [p.id]: d.error || (deshacer ? '✓ Pago anulado.' : `✓ Pagado. Quedó registrado como gasto.`) }))
      if (!d.error) await cargar()
    } finally {
      setProcesando(null)
    }
  }

  async function cambiarEstado(p: any, estado: 'anulado' | 'pendiente') {
    const token = await obtenerToken()
    await fetch(`/api/pendientes/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ estado }) })
    cargar()
  }

  async function borrar(p: any) {
    if (!confirm(`¿Borrar "${p.titulo}"?`)) return
    const conMov = p.estado === 'pagado' && confirm('Estaba pagado. ¿Borrar también el gasto registrado? (Cancelar = dejarlo)')
    const token = await obtenerToken()
    await fetch(`/api/pendientes/${p.id}${conMov ? '?conMovimiento=1' : ''}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  const lista = pendientes
    .filter((p) => (verPagados ? true : p.estado === 'pendiente'))
    .sort((a, b) => {
      const va = vencimientoVigente(a, hoy)?.vencimiento.fecha || '9999'
      const vb = vencimientoVigente(b, hoy)?.vencimiento.fecha || '9999'
      return a.estado === b.estado ? va.localeCompare(vb) : a.estado === 'pendiente' ? -1 : 1
    })

  return (
    <PaginaProtegida>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="font-display text-xl font-bold text-ink mb-1">Gastos por pagar</div>
          <div className="font-body text-xs text-inksoft">
            Expensas, servicios e impuestos que llegan con vencimiento. Subí el PDF, pagalo a tiempo y queda registrado como gasto{esPersonal ? ' en Mis finanzas' : ''}.
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {!mostrarImportar && (
            <button onClick={() => setMostrarImportar(true)} className="min-h-[44px] px-3 rounded-lg border border-line bg-white text-ink font-body text-xs font-semibold">
              Importar (planilla, texto o facturas)
            </button>
          )}
          {!mostrarForm && (
            <button onClick={() => setMostrarForm(true)} className="min-h-[44px] px-3 rounded-lg bg-ink text-white font-body text-xs font-semibold">
              + Cargar uno
            </button>
          )}
        </div>
      </div>

      <div className="flex rounded-lg border border-line overflow-hidden w-fit mb-5" role="tablist" aria-label="Vista">
        {([['porPagar', 'Por pagar'], ['historial', 'Historial por unidad']] as const).map(([v, t]) => (
          <button key={v} role="tab" aria-selected={pestania === v} onClick={() => setPestania(v)} className={`min-h-[44px] px-4 font-body text-sm ${pestania === v ? 'bg-ink text-white font-semibold' : 'bg-white text-ink'}`}>
            {t}
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="font-body text-sm text-inksoft">Cargando...</div>
      ) : pestania === 'historial' ? (
        <Historial pendientes={pendientes} propiedades={propiedades} unidades={unidades} onCambio={cargar} />
      ) : (
        <>
          {mostrarImportar && <ImportarGastos propiedades={propiedades} onListo={cargar} onCerrar={() => setMostrarImportar(false)} />}
          {mostrarForm && (
            <FormPendiente
              propiedades={propiedades}
              unidades={unidades}
              onGuardado={() => {
                setMostrarForm(false)
                cargar()
              }}
              onCancelar={() => setMostrarForm(false)}
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            {[
              { t: 'A pagar ahora', v: formatoBs(resumen.aPagar), c: 'bg-ink text-white' },
              { t: 'Te ahorrás pagando hoy', v: formatoBs(resumen.ahorro), c: resumen.ahorro > 0 ? 'bg-[#FBF4E4] text-[#6A5011]' : 'bg-panel text-ink' },
              { t: `Intereses por mora ${hoy.slice(0, 4)}`, v: formatoBs(resumen.moraAnio), c: resumen.moraAnio > 0 ? 'bg-[#FBEDEA] text-[#8A3324]' : 'bg-panel text-ink' },
              { t: `Recargos pagados ${hoy.slice(0, 4)}`, v: formatoBs(resumen.recargosPagados), c: resumen.recargosPagados > 0 ? 'bg-[#FBEDEA] text-[#8A3324]' : 'bg-panel text-ink' },
            ].map((x) => (
              <div key={x.t} className={`rounded-lg border border-line px-3 py-2.5 ${x.c}`}>
                <div className="font-body text-[10px] uppercase tracking-wide opacity-80">{x.t}</div>
                <div className="font-display text-base font-bold">{x.v}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="font-body text-sm font-semibold text-ink">{verPagados ? 'Todos' : 'Pendientes de pago'}</div>
            <label className="flex items-center gap-2 font-body text-xs text-ink">
              <input type="checkbox" checked={verPagados} onChange={(e) => setVerPagados(e.target.checked)} />
              Mostrar pagados y anulados
            </label>
          </div>

          {lista.length === 0 && <div className="font-body text-sm text-inksoft">No hay gastos por pagar. 🎉</div>}

          {lista.map((p) => {
            const sit = situacion(p, hoy)
            const fp = fechaPago[p.id] || hoy
            const vig = vencimientoVigente(p, fp)
            const vHoy = vencimientoVigente(p, hoy)
            const lugar = nombreLugar(p)
            return (
              <div key={p.id} className={`border rounded-lg p-4 mb-3 bg-panel ${sit === 'vencido' || sit === 'con_recargo' ? 'border-rojo' : 'border-line'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-body text-sm font-semibold text-ink">{p.titulo}</div>
                    <div className="font-body text-[11px] text-inksoft">
                      {[p.categoria, p.proveedor, lugar, p.periodo ? `período ${etiquetaMes(p.periodo).toLowerCase()}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className={`font-body text-[11px] font-semibold rounded-md px-2 py-1 ${SITUACION[sit].cls}`}>{SITUACION[sit].txt}</span>
                </div>

                {/* Vencimientos como una línea de tiempo simple */}
                <div className="flex gap-2 flex-wrap mt-3">
                  {(p.vencimientos || []).map((v: Vencimiento) => {
                    const pasado = hoy > v.fecha
                    const actual = p.estado === 'pendiente' && vHoy?.vencimiento.numero === v.numero && !vHoy.vencidoTodo
                    return (
                      <div
                        key={v.numero}
                        className={`rounded-lg border px-3 py-2 min-w-[9rem] ${actual ? 'border-ink bg-white' : 'border-line'} ${pasado && p.estado === 'pendiente' ? 'opacity-60' : ''}`}
                      >
                        <div className="font-body text-[10px] uppercase tracking-wide text-inksoft">
                          {v.numero}.º vencimiento{v.recargo ? ` (+${v.recargo}%)` : ''}
                        </div>
                        <div className="font-body text-xs text-ink">{fechaCorta(v.fecha)}{pasado ? ' · pasó' : ''}</div>
                        <div className="font-display text-sm font-bold text-ink">{formatoBs(v.monto)}</div>
                      </div>
                    )
                  })}
                </div>

                {p.estado === 'pendiente' && vHoy && (
                  <div className="font-body text-[11px] mt-2">
                    {vHoy.vencidoTodo ? (
                      <span className="text-rojo font-semibold">Venció el {fechaCorta(vHoy.vencimiento.fecha)}: puede haber intereses adicionales en la próxima liquidación.</span>
                    ) : vHoy.ahorroSiPagaHoy > 0 ? (
                      <span className="text-[#6A5011]">
                        Pagando hasta el {fechaCorta(vHoy.vencimiento.fecha)} ({vHoy.diasParaVencer === 0 ? 'hoy' : `en ${vHoy.diasParaVencer} días`}) te ahorrás {formatoBs(vHoy.ahorroSiPagaHoy)}.
                      </span>
                    ) : (
                      <span className="text-inksoft">Último vencimiento: {fechaCorta(vHoy.vencimiento.fecha)}.</span>
                    )}
                    {Number(p.interesMora) > 0 && <span className="text-rojo"> · Esta liquidación ya trae {formatoBs(p.interesMora)} de interés por mora.</span>}
                  </div>
                )}

                {p.estado === 'pendiente' && (
                  <div className="flex items-end gap-2 flex-wrap mt-3 bg-panelalt rounded-lg px-3 py-2">
                    <label className="font-body text-[11px] text-inksoft flex flex-col gap-0.5">
                      Fecha de pago
                      <input type="date" value={fp} onChange={(e) => setFechaPago((m) => ({ ...m, [p.id]: e.target.value }))} className="px-2 py-1.5 rounded border border-line font-body text-xs text-ink" />
                    </label>
                    <label className="font-body text-[11px] text-inksoft flex flex-col gap-0.5">
                      Monto pagado
                      <input
                        type="number"
                        placeholder={vig ? String(vig.vencimiento.monto) : ''}
                        value={montoPago[p.id] || ''}
                        onChange={(e) => setMontoPago((m) => ({ ...m, [p.id]: e.target.value }))}
                        className="w-32 px-2 py-1.5 rounded border border-line font-body text-xs text-ink"
                      />
                    </label>
                    <button onClick={() => pagar(p)} disabled={procesando === p.id} className="min-h-[36px] px-3 rounded-lg bg-verde text-white font-body text-xs font-semibold disabled:opacity-60">
                      {procesando === p.id ? 'Registrando...' : `✓ Registrar pago${vig ? ` (${formatoBs(Number(montoPago[p.id]) || vig.vencimiento.monto)})` : ''}`}
                    </button>
                  </div>
                )}
                {p.estado === 'pagado' && p.pago && (
                  <div className="font-body text-xs text-verde mt-2">
                    ✓ Pagado el {fechaCorta(p.pago.fecha)}: {formatoBs(p.pago.monto)}
                    {p.pago.vencimientoNumero ? ` (${p.pago.vencimientoNumero}.º vencimiento)` : ' (fuera de término)'}
                    <button onClick={() => pagar(p, true)} className="ml-2 text-inksoft underline">anular pago</button>
                  </div>
                )}
                {mensajes[p.id] && <div className={`font-body text-[11px] mt-1.5 ${mensajes[p.id].startsWith('✓') ? 'text-verde' : 'text-rojo'}`}>{mensajes[p.id]}</div>}

                {(p.pagoProveedor?.cbu || p.pagoProveedor?.alias) && p.estado === 'pendiente' && (
                  <div className="font-body text-[11px] text-inksoft mt-2 flex gap-3 flex-wrap items-center">
                    <span>Transferir a {p.pagoProveedor.titular || 'la administración'}{p.pagoProveedor.banco ? ` (${p.pagoProveedor.banco})` : ''}:</span>
                    {p.pagoProveedor.alias && <Copiar etiqueta="Alias" valor={p.pagoProveedor.alias} />}
                    {p.pagoProveedor.cbu && <Copiar etiqueta="CBU" valor={p.pagoProveedor.cbu} />}
                  </div>
                )}

                <div className="flex gap-3 mt-3 flex-wrap">
                  {(p.conceptos || []).length > 0 && (
                    <button onClick={() => setAbierto(abierto === p.id ? null : p.id)} className="font-body text-[11px] text-ink underline">
                      {abierto === p.id ? 'Ocultar detalle' : 'Ver de qué se compone'}
                    </button>
                  )}
                  {p.documentoUrl && <a href={p.documentoUrl} target="_blank" rel="noreferrer" className="font-body text-[11px] text-ink underline">Ver PDF</a>}
                  {p.estado === 'pendiente' && <button onClick={() => cambiarEstado(p, 'anulado')} className="font-body text-[11px] text-inksoft underline">Anular</button>}
                  {p.estado === 'anulado' && <button onClick={() => cambiarEstado(p, 'pendiente')} className="font-body text-[11px] text-ink underline">Reactivar</button>}
                  <button onClick={() => borrar(p)} className="font-body text-[11px] text-rojo underline ml-auto">Borrar</button>
                </div>
                {abierto === p.id && (
                  <table className="w-full font-body text-[11px] mt-2">
                    <tbody>
                      {(p.conceptos as Concepto[]).map((c, i) => (
                        <tr key={i} className={`${i % 2 ? 'bg-panelalt' : ''} ${/inter[eé]s|mora/i.test(c.concepto) && c.monto > 0 ? 'text-rojo font-semibold' : 'text-ink'}`}>
                          <td className="px-2 py-1">{c.concepto} <span className="text-inksoft font-normal">{c.detalle}</span></td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">{formatoBs(c.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </>
      )}
    </PaginaProtegida>
  )
}

function Copiar({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor)
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        } catch {
          prompt(`Copiá el ${etiqueta}:`, valor)
        }
      }}
      className="px-2 py-1 rounded border border-line bg-white text-ink"
    >
      {ok ? '✓ copiado' : `${etiqueta}: ${valor}`}
    </button>
  )
}

function FormPendiente({ propiedades, unidades, onGuardado, onCancelar }: { propiedades: any[]; unidades: any[]; onGuardado: () => void; onCancelar: () => void }) {
  const { obtenerToken } = useAuth()
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('Expensas')
  const [proveedor, setProveedor] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [propiedadId, setPropiedadId] = useState('')
  const [unidadId, setUnidadId] = useState('')
  const [vencimientos, setVencimientos] = useState<VForm[]>([{ fecha: '', monto: '', recargo: '' }])
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [pagoProveedor, setPagoProveedor] = useState<any>({})
  const [interesMora, setInteresMora] = useState(0)
  const [documentoUrl, setDocumentoUrl] = useState('')
  const [notas, setNotas] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

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
      const [res, url] = await Promise.all([
        fetch('/api/pendientes/importar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ pdfBase64: base64 }) }),
        subirArchivo(archivo, obtenerToken).catch(() => ''),
      ])
      if (url) setDocumentoUrl(url)
      const d = await res.json()
      if (d.error) return setError(d.error + (url ? ' (El PDF igual quedó adjuntado.)' : ''))
      setTitulo(d.titulo || '')
      setCategoria(CATEGORIAS_GASTO.includes(d.categoria) ? d.categoria : 'Otro')
      setProveedor(d.proveedor || '')
      setPeriodo(d.periodo || '')
      setVencimientos((d.vencimientos || []).map((v: Vencimiento) => ({ fecha: v.fecha, monto: String(v.monto), recargo: v.recargo ? String(v.recargo) : '' })))
      setConceptos(d.conceptos || [])
      setPagoProveedor(d.pagoProveedor || {})
      setInteresMora(Number(d.interesMora) || 0)

      // Ubica la unidad ("7-B") y la propiedad ("Rivera 2444") entre las cargadas.
      const { unidad: u, propiedad: pr } = ubicarUnidad(d, propiedades, unidades)
      if (pr) setPropiedadId(pr.id)
      if (u) setUnidadId(u.id)

      setAviso(
        `Se leyó ${d.origen === 'lector' ? 'la liquidación' : 'el documento'}: ${d.vencimientos?.length || 0} vencimiento(s)${d.total ? `, total ${formatoBs(d.total)}` : ''}${d.interesMora ? `, con ${formatoBs(d.interesMora)} de interés por mora` : ''}. ` +
          (u ? `Se asoció a ${u.nombre}.` : d.unidad ? `No encontré la unidad "${d.unidad}" en Propiedades: elegila o cargala primero.` : '')
      )
    } catch (err: any) {
      setError(err.message || 'No se pudo leer el PDF.')
    } finally {
      setLeyendo(false)
    }
  }

  async function guardar() {
    setError('')
    const vs = vencimientos.filter((v) => v.fecha && Number(v.monto) > 0).map((v, i) => ({ numero: i + 1, fecha: v.fecha, monto: Number(v.monto), recargo: v.recargo ? Number(v.recargo) : null }))
    if (!titulo.trim()) return setError('Poné un título.')
    if (!vs.length) return setError('Cargá al menos un vencimiento con fecha y monto.')
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/pendientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ titulo, categoria, proveedor, periodo: periodo || null, propiedadId: propiedadId || null, unidadId: unidadId || null, vencimientos: vs, conceptos, pagoProveedor, interesMora, documentoUrl: documentoUrl || null, notas }),
      })
      const d = await res.json()
      if (d.error) return setError(d.error)
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  const input = 'w-full px-3 py-2 rounded-lg border border-line font-body text-sm'
  const et = 'font-body text-[11px] text-inksoft block mb-1'
  const unidadesProp = unidades.filter((u) => !propiedadId || u.propiedadId === propiedadId)

  return (
    <div className="bg-panel border border-line rounded-xl p-5 mb-6">
      <div className="font-display text-base font-bold text-ink mb-3">Nuevo gasto por pagar</div>
      <div className="border border-line rounded-lg p-3 mb-4 bg-white/50">
        <div className="font-body text-sm font-semibold text-ink mb-1">📄 Subí la liquidación o factura (PDF)</div>
        <div className="font-body text-[11px] text-inksoft mb-2">Las liquidaciones de expensas de AdminProp / Mis Expensas se leen exactas; otros formatos, con IA.</div>
        <input type="file" accept="application/pdf" disabled={leyendo} onChange={(e) => e.target.files?.[0] && leerPDF(e.target.files[0])} className="w-full font-body text-xs" />
        {leyendo && <div className="font-body text-[11px] text-inksoft mt-2">Leyendo...</div>}
        {aviso && <div className="font-body text-[11px] text-verde mt-2">{aviso}</div>}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2"><label className={et}>Título</label><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Expensas 9/2026 — 7-B" className={input} /></div>
        <div>
          <label className={et}>Categoría del gasto</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${input} bg-white`}>
            {CATEGORIAS_GASTO.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className={et}>Quién cobra</label><input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Administración Carpena" className={input} /></div>
        <div>
          <label className={et}>Propiedad</label>
          <select value={propiedadId} onChange={(e) => { setPropiedadId(e.target.value); setUnidadId('') }} className={`${input} bg-white`}>
            <option value="">— General —</option>
            {propiedades.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className={et}>Departamento / unidad</label>
          <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} className={`${input} bg-white`}>
            <option value="">—</option>
            {unidadesProp.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div><label className={et}>Período (mes liquidado)</label><input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={input} /></div>
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Vencimientos</div>
      {vencimientos.map((v, i) => (
        <div key={i} className="flex gap-2 items-end flex-wrap mb-2">
          <label className="font-body text-[11px] text-inksoft flex flex-col">{i + 1}.º vencimiento<input type="date" value={v.fecha} onChange={(e) => setVencimientos((a) => a.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))} className="px-2 py-1.5 rounded border border-line text-sm text-ink" /></label>
          <label className="font-body text-[11px] text-inksoft flex flex-col">Monto<input type="number" value={v.monto} onChange={(e) => setVencimientos((a) => a.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} className="w-36 px-2 py-1.5 rounded border border-line text-sm text-ink" /></label>
          <label className="font-body text-[11px] text-inksoft flex flex-col">Recargo %<input type="number" value={v.recargo} onChange={(e) => setVencimientos((a) => a.map((x, j) => (j === i ? { ...x, recargo: e.target.value } : x)))} className="w-20 px-2 py-1.5 rounded border border-line text-sm text-ink" /></label>
          {vencimientos.length > 1 && <button type="button" onClick={() => setVencimientos((a) => a.filter((_, j) => j !== i))} className="font-body text-[11px] text-rojo pb-2">Quitar</button>}
        </div>
      ))}
      <button type="button" onClick={() => setVencimientos((a) => [...a, { fecha: '', monto: '', recargo: '' }])} className="font-body text-[11px] text-ink underline mb-4">+ Agregar vencimiento</button>

      {conceptos.length > 0 && (
        <div className="border border-line rounded-lg p-3 mb-4 bg-white/50 font-body text-xs">
          <div className="font-semibold text-ink mb-1">Se compone de</div>
          {conceptos.map((c, i) => (
            <div key={i} className={`flex justify-between py-0.5 ${/inter[eé]s|mora/i.test(c.concepto) && c.monto > 0 ? 'text-rojo font-semibold' : 'text-ink'}`}>
              <span>{c.concepto} <span className="text-inksoft font-normal">{c.detalle}</span></span>
              <span>{formatoBs(c.monto)}</span>
            </div>
          ))}
          {(pagoProveedor?.cbu || pagoProveedor?.alias) && (
            <div className="text-inksoft mt-2">Pago: {[pagoProveedor.titular, pagoProveedor.banco, pagoProveedor.alias && `alias ${pagoProveedor.alias}`, pagoProveedor.cbu && `CBU ${pagoProveedor.cbu}`].filter(Boolean).join(' · ')}</div>
          )}
        </div>
      )}

      <div className="mb-4"><label className={et}>Notas</label><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={input} /></div>
      {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[44px] rounded-lg bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" onClick={onCancelar} className="px-4 min-h-[44px] rounded-lg border border-line font-body text-sm text-ink">Cancelar</button>
      </div>
    </div>
  )
}
