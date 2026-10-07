'use client'

import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useAuth } from '@/lib/auth'
import { subirArchivo } from '@/lib/subirArchivo'
import { formatoBs, fechaCorta, etiquetaMes } from '@/lib/esquemaPago'
import { gruposDeHistorial, armarHistorial } from '@/lib/historialExpensas'
import { ubicarUnidad } from '@/lib/pendientes'

// Historial mes a mes de las expensas (o de otro gasto recurrente) de
// una unidad: gráfico de barras (expensa del mes + interés por mora +
// recargo por pagar tarde), tabla, y cuánto se fue en costos evitables.
// Permite subir varias liquidaciones viejas de una vez para armarlo.

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const corto = (p: string) => `${MESES_CORTOS[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`

export function Historial({ pendientes, propiedades, unidades, onCambio }: { pendientes: any[]; propiedades: any[]; unidades: any[]; onCambio: () => void }) {
  const grupos = useMemo(() => gruposDeHistorial(pendientes), [pendientes])
  const [clave, setClave] = useState('')
  const elegido = clave || grupos[0]?.clave || ''
  const anio = new Date().toISOString().slice(0, 4)
  const h = useMemo(() => (elegido ? armarHistorial(pendientes, elegido, anio) : null), [pendientes, elegido, anio])

  const nombreGrupo = (g: (typeof grupos)[number]) => {
    const u = unidades.find((x) => x.id === g.unidadId)
    const p = propiedades.find((x) => x.id === (u?.propiedadId || g.propiedadId))
    return `${g.categoria} · ${[p?.nombre, u?.nombre].filter(Boolean).join(' — ') || 'General'} (${g.cantidad})`
  }

  const datosGrafico = (h?.filas || []).map((f) => ({ mes: corto(f.periodo), 'Expensa del mes': f.expensaDelMes, 'Interés por mora': f.mora, 'Recargo por pagar tarde': f.recargo }))
  const delta = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`)

  return (
    <div>
      <CargaMasiva propiedades={propiedades} unidades={unidades} onListo={onCambio} />

      {grupos.length === 0 ? (
        <div className="font-body text-sm text-inksoft">Todavía no hay liquidaciones con período cargadas. Subí las de los meses anteriores arriba para armar el historial.</div>
      ) : (
        <>
          <label className="font-body text-[11px] text-inksoft flex flex-col gap-1 mb-4 max-w-md">
            Historial de
            <select value={elegido} onChange={(e) => setClave(e.target.value)} className="min-h-[44px] px-3 rounded-lg border border-line bg-white font-body text-sm text-ink">
              {grupos.map((g) => (
                <option key={g.clave} value={g.clave}>{nombreGrupo(g)}</option>
              ))}
            </select>
          </label>

          {h && h.ultima && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <Tarjeta t={`Última (${corto(h.ultima.periodo)})`} v={formatoBs(h.ultima.expensaDelMes)} sub={h.ultima.variacion !== null ? `${delta(h.ultima.variacion)} vs mes anterior` : 'sin mes anterior'} />
                <Tarjeta t="Promedio últimos 6 meses" v={formatoBs(h.promedio6)} sub={`3 meses: ${delta(h.variacion3)} · 12 meses: ${delta(h.variacion12)}`} />
                <Tarjeta t={`Mora + recargos ${anio}`} v={formatoBs(h.costoEvitableAnio)} sub={`mora ${formatoBs(h.moraAnio)} · recargos ${formatoBs(h.recargosAnio)}`} alerta={h.costoEvitableAnio > 0} />
                <Tarjeta t="Pagadas a tiempo" v={`${h.pagadasATiempo} de ${h.pagadasATiempo + h.pagadasConRecargo}`} sub={h.pagadasConRecargo ? `${h.pagadasConRecargo} después del 1.º vencimiento` : 'todas al 1.º vencimiento'} />
              </div>

              {h.costoEvitableAnio > 0 && (
                <div className="bg-[#FBEDEA] border border-[#E9C4BC] rounded-lg px-3 py-2 mb-4 font-body text-xs text-[#8A3324]">
                  En {anio} se fueron <b>{formatoBs(h.costoEvitableAnio)}</b> en intereses y recargos que se evitan pagando siempre antes del 1.º vencimiento.
                </div>
              )}

              <div className="bg-white border border-line rounded-xl p-3 mb-4">
                <div className="font-body text-xs font-semibold text-ink mb-2">Mes a mes</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datosGrafico} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6EBF1" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={42} />
                      <Tooltip formatter={(v: any) => formatoBs(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Expensa del mes" stackId="a" fill="#2F6FB0" />
                      <Bar dataKey="Interés por mora" stackId="a" fill="#C2410C" />
                      <Bar dataKey="Recargo por pagar tarde" stackId="a" fill="#F59E0B" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="overflow-x-auto border border-line rounded-xl">
                <table className="w-full font-body text-xs min-w-[640px]">
                  <thead>
                    <tr className="bg-ink text-white">
                      <th className="text-left px-2 py-2">Período</th>
                      <th className="text-right px-2 py-2">Expensa del mes</th>
                      <th className="text-right px-2 py-2">Variación</th>
                      <th className="text-right px-2 py-2">Mora</th>
                      <th className="text-right px-2 py-2">Liquidación</th>
                      <th className="text-left px-2 py-2">Pago</th>
                      <th className="text-right px-2 py-2">Recargo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...h.filas].reverse().map((f, i) => (
                      <tr key={f.id} className={i % 2 ? 'bg-panelalt' : 'bg-white'}>
                        <td className="px-2 py-1.5 text-ink">{etiquetaMes(f.periodo)}</td>
                        <td className="px-2 py-1.5 text-right text-ink font-semibold whitespace-nowrap">{formatoBs(f.expensaDelMes)}</td>
                        <td className={`px-2 py-1.5 text-right whitespace-nowrap ${f.variacion !== null && f.variacion > 5 ? 'text-rojo' : 'text-inksoft'}`}>{delta(f.variacion)}</td>
                        <td className={`px-2 py-1.5 text-right whitespace-nowrap ${f.mora > 0 ? 'text-rojo font-semibold' : 'text-inksoft'}`}>{f.mora ? formatoBs(f.mora) : '—'}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{formatoBs(f.liquidacion)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {f.pagado === null ? (
                            <span className="text-[#6A5011]">pendiente</span>
                          ) : (
                            <span className={f.vencimientoNumero === 1 ? 'text-verde' : 'text-[#8A3324]'}>
                              {f.fechaPago ? fechaCorta(f.fechaPago) : '—'} · {f.vencimientoNumero ? `${f.vencimientoNumero}.º venc.` : 'fuera de término'}
                            </span>
                          )}
                        </td>
                        <td className={`px-2 py-1.5 text-right whitespace-nowrap ${f.recargo > 0 ? 'text-rojo font-semibold' : 'text-inksoft'}`}>{f.recargo ? formatoBs(f.recargo) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="font-body text-[11px] text-inksoft mt-2">
                "Expensa del mes" es la liquidación sin el interés por mora ni el saldo anterior: lo que realmente costó ese mes. La variación compara contra el mes anterior.
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Tarjeta({ t, v, sub, alerta }: { t: string; v: string; sub: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${alerta ? 'bg-[#FBEDEA] border-[#E9C4BC]' : 'bg-panel border-line'}`}>
      <div className="font-body text-[10px] uppercase tracking-wide text-inksoft">{t}</div>
      <div className={`font-display text-base font-bold ${alerta ? 'text-[#8A3324]' : 'text-ink'}`}>{v}</div>
      <div className="font-body text-[11px] text-inksoft">{sub}</div>
    </div>
  )
}

