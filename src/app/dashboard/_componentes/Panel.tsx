'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, AreaChart, LineChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from 'recharts'
import { armarPanel, sumarMes, CATEGORIAS_FIJAS } from '@/lib/panel'
import { formatoBs, etiquetaMes, fechaCorta } from '@/lib/esquemaPago'

// Panel de finanzas: responde 4 preguntas
//   1. ¿Cuánto ahorro? (KPIs + ahorro mes a mes + acumulado + tasa vs meta)
//   2. ¿En qué se me va la plata? (categorías apiladas, fijos vs variables)
//   3. ¿Estoy gastando más que lo normal? (mes contra promedio de 3 meses)
//   4. ¿Qué se viene? (caja proyectada con lo agendado)

export type Periodo = '6m' | '12m' | 'anio' | 'todo'

const COLORES = ['#2F6FB0', '#C46A2B', '#2F6D4F', '#8A3324', '#6B4FA0', '#B3831F', '#0F766E', '#9CA3AF']
// Ingresos: solo verdes/azules (un rojo se leería como gasto).
const COLORES_INGRESO = ['#2F6D4F', '#2F6FB0', '#0F766E', '#6B4FA0', '#7A9A3A', '#B3831F']
const C = { ingreso: '#2F6D4F', gasto: '#8A3324', ahorro: '#B3831F', azul: '#2F6FB0', grilla: '#E7E5DC' }

const corto = (v: number) => {
  const a = Math.abs(v)
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : String(Math.round(a))
  return v < 0 ? `-${s}` : s
}

function Caja({ alto = 260, children }: { alto?: number; children: React.ReactElement }) {
  return (
    <div style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 820, height: alto }}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function Tarjeta({ titulo, valor, sub, tono = 'neutro', destacado = false }: { titulo: string; valor: string; sub?: React.ReactNode; tono?: 'bueno' | 'malo' | 'neutro'; destacado?: boolean }) {
  const color = tono === 'bueno' ? 'text-verde' : tono === 'malo' ? 'text-rojo' : 'text-ink'
  return (
    <div className={`rounded-xl border px-4 py-3 ${destacado ? 'bg-ink border-ink' : 'bg-panel border-line'}`}>
      <div className={`font-body text-[11px] uppercase tracking-wide ${destacado ? 'text-white/70' : 'text-inksoft'}`}>{titulo}</div>
      <div className={`font-display text-2xl font-bold mt-0.5 ${destacado ? 'text-white' : color}`}>{valor}</div>
      {sub && <div className={`font-body text-[11px] mt-0.5 ${destacado ? 'text-white/75' : 'text-inksoft'}`}>{sub}</div>}
    </div>
  )
}

