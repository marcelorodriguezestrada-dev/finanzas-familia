'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { formatoBs, fechaCorta } from '@/lib/esquemaPago'
import { cuotasPendientes, MORA_DIARIA_ALQUILER } from '@/lib/cobros'

// Registrar el cobro de un alquiler: se elige el alquiler (inquilino,
// inmueble y quién lo administra), el período (las cuotas que tienen
// saldo, según el plan de pago) y el monto ya viene completo. Si el
// inquilino paga menos, se pide la explicación y queda una alerta en el
// Dashboard para tratarlo en reunión familiar.
// Se usa en "Ingresos y gastos", en el Calendario y en Alquileres.
export function RegistrarCobro({
  alquilerIdInicial,
  mesInicial,
  bloquearAlquiler = false,
  onListo,
  onCancelar,
}: {
  alquilerIdInicial?: string
  mesInicial?: string
  bloquearAlquiler?: boolean
  onListo: (mensaje: string) => void
  onCancelar?: () => void
}) {
  const { obtenerToken } = useAuth()
  const hoy = new Date().toISOString().slice(0, 10)
  const [alquileres, setAlquileres] = useState<any[]>([])
  const [propiedades, setPropiedades] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [alquilerId, setAlquilerId] = useState(alquilerIdInicial || '')
  const [movs, setMovs] = useState<any[] | null>(null)
  const [mes, setMes] = useState(mesInicial || '')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [medio, setMedio] = useState('')
  const [explicacion, setExplicacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const token = await obtenerToken()
      const h = { Authorization: `Bearer ${token}` }
      const [a, p, u] = await Promise.all(['/api/alquileres', '/api/propiedades', '/api/unidades'].map((x) => fetch(x, { headers: h }).then((r) => r.json())))
      setAlquileres((a.alquileres || []).filter((x: any) => x.estado === 'activo' || x.id === alquilerIdInicial))
      setPropiedades(p.propiedades || [])
      setUnidades(u.unidades || [])
      setCargando(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cobros ya registrados del alquiler elegido.
  useEffect(() => {
    if (!alquilerId) return setMovs(null)
    setMovs(null)
    ;(async () => {
      const token = await obtenerToken()
      const d = await fetch(`/api/movimientos?alquilerId=${alquilerId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
      setMovs(d.movimientos || [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alquilerId])

  const alquiler = alquileres.find((a) => a.id === alquilerId)
  const lugar = (a: any) => [propiedades.find((p) => p.id === a.propiedadId)?.nombre, unidades.find((u) => u.id === a.unidadId)?.nombre].filter(Boolean).join(' — ')
  const cuotas = useMemo(() => (alquiler && movs ? cuotasPendientes(alquiler, movs, hoy) : []), [alquiler, movs, hoy])
  const cuota = cuotas.find((c) => c.mes === mes)

  // Al cambiar de alquiler o al cargar sus cobros: período = la cuota
  // pedida (si tiene saldo) o la más vieja con saldo; monto = lo que falta.
  useEffect(() => {
    if (!movs) return
    const elegida = cuotas.find((c) => c.mes === (mesInicial || mes)) || cuotas[0]
    setMes(elegida?.mes || '')
    setMonto(elegida ? String(elegida.pendiente) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movs])

  const montoNum = Number(monto) || 0
  const parcial = !!cuota && montoNum > 0 && montoNum < cuota.pendiente - 0.009
  const excede = !!cuota && montoNum > cuota.pendiente + 0.009
  const diasAtraso = cuota && fecha > cuota.vence ? Math.round((Date.parse(fecha) - Date.parse(cuota.vence)) / 86400000) : 0

  async function guardar() {
    setError('')
    if (!alquiler || !cuota) return setError('Elegí el alquiler y el período.')
    if (!(montoNum > 0)) return setError('Poné el monto que pagó.')
    if (excede) return setError(`Para ${cuota.etiqueta.toLowerCase()} faltan ${formatoBs(cuota.pendiente)}. Si pagó de más, registrá el resto en el mes siguiente.`)
    if (parcial && explicacion.trim().length < 5) return setError('Es un pago parcial: escribí la explicación.')
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const d = await fetch('/api/cobrar-alquiler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alquilerId, mes, monto: montoNum, fecha, medio: medio || null, explicacion: parcial ? explicacion : '' }),
      }).then((r) => r.json())
      if (d.error) return setError(d.error)
      onListo(`✓ ${alquiler.inquilinoNombre}: ${d.texto}`)
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar.')
    } finally {
      setGuardando(false)
    }
  }

  const input = 'w-full px-3 py-2.5 rounded-lg border border-line font-body text-sm text-ink bg-white'
  const et = 'font-body text-[11px] text-inksoft block mb-1'

  if (cargando) return <div className="font-body text-sm text-inksoft py-2">Cargando alquileres...</div>
  if (!alquileres.length) return <div className="font-body text-sm text-inksoft py-2">No hay alquileres activos. Cargalos en Alquileres.</div>

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className={et}>Alquiler</label>
        <select value={alquilerId} disabled={bloquearAlquiler} onChange={(e) => { setAlquilerId(e.target.value); setError('') }} className={input}>
          {!alquilerId && <option value="">— Elegí el inquilino / inmueble —</option>}
          {alquileres.map((a) => (
            <option key={a.id} value={a.id}>
              {a.inquilinoNombre} — {lugar(a) || 'sin inmueble'}
              {a.administradorNombre ? ` · administra ${a.administradorNombre}` : ''}
            </option>
          ))}
        </select>
        {alquiler && (
          <div className="font-body text-[11px] text-inksoft mt-1">
            🏠 {lugar(alquiler)} · Administra: <b className="text-ink">{alquiler.administradorNombre || '—'}</b> · paga del 1 al {alquiler.diaCobro}
          </div>
        )}
      </div>

      {alquiler && !movs && <div className="font-body text-xs text-inksoft">Buscando lo que debe...</div>}
      {alquiler && movs && cuotas.length === 0 && <div className="font-body text-xs text-verde">✓ {alquiler.inquilinoNombre} no debe nada hasta el mes que viene.</div>}

      {alquiler && movs && cuotas.length > 0 && (
        <>
          <div>
            <label className={et}>Período que paga</label>
            <select
              value={mes}
              onChange={(e) => {
                setMes(e.target.value)
                const c = cuotas.find((x) => x.mes === e.target.value)
                setMonto(c ? String(c.pendiente) : '')
              }}
              className={input}
            >
              {cuotas.map((c) => (
                <option key={c.mes} value={c.mes}>
                  {c.etiqueta}
                  {c.tipo !== 'completa' ? ` (proporcional ${c.dias} días)` : ''} — {c.estado === 'parcial' ? `falta ${formatoBs(c.pendiente)} de ${formatoBs(c.monto)}` : formatoBs(c.monto)}
                  {c.vencida ? ` · vencida hace ${c.diasAtraso} días` : ` · vence ${fechaCorta(c.vence)}`}
                </option>
              ))}
            </select>
            {cuotas.filter((c) => c.vencida).length > 1 && (
              <div className="font-body text-[11px] text-rojo mt-1">
                Debe {cuotas.filter((c) => c.vencida).length} meses vencidos: {formatoBs(cuotas.filter((c) => c.vencida).reduce((s, c) => s + c.pendiente, 0))} en total. Registrá cada mes por separado, del más viejo al más nuevo.
              </div>
            )}
          </div>

          {cuota && cuota.pagos.length > 0 && (
            <div className="font-body text-[11px] text-inksoft bg-panelalt rounded-lg px-3 py-2">
              Ya pagó {formatoBs(cuota.pagado)} de este mes:{' '}
              {cuota.pagos.map((p: any) => `${formatoBs(Number(p.monto))} el ${fechaCorta(p.fecha)}`).join(', ')}.
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className={et}>Monto que pagó</label>
              <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} className={`${input} ${parcial ? 'border-ocre' : ''} ${excede ? 'border-rojo' : ''}`} />
              {cuota && (
                <button type="button" onClick={() => setMonto(String(cuota.pendiente))} className="font-body text-[11px] text-ink underline mt-1">
                  Pagó todo ({formatoBs(cuota.pendiente)})
                </button>
              )}
            </div>
            <div>
              <label className={et}>Fecha en que pagó</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} />
            </div>
            <div>
              <label className={et}>Cómo pagó (opcional)</label>
              <select value={medio} onChange={(e) => setMedio(e.target.value)} className={input}>
                <option value="">—</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="qr">QR</option>
              </select>
            </div>
          </div>

          {diasAtraso > 0 && (
            <div className="font-body text-[11px] text-[#6A5011]">
              Pagó {diasAtraso} días después del vencimiento ({fechaCorta(cuota!.vence)}). Según el contrato correspondería un recargo de {formatoBs(diasAtraso * MORA_DIARIA_ALQUILER)} (Bs {MORA_DIARIA_ALQUILER} por día); si lo cobró, cargalo aparte como ingreso.
            </div>
          )}

          {parcial && cuota && (
            <div className="border border-ocre bg-ocresoft rounded-lg p-3">
              <div className="font-body text-sm font-semibold text-[#6A5011]">Pago parcial: faltan {formatoBs(cuota.pendiente - montoNum)}</div>
              <label className="font-body text-[11px] text-[#6A5011] block mt-2 mb-1">¿Por qué no pagó el total? ¿Cuándo dice que completa? (obligatorio)</label>
              <textarea
                value={explicacion}
                onChange={(e) => setExplicacion(e.target.value)}
                rows={3}
                placeholder="Ej: dice que le pagan el 15 y completa el resto ese día."
                className="w-full px-3 py-2 rounded-lg border border-ocre font-body text-sm text-ink bg-white"
              />
              <div className="font-body text-[11px] text-[#6A5011] mt-1">Se va a generar una alerta en el Dashboard para tratarlo en una reunión familiar y decidir qué medidas tomar.</div>
            </div>
          )}

          {error && <div className="font-body text-xs text-rojo">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={guardar} disabled={guardando} className={`flex-1 min-h-[44px] rounded-lg text-white font-body text-sm font-semibold disabled:opacity-60 ${parcial ? 'bg-[#8A5A0B]' : 'bg-verde'}`}>
              {guardando ? 'Registrando...' : parcial ? `Registrar pago parcial de ${formatoBs(montoNum)}` : `✓ Registrar cobro${montoNum ? ` de ${formatoBs(montoNum)}` : ''}`}
            </button>
            {onCancelar && (
              <button type="button" onClick={onCancelar} className="px-4 min-h-[44px] rounded-lg border border-line bg-white font-body text-sm text-ink">
                Cancelar
              </button>
            )}
          </div>
        </>
      )}
      {error && !(alquiler && movs && cuotas.length > 0) && <div className="font-body text-xs text-rojo">{error}</div>}
    </div>
  )
}
