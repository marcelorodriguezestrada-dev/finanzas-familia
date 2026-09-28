'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { FormDeuda } from './_componentes/FormDeuda'
import { ESTADOS_DEUDA, EstadoDeuda, ordenarCuotas, resumirDeuda, describirPlan, fechaLarga } from '@/lib/deudas'
import { formatoBs, fechaCorta } from '@/lib/esquemaPago'

function DeudasContenido() {
  const { obtenerToken } = useAuth()
  const sp = useSearchParams()
  const alquilerIdInicial = sp.get('alquilerId') || ''

  const [deudas, setDeudas] = useState<any[]>([])
  const [alquileres, setAlquileres] = useState<any[]>([])
  const [propiedades, setPropiedades] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(!!alquilerIdInicial)
  const [filtro, setFiltro] = useState<'activas' | 'todas'>('activas')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Record<string, string>>({})
  // Monto/fecha del próximo cobro, editables por si pagó distinto
  const [montoCobro, setMontoCobro] = useState<Record<string, string>>({})
  const [fechaCobro, setFechaCobro] = useState<Record<string, string>>({})

  const hoy = new Date().toISOString().slice(0, 10)

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const h = { Authorization: `Bearer ${token}` }
    const [d, a, p, u] = await Promise.all(
      ['/api/deudas', '/api/alquileres', '/api/propiedades', '/api/unidades'].map((url) => fetch(url, { headers: h }).then((r) => r.json()))
    )
    setDeudas(d.deudas || [])
    setAlquileres(a.alquileres || [])
    setPropiedades(p.propiedades || [])
    setUnidades(u.unidades || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nombreProp = (id: string) => propiedades.find((p) => p.id === id)?.nombre || ''
  const nombreUni = (id: string) => unidades.find((u) => u.id === id)?.nombre || ''

  const lista = deudas.filter((d) => filtro === 'todas' || d.estado === 'vigente' || d.estado === 'incumplida')

  // Totales de las deudas vigentes / incumplidas
  const totales = useMemo(() => {
    let reconocido = 0, cobrado = 0, saldo = 0, vencido = 0
    for (const d of deudas) {
      if (d.estado === 'anulada') continue
      const r = resumirDeuda(d, hoy)
      reconocido += r.totalCuotas
      cobrado += r.pagado
      if (d.estado !== 'cancelada') {
        saldo += r.saldo
        vencido += r.montoVencido
      }
    }
    return { reconocido, cobrado, saldo, vencido }
  }, [deudas, hoy])

  async function cobrar(deuda: any, numero: number, deshacer = false) {
    const clave = `${deuda.id}-${numero}`
    if (deshacer && !confirm(`¿Anular el cobro de la cuota ${numero}? Se borra el ingreso del flujo de caja.`)) return
    setCobrando(clave)
    try {
      const token = await obtenerToken()
      const res = await fetch(`/api/deudas/${deuda.id}/cobrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          deshacer ? { numero, deshacer: true } : { numero, monto: Number(montoCobro[deuda.id]) || undefined, fecha: fechaCobro[deuda.id] || undefined }
        ),
      })
      const d = await res.json()
      setMensajes((m) => ({
        ...m,
        [deuda.id]: d.error || (deshacer ? '✓ Cobro anulado.' : `✓ Cobrado ${d.texto}. Quedó registrado como ingreso.${d.cancelada ? ' 🎉 Deuda cancelada.' : ''}`),
      }))
      setMontoCobro((m) => ({ ...m, [deuda.id]: '' }))
      if (!d.error) await cargar()
    } finally {
      setCobrando(null)
    }
  }

  async function cambiarEstado(deuda: any, estado: EstadoDeuda) {
    const token = await obtenerToken()
    await fetch(`/api/deudas/${deuda.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ estado }),
    })
    cargar()
  }

  async function borrar(deuda: any) {
    const r = resumirDeuda(deuda)
    if (!confirm(`¿Borrar el plan de pago de ${deuda.deudorNombre}?`)) return
    const conMov = r.cuotasPagadas > 0 && confirm(`Tiene ${r.cuotasPagadas} cuotas cobradas (${formatoBs(r.pagado)}). ¿Borrar también esos ingresos del flujo de caja? (Cancelar = dejarlos)`)
    const token = await obtenerToken()
    await fetch(`/api/deudas/${deuda.id}${conMov ? '?conMovimientos=1' : ''}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  return (
    <PaginaProtegida>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <div className="font-display text-xl font-bold text-ink mb-1">Deudas y planes de pago</div>
          <div className="font-body text-xs text-inksoft">Inquilinos que quedaron debiendo y los acuerdos de pago en cuotas. Cada cuota cobrada entra al flujo de caja.</div>
        </div>
        {!mostrarForm && (
          <button onClick={() => setMostrarForm(true)} className="shrink-0 px-3 py-2 rounded-lg bg-ink text-white font-body text-xs font-semibold">
            + Nuevo plan de pago
          </button>
        )}
      </div>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}

      {!cargando && (
        <>
          {mostrarForm && (
            <FormDeuda
              alquileres={alquileres}
              propiedades={propiedades}
              unidades={unidades}
              alquilerIdInicial={alquilerIdInicial}
              onGuardado={() => { setMostrarForm(false); cargar() }}
              onCancelar={() => setMostrarForm(false)}
            />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            {[
              { t: 'Por cobrar', v: totales.saldo, c: 'bg-ink text-white' },
              { t: 'Vencido sin pagar', v: totales.vencido, c: totales.vencido > 0 ? 'bg-rojosoft text-rojo' : 'bg-panel text-ink' },
              { t: 'Ya recuperado', v: totales.cobrado, c: 'bg-verdesoft text-verde' },
              { t: 'Total en planes', v: totales.reconocido, c: 'bg-panel text-ink' },
            ].map((x) => (
              <div key={x.t} className={`rounded-lg border border-line px-3 py-2.5 ${x.c}`}>
                <div className="font-body text-[10px] uppercase tracking-wide opacity-75">{x.t}</div>
                <div className="font-display text-base font-bold">{formatoBs(x.v)}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="font-body text-sm font-semibold text-ink">Planes de pago</div>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className="px-2.5 py-1.5 rounded-lg border border-line font-body text-xs bg-white">
              <option value="activas">Vigentes e incumplidas</option>
              <option value="todas">Todas (incluye canceladas y anuladas)</option>
            </select>
          </div>

          {lista.length === 0 && <div className="font-body text-sm text-inksoft">No hay deudas para mostrar.</div>}

          {lista.map((d) => {
            const r = resumirDeuda(d, hoy)
            const cuotas = ordenarCuotas(d.cuotas || [])
            const alq = alquileres.find((a) => a.id === d.alquilerId)
            const estado = ESTADOS_DEUDA.find((e) => e.id === d.estado)
            const lugar = [nombreProp(d.propiedadId), nombreUni(d.unidadId)].filter(Boolean).join(' — ')
            return (
              <div key={d.id} className={`border rounded-lg p-4 mb-3 bg-panel ${r.vencidas.length && d.estado === 'vigente' ? 'border-rojo' : 'border-line'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-body text-sm font-semibold text-ink">
                      {d.deudorNombre} {d.deudorCI && <span className="font-normal text-inksoft">— C.I. {d.deudorCI}</span>}
                    </div>
                    <div className="font-body text-[11px] text-inksoft">
                      {lugar ? `🏠 ${lugar}` : 'Sin departamento vinculado'}
                      {alq && ` · alquiler de ${alq.inquilinoNombre} (${alq.fechaInicio}${alq.fechaFin ? ` a ${alq.fechaFin}` : ''}, ${formatoBs(alq.montoMensual)}/mes)`}
                    </div>
                    <div className="font-body text-[11px] text-inksoft">
                      {d.concepto} · acuerdo del {fechaCorta(d.fechaAcuerdo)}{d.lugar ? ` en ${d.lugar}` : ''}{d.acreedorNombre ? ` · acreedor/a: ${d.acreedorNombre}` : ''}
                    </div>
                  </div>
                  <select
                    value={d.estado}
                    onChange={(e) => cambiarEstado(d, e.target.value as EstadoDeuda)}
                    className={`font-body text-[11px] font-semibold border border-line rounded-md px-1.5 py-1 bg-white ${estado?.color || ''}`}
                  >
                    {ESTADOS_DEUDA.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between font-body text-[11px] text-inksoft mb-1">
                    <span>{r.cuotasPagadas} de {r.cantidadCuotas} cuotas · recuperado {formatoBs(r.pagado)}</span>
                    <span>saldo <b className="text-ink">{formatoBs(r.saldo)}</b></span>
                  </div>
                  <div className="h-2 rounded-full bg-panelalt overflow-hidden">
                    <div className="h-full bg-verde" style={{ width: `${r.porcentaje}%` }} />
                  </div>
                  <div className="font-body text-[11px] text-inksoft mt-1">{describirPlan(cuotas)}{d.tasaInteresMensual ? ` · interés pactado ${d.tasaInteresMensual}% mensual` : ''}.</div>
                </div>

                {r.vencidas.length > 0 && d.estado === 'vigente' && (
                  <div className="font-body text-[11px] text-rojo mt-2">
                    ⚠ {r.vencidas.length} {r.vencidas.length === 1 ? 'cuota vencida' : 'cuotas vencidas'} sin pagar: {formatoBs(r.montoVencido)} (la más vieja venció el {fechaCorta(r.vencidas[0].vence)}).
                  </div>
                )}

                {r.proxima && d.estado !== 'anulada' && (
                  <div className="flex items-center gap-2 flex-wrap mt-3 bg-panelalt rounded-lg px-3 py-2">
                    <div className="font-body text-xs text-ink flex-1 min-w-[10rem]">
                      Cuota {r.proxima.numero}: <b>{formatoBs(r.proxima.monto)}</b> · vence {fechaLarga(r.proxima.vence)}
                    </div>
                    <input
                      type="number"
                      placeholder={String(r.proxima.monto)}
                      value={montoCobro[d.id] || ''}
                      onChange={(e) => setMontoCobro((m) => ({ ...m, [d.id]: e.target.value }))}
                      className="w-24 px-2 py-1.5 rounded border border-line font-body text-xs"
                      title="Monto cobrado (si pagó distinto)"
                    />
                    <input
                      type="date"
                      value={fechaCobro[d.id] || hoy}
                      onChange={(e) => setFechaCobro((m) => ({ ...m, [d.id]: e.target.value }))}
                      className="px-2 py-1.5 rounded border border-line font-body text-xs"
                    />
                    <button
                      onClick={() => cobrar(d, r.proxima!.numero)}
                      disabled={cobrando === `${d.id}-${r.proxima.numero}`}
                      className="px-3 py-1.5 rounded-lg bg-verde text-white font-body text-xs font-semibold disabled:opacity-60"
                    >
                      {cobrando === `${d.id}-${r.proxima.numero}` ? 'Registrando...' : '✓ Registrar pago'}
                    </button>
                  </div>
                )}
                {mensajes[d.id] && (
                  <div className={`font-body text-[11px] mt-1.5 ${mensajes[d.id].startsWith('✓') ? 'text-verde' : 'text-rojo'}`}>{mensajes[d.id]}</div>
                )}

                <div className="flex gap-3 mt-3 flex-wrap">
                  <button onClick={() => setAbierta(abierta === d.id ? null : d.id)} className="font-body text-[11px] text-ink underline">
                    {abierta === d.id ? 'Ocultar cuotas' : 'Ver todas las cuotas'}
                  </button>
                  {d.documentoUrl && (
                    <a href={d.documentoUrl} target="_blank" rel="noreferrer" className="font-body text-[11px] text-ink underline">Ver documento firmado</a>
                  )}
                  {(d.deudorTelefono || d.deudorDomicilio) && (
                    <span className="font-body text-[11px] text-inksoft">{[d.deudorTelefono && `📞 ${d.deudorTelefono}`, d.deudorDomicilio && `📍 ${d.deudorDomicilio}`].filter(Boolean).join(' · ')}</span>
                  )}
                  <button onClick={() => borrar(d)} className="font-body text-[11px] text-rojo underline ml-auto">Borrar</button>
                </div>

                {abierta === d.id && (
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full font-body text-[11px]">
                      <thead>
                        <tr className="bg-ink text-white">
                          <th className="text-left px-2 py-1.5">#</th>
                          <th className="text-left px-2 py-1.5">Vence</th>
                          <th className="text-right px-2 py-1.5">Monto</th>
                          <th className="text-left px-2 py-1.5">Estado</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {cuotas.map((c, i) => {
                          const vencida = !c.pagada && c.vence < hoy
                          return (
                            <tr key={c.numero} className={i % 2 ? 'bg-panelalt' : ''}>
                              <td className="px-2 py-1 text-inksoft">{c.numero}</td>
                              <td className="px-2 py-1 text-ink">{fechaCorta(c.vence)}</td>
                              <td className="px-2 py-1 text-right text-ink">{formatoBs(c.monto)}</td>
                              <td className="px-2 py-1">
                                {c.pagada ? (
                                  <span className="text-verde">✓ cobrada {c.pagadaEn ? fechaCorta(c.pagadaEn) : ''}{c.montoPagado && c.montoPagado !== c.monto ? ` (${formatoBs(c.montoPagado)})` : ''}</span>
                                ) : vencida ? (
                                  <span className="text-rojo">vencida</span>
                                ) : (
                                  <span className="text-inksoft">pendiente</span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">
                                {c.pagada ? (
                                  <button onClick={() => cobrar(d, c.numero, true)} className="text-inksoft underline">anular</button>
                                ) : (
                                  <button onClick={() => cobrar(d, c.numero)} disabled={cobrando === `${d.id}-${c.numero}`} className="text-verde underline disabled:opacity-50">
                                    cobrar
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {d.notas && <div className="font-body text-[11px] text-inksoft mt-2">📝 {d.notas}</div>}
              </div>
            )
          })}
        </>
      )}
    </PaginaProtegida>
  )
}

export default function DeudasPage() {
  return (
    <Suspense fallback={<div className="font-body text-sm text-inksoft p-8">Cargando...</div>}>
      <DeudasContenido />
    </Suspense>
  )
}