function Seccion({ titulo, sub, children, accion }: { titulo: string; sub?: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="bg-panel border border-line rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="m-0 font-display text-base font-bold text-ink">{titulo}</h2>
          {sub && <div className="font-body text-[11px] text-inksoft mt-0.5">{sub}</div>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

const pct = (v: number) => `${String(v).replace('.', ',')}%`
const delta = (actual: number, base: number) => (base ? Math.round(((actual - base) / Math.abs(base)) * 100) : null)
const tip = { formatter: (v: any, n: any) => [formatoBs(Number(v)), n], contentStyle: { fontSize: 12, borderRadius: 8 } }

export function Panel({
  datos,
  hoy = new Date().toISOString().slice(0, 10),
  propiedades = [],
  mostrarPersonas = false,
  periodoInicial = '12m',
}: {
  datos: { movimientos: any[]; pendientes?: any[]; alquileres?: any[]; deudas?: any[] }
  hoy?: string
  propiedades?: any[]
  mostrarPersonas?: boolean
  periodoInicial?: Periodo
}) {
  const mesHoy = hoy.slice(0, 7)
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial)
  const [mesFoco, setMesFoco] = useState(mesHoy)
  const [meta, setMeta] = useState(() => {
    if (typeof window === 'undefined') return 20
    const v = Number(window.localStorage?.getItem('panel:metaAhorro'))
    return v > 0 && v < 100 ? v : 20
  })

  const primerMes = useMemo(() => datos.movimientos.reduce((m, x) => (x.fecha && x.fecha.slice(0, 7) < m ? x.fecha.slice(0, 7) : m), mesHoy), [datos.movimientos, mesHoy])
  const desde = periodo === '6m' ? sumarMes(mesHoy, -5) : periodo === '12m' ? sumarMes(mesHoy, -11) : periodo === 'anio' ? `${mesHoy.slice(0, 4)}-01` : primerMes
  const p = useMemo(() => armarPanel(datos, { desde, hasta: mesHoy, mesFoco, hoy }), [datos, desde, mesHoy, mesFoco, hoy])

  if (!datos.movimientos.length) {
    return <div className="font-body text-sm text-inksoft">Todavía no hay movimientos cargados en este espacio. Cuando cargues ingresos y gastos (o los importes desde tu planilla), acá vas a ver cómo vienen tus finanzas.</div>
  }

  const f = p.foco!
  const base = p.previos.slice(-3)
  const promIng = base.length ? base.reduce((s, x) => s + x.ingresos, 0) / base.length : 0
  const promGas = base.length ? base.reduce((s, x) => s + x.gastos, 0) / base.length : 0
  const promAh = base.length ? base.reduce((s, x) => s + x.ahorro, 0) / base.length : 0
  const comp = (actual: number, prom: number, masEsBueno: boolean) => {
    // Mes en curso: compararlo con un mes completo engaña; se muestra
    // cuánto lleva respecto de un mes normal.
    if (f.enCurso) return prom ? `llevás el ${Math.round((actual / prom) * 100)}% de un mes normal` : 'mes en curso'
    const d = delta(actual, prom)
    if (d === null) return 'sin meses previos para comparar'
    const bien = masEsBueno ? d >= 0 : d <= 0
    return <span className={bien ? 'text-verde' : 'text-rojo'}>{d > 0 ? '▲' : d < 0 ? '▼' : '='} {Math.abs(d)}% vs promedio 3 meses</span>
  }

  // Categorías: las 6 más grandes del período, el resto en "Resto"
  const totalPorCat: Record<string, number> = {}
  for (const s of p.serie) for (const [k, v] of Object.entries(s.porCategoria)) totalPorCat[k] = (totalPorCat[k] || 0) + v
  const topCats = Object.entries(totalPorCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k)
  const datosCats = p.serie.map((s) => {
    const fila: any = { etiqueta: s.etiqueta }
    let resto = 0
    for (const [k, v] of Object.entries(s.porCategoria)) topCats.includes(k) ? (fila[k] = v) : (resto += v)
    if (resto) fila.Resto = resto
    return fila
  })
  const fuentes = Array.from(new Set(p.serie.flatMap((s) => Object.keys(s.porFuente))))
  const datosFuentes = p.serie.map((s) => ({ etiqueta: s.etiqueta, ...s.porFuente }))
  const maxCat = Math.max(1, ...p.categoriasMes.map((c) => Math.max(c.monto, c.promedio)))

  // Balance por propiedad (en el período)
  const porProp = propiedades
    .map((pr) => {
      const movs = datos.movimientos.filter((m) => m.propiedadId === pr.id && m.fecha >= `${desde}-01`)
      const ing = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
      const gas = movs.filter((m) => m.tipo !== 'ingreso').reduce((s, m) => s + Number(m.monto), 0)
      return { nombre: pr.nombre, ingresos: ing, gastos: gas, neto: ing - gas }
    })
    .filter((x) => x.ingresos || x.gastos)
  const porPersona = mostrarPersonas
    ? Object.values(
        datos.movimientos
          .filter((m) => m.fecha >= `${desde}-01`)
          .reduce((acc: any, m) => {
            const k = m.registradoPorNombre || 'Sin nombre'
            acc[k] = acc[k] || { nombre: k, ingresos: 0, gastos: 0 }
            acc[k][m.tipo === 'ingreso' ? 'ingresos' : 'gastos'] += Number(m.monto)
            return acc
          }, {})
      )
    : []

  const botonPeriodo = (v: Periodo, t: string) => (
    <button key={v} onClick={() => setPeriodo(v)} aria-pressed={periodo === v} className={`min-h-[36px] px-3 font-body text-xs ${periodo === v ? 'bg-ink text-white font-semibold' : 'bg-white text-ink'}`}>
      {t}
    </button>
  )

  return (
    <div>
      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Período">
          {botonPeriodo('6m', '6 meses')}
          {botonPeriodo('12m', '12 meses')}
          {botonPeriodo('anio', 'Este año')}
          {botonPeriodo('todo', 'Todo')}
        </div>
        <label className="font-body text-[11px] text-inksoft flex flex-col gap-1">
          Mes a analizar
          <select value={f.mes} onChange={(e) => setMesFoco(e.target.value)} className="min-h-[36px] px-2 rounded-lg border border-line bg-white font-body text-xs text-ink">
            {[...p.serie].reverse().map((s) => (
              <option key={s.mes} value={s.mes}>{etiquetaMes(s.mes)}{s.enCurso ? ' (en curso)' : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 1. KPIs del mes */}
      <div className="font-body text-xs text-inksoft mb-2">
        {etiquetaMes(f.mes)}
        {f.enCurso ? ` · en curso, al ${fechaCorta(hoy)}` : ''}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Tarjeta titulo="Entró" valor={formatoBs(f.ingresos)} sub={comp(f.ingresos, promIng, true)} tono="bueno" />
        <Tarjeta titulo="Salió" valor={formatoBs(f.gastos)} sub={comp(f.gastos, promGas, false)} tono="malo" />
        <Tarjeta titulo={f.ahorro >= 0 ? 'Ahorraste' : 'Gastaste de más'} valor={formatoBs(Math.abs(f.ahorro))} sub={comp(f.ahorro, promAh, true)} tono={f.ahorro >= 0 ? 'bueno' : 'malo'} />
        <Tarjeta
          titulo="Tasa de ahorro"
          valor={f.tasa === null ? '—' : pct(f.tasa)}
          sub={f.tasa === null ? 'sin ingresos este mes' : f.tasa >= meta ? `✓ arriba de tu meta del ${meta}%` : `meta: ${meta}% (faltan ${Math.round(meta - f.tasa)} puntos)`}
          destacado
        />
      </div>

      {/* Lo que hay que saber */}
      {p.insights.length > 0 && (
        <Seccion titulo="Lo que hay que saber">
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {p.insights.map((i, k) => (
              <li key={k} className="flex gap-2 font-body text-sm text-ink">
                <span aria-hidden className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${i.tono === 'bueno' ? 'bg-verde' : i.tono === 'malo' ? 'bg-rojo' : 'bg-ocre'}`} />
                <span>{i.texto}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* 2. Línea de tiempo principal */}
      <Seccion titulo="Ingresos, gastos y ahorro mes a mes" sub="Tocá un mes para analizarlo arriba. La línea dorada es lo que ahorraste (o faltó) cada mes.">
        <Caja alto={280}>
          <ComposedChart data={p.serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} onClick={(e: any) => e?.activePayload?.[0] && setMesFoco(e.activePayload[0].payload.mes)}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grilla} vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={corto} tick={{ fontSize: 11 }} width={44} />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#9CA3AF" />
            <Bar dataKey="ingresos" name="Ingresos" fill={C.ingreso} radius={[3, 3, 0, 0]} cursor="pointer">
              {p.serie.map((s) => <Cell key={s.mes} fillOpacity={s.mes === f.mes ? 1 : s.enCurso ? 0.45 : 0.8} />)}
            </Bar>
            <Bar dataKey="gastos" name="Gastos" fill={C.gasto} radius={[3, 3, 0, 0]} cursor="pointer">
              {p.serie.map((s) => <Cell key={s.mes} fillOpacity={s.mes === f.mes ? 1 : s.enCurso ? 0.45 : 0.8} />)}
            </Bar>
            <Line type="monotone" dataKey="ahorro" name="Ahorro del mes" stroke={C.ahorro} strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </Caja>
      </Seccion>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4">
        <Seccion titulo="Ahorro acumulado" sub={`Lo que juntaste en el período: ${formatoBs(p.indicadores.acumuladoPeriodo)}`}>
          <Caja alto={220}>
            <AreaChart data={p.serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.ingreso} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.ingreso} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grilla} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={corto} tick={{ fontSize: 11 }} width={44} />
              <Tooltip {...tip} />
              <ReferenceLine y={0} stroke="#9CA3AF" />
              <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke={C.ingreso} strokeWidth={2} fill="url(#gradAcum)" />
            </AreaChart>
          </Caja>
        </Seccion>

        <Seccion
          titulo="Tasa de ahorro"
          sub="Qué parte de lo que entra te queda. La línea punteada es tu meta."
          accion={
            <label className="font-body text-[11px] text-inksoft flex items-center gap-1">
              Meta
              <input
                type="number"
                min={1}
                max={90}
                value={meta}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setMeta(v)
                  try {
                    window.localStorage.setItem('panel:metaAhorro', String(v))
                  } catch {
                    // sin almacenamiento: vale solo en esta sesión
                  }
                }}
                className="w-14 px-1.5 py-1 rounded border border-line text-ink"
              />
              %
            </label>
          }
        >
          <Caja alto={220}>
            <LineChart data={p.serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grilla} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v: any) => [pct(Number(v)), 'Tasa de ahorro']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={meta} stroke={C.ahorro} strokeDasharray="5 4" label={{ value: `meta ${meta}%`, fontSize: 10, fill: '#6A5011', position: 'insideTopRight' }} />
              <ReferenceLine y={0} stroke="#9CA3AF" />
              <Line type="monotone" dataKey="tasa" name="Tasa de ahorro" stroke={C.azul} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </Caja>
        </Seccion>
      </div>

      {/* 3. ¿En qué se va la plata? */}
      <Seccion
        titulo={`¿En qué se fue la plata en ${etiquetaMes(f.mes).toLowerCase()}?`}
        sub={f.enCurso ? 'Lo gastado hasta hoy contra tu promedio mensual de los 3 meses anteriores (la rayita gris).' : 'Cada categoría contra tu promedio de los 3 meses anteriores (la rayita gris).'}
      >
        <div className="flex flex-col gap-2.5">
          {p.categoriasMes.filter((c) => !f.enCurso || c.monto > 0).map((c) => {
            const alerta = c.variacion !== null && (f.enCurso ? c.monto > c.promedio : c.variacion >= 25)
            return (
              <div key={c.categoria}>
                <div className="flex justify-between gap-3 font-body text-xs">
                  <span className="text-ink">
                    {c.categoria}
                    {c.fija && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-panelalt text-inksoft text-[10px]">fijo</span>}
                  </span>
                  <span className="whitespace-nowrap">
                    <b className="text-ink">{formatoBs(c.monto)}</b>
                    {c.variacion !== null &&
                      (f.enCurso ? (
                        <span className={`ml-2 ${alerta ? 'text-rojo font-semibold' : 'text-inksoft'}`}>
                          {alerta ? 'ya pasó tu promedio' : `${Math.round((c.monto / c.promedio) * 100)}% de tu promedio`}
                        </span>
                      ) : (
                        <span className={`ml-2 ${alerta ? 'text-rojo font-semibold' : c.variacion <= -15 ? 'text-verde' : 'text-inksoft'}`}>
                          {c.variacion > 0 ? '▲' : c.variacion < 0 ? '▼' : '='} {Math.abs(c.variacion)}%
                        </span>
                      ))}
                  </span>
                </div>
                <div className="relative h-2.5 bg-panelalt rounded mt-1">
                  <div className={`h-2.5 rounded ${alerta ? 'bg-rojo' : 'bg-[#2F6FB0]'}`} style={{ width: `${(c.monto / maxCat) * 100}%` }} />
                  {c.promedio > 0 && <div className="absolute -top-0.5 w-0.5 h-3.5 bg-inksoft" style={{ left: `${(c.promedio / maxCat) * 100}%` }} title={`Promedio: ${formatoBs(c.promedio)}`} />}
                </div>
              </div>
            )
          })}
        </div>
      </Seccion>

      <Seccion titulo="Gastos por categoría, mes a mes" sub="Las 6 categorías más grandes del período; el resto, agrupado.">
        <Caja alto={260}>
          <BarChart data={datosCats} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grilla} vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={corto} tick={{ fontSize: 11 }} width={44} />
            <Tooltip {...tip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {[...topCats, 'Resto'].map((k, i) => (
              <Bar key={k} dataKey={k} stackId="c" fill={k === 'Resto' ? '#CBD5E1' : COLORES[i % COLORES.length]} />
            ))}
          </BarChart>
        </Caja>
      </Seccion>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4">
        <Seccion titulo="Gastos fijos vs variables" sub={`Fijos: ${CATEGORIAS_FIJAS.map((c) => c.split(' (')[0].toLowerCase()).join(', ')} y lo que pagás desde "Por pagar".`}>
          <Caja alto={220}>
            <BarChart data={p.serie} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grilla} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={corto} tick={{ fontSize: 11 }} width={44} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="fijos" name="Fijos" stackId="f" fill="#6B7280" />
              <Bar dataKey="variables" name="Variables" stackId="f" fill="#C46A2B" />
            </BarChart>
          </Caja>
        </Seccion>
        <Seccion titulo="¿De dónde vienen los ingresos?">
          <Caja alto={220}>
            <AreaChart data={datosFuentes} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grilla} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={corto} tick={{ fontSize: 11 }} width={44} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {fuentes.map((k, i) => (
                <Area key={k} type="monotone" dataKey={k} stackId="i" stroke={COLORES_INGRESO[i % COLORES_INGRESO.length]} fill={COLORES_INGRESO[i % COLORES_INGRESO.length]} fillOpacity={0.5} />
              ))}
            </AreaChart>
          </Caja>
        </Seccion>
      </div>

      {/* 4. ¿Qué se viene? */}
      <Seccion
        titulo="Próximos 60 días"
        sub="Tu caja de hoy más lo que ya está agendado: alquileres a cobrar, cuotas de deudas y gastos por pagar. No incluye el gasto del día a día."
      >
        {p.eventos.length === 0 ? (
          <div className="font-body text-xs text-inksoft">No hay cobros ni pagos agendados. Cargá tus gastos en "Por pagar" para verlos acá.</div>
        ) : (
          <>
            <Caja alto={200}>
              <AreaChart data={p.proyeccion} margin={{ top: 6, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grilla} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={corto} tick={{ fontSize: 11 }} width={44} domain={['auto', 'auto']} />
                <Tooltip formatter={(v: any) => [formatoBs(Number(v)), 'Saldo']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <ReferenceLine y={0} stroke="#8A3324" />
                <Area type="stepAfter" dataKey="saldo" stroke={C.azul} strokeWidth={2} fill={C.azul} fillOpacity={0.12} />
              </AreaChart>
            </Caja>
            <div className="mt-3 max-h-56 overflow-y-auto">
              {p.eventos.map((e, i) => (
                <div key={i} className="flex justify-between gap-3 py-1.5 border-b border-line last:border-0 font-body text-xs">
                  <span className="text-inksoft w-12 shrink-0">{fechaCorta(e.fecha).slice(0, 5)}</span>
                  <span className="flex-1 text-ink">{e.concepto}</span>
                  <span className={`whitespace-nowrap font-semibold ${e.monto >= 0 ? 'text-verde' : 'text-rojo'}`}>
                    {e.monto >= 0 ? '+' : '-'}
                    {formatoBs(Math.abs(e.monto))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Seccion>

      {(porProp.length > 0 || porPersona.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4">
          {porProp.length > 0 && (
            <Seccion titulo="Balance por propiedad" sub="Ingresos menos gastos de cada una, en el período.">
              {porProp.map((x) => (
                <div key={x.nombre} className="flex justify-between gap-3 py-1.5 border-b border-line last:border-0 font-body text-xs">
                  <span className="text-ink">{x.nombre}</span>
                  <span className="text-inksoft whitespace-nowrap">
                    +{formatoBs(x.ingresos)} / -{formatoBs(x.gastos)} = <b className={x.neto >= 0 ? 'text-verde' : 'text-rojo'}>{formatoBs(x.neto)}</b>
                  </span>
                </div>
              ))}
            </Seccion>
          )}
          {porPersona.length > 0 && (
            <Seccion titulo="Balance por persona" sub="Lo que registró cada uno en el período.">
              {(porPersona as any[]).map((x) => (
                <div key={x.nombre} className="flex justify-between gap-3 py-1.5 border-b border-line last:border-0 font-body text-xs">
                  <span className="text-ink">{x.nombre}</span>
                  <span className="text-inksoft whitespace-nowrap">
                    <span className="text-verde">+{formatoBs(x.ingresos)}</span> · <span className="text-rojo">-{formatoBs(x.gastos)}</span>
                  </span>
                </div>
              ))}
            </Seccion>
          )}
        </div>
      )}
    </div>
  )
}