// Subir varias liquidaciones a la vez (por ejemplo, las del último año)
// para tener el historial completo sin cargarlas de a una.
function CargaMasiva({ propiedades, unidades, onListo }: { propiedades: any[]; unidades: any[]; onListo: () => void }) {
  const { obtenerToken } = useAuth()
  const [modo, setModo] = useState<'historico' | 'conGasto'>('historico')
  const [trabajando, setTrabajando] = useState(false)
  const [log, setLog] = useState<{ archivo: string; texto: string; ok: boolean }[]>([])
  const [abierto, setAbierto] = useState(false)

  async function procesar(archivos: FileList) {
    setTrabajando(true)
    setLog([])
    const token = await obtenerToken()
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    const lista = Array.from(archivos).filter((f) => f.type === 'application/pdf')
    for (const archivo of lista) {
      const anotar = (texto: string, ok: boolean) => setLog((l) => [...l, { archivo: archivo.name, texto, ok }])
      try {
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result as string)
          r.onerror = rej
          r.readAsDataURL(archivo)
        })
        const [d, url] = await Promise.all([
          fetch('/api/pendientes/importar', { method: 'POST', headers: h, body: JSON.stringify({ pdfBase64: base64 }) }).then((r) => r.json()),
          subirArchivo(archivo, obtenerToken).catch(() => ''),
        ])
        if (d.error) {
          anotar(d.error, false)
          continue
        }
        const { propiedad, unidad } = ubicarUnidad(d, propiedades, unidades)
        const res = await fetch('/api/pendientes', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            titulo: d.titulo, categoria: d.categoria, proveedor: d.proveedor, periodo: d.periodo,
            propiedadId: propiedad?.id || null, unidadId: unidad?.id || null,
            vencimientos: d.vencimientos, conceptos: d.conceptos, pagoProveedor: d.pagoProveedor, interesMora: d.interesMora,
            documentoUrl: url || null, historico: modo === 'historico',
          }),
        }).then((r) => r.json())
        if (res.error) {
          anotar(res.error, false)
          continue
        }
        if (modo === 'conGasto') {
          // Se registra el pago al 1.º vencimiento (se puede corregir después).
          await fetch(`/api/pendientes/${res.id}/pagar`, { method: 'POST', headers: h, body: JSON.stringify({ fecha: d.vencimientos[0].fecha }) })
        }
        anotar(`${d.titulo}${unidad ? '' : ' (sin unidad asociada)'} — ${formatoBs(d.vencimientos[0].monto)}`, true)
      } catch (err: any) {
        anotar(err.message || 'Error', false)
      }
    }
    setTrabajando(false)
    onListo()
  }

  return (
    <div className="bg-panel border border-line rounded-xl p-4 mb-5">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="font-body text-sm font-semibold text-ink">
        {abierto ? '▾' : '▸'} Subir liquidaciones de meses anteriores
      </button>
      {abierto && (
        <div className="mt-3">
          <div className="font-body text-[11px] text-inksoft mb-2">Elegí varios PDF a la vez. Se leen, se asocian a la unidad y se arma el historial. Si un mes ya está cargado, se saltea.</div>
          <div className="flex flex-col gap-1 mb-3 font-body text-xs text-ink">
            <label className="flex items-start gap-2">
              <input type="radio" checked={modo === 'historico'} onChange={() => setModo('historico')} className="mt-0.5" />
              <span><b>Solo para el historial</b>: se marcan como pagadas y <b>no</b> se crea el gasto (usalo si esos gastos ya están en "Ingresos y gastos" o no te interesa cargarlos).</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" checked={modo === 'conGasto'} onChange={() => setModo('conGasto')} className="mt-0.5" />
              <span><b>Registrar también el gasto</b> de cada mes, pagado al 1.º vencimiento.</span>
            </label>
          </div>
          <input type="file" accept="application/pdf" multiple disabled={trabajando} onChange={(e) => e.target.files?.length && procesar(e.target.files)} className="w-full font-body text-xs" />
          {trabajando && <div className="font-body text-[11px] text-inksoft mt-2">Procesando {log.length + 1}...</div>}
          {log.length > 0 && (
            <ul className="mt-2 font-body text-[11px]">
              {log.map((l, i) => (
                <li key={i} className={l.ok ? 'text-verde' : 'text-rojo'}>
                  {l.ok ? '✓' : '✗'} {l.archivo}: {l.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
