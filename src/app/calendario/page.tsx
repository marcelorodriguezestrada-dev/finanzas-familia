'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { cuotaDelMes, formatoBs } from '@/lib/esquemaPago'
import { ordenarCuotas } from '@/lib/deudas'
import { vencimientoVigente } from '@/lib/pendientes'
import { estadoCuotas } from '@/lib/cobros'
import { RegistrarCobro } from '@/components/RegistrarCobro'

function diasEntre(hoyISO: string, fechaISO: string) {
  const hoy = new Date(hoyISO)
  const fecha = new Date(fechaISO)
  return Math.round((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export default function CalendarioPage() {
  const { obtenerToken } = useAuth()
  const [alquileres, setAlquileres] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [propiedades, setPropiedades] = useState<any[]>([])
  const [movimientosMes, setMovimientosMes] = useState<any[]>([])
  const [reparacionesPendientes, setReparacionesPendientes] = useState<any[]>([])
  const [deudas, setDeudas] = useState<any[]>([])
  const [pendientes, setPendientes] = useState<any[]>([])
  const [alertas, setAlertas] = useState<any[]>([])
  // Formulario de cobro abierto: clave "alquilerId|mes"
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [recarga, setRecarga] = useState(0)
  const [cargando, setCargando] = useState(true)

  const hoy = new Date().toISOString().slice(0, 10)
  const mesActual = hoy.slice(0, 7)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const token = await obtenerToken()
      const headers = { Authorization: `Bearer ${token}` }
      const [resAlq, resUni, resProp, resMov, resRep, resDeu, resPen, resAle] = await Promise.all([
        fetch('/api/alquileres?estado=activo', { headers }),
        fetch('/api/unidades', { headers }),
        fetch('/api/propiedades', { headers }),
        fetch('/api/movimientos', { headers }),
        fetch('/api/reparaciones?resuelta=false', { headers }),
        fetch('/api/deudas', { headers }),
        fetch('/api/pendientes', { headers }),
        fetch('/api/alertas', { headers }),
      ])
      const [dataAlq, dataUni, dataProp, dataMov, dataRep, dataDeu, dataPen, dataAle] = await Promise.all([
        resAlq.json(), resUni.json(), resProp.json(), resMov.json(), resRep.json(), resDeu.json(), resPen.json(), resAle.json(),
      ])
      setAlertas(dataAle.alertas || [])
      setDeudas(dataDeu.deudas || [])
      setPendientes(dataPen.pendientes || [])
      setAlquileres(dataAlq.alquileres || [])
      setUnidades(dataUni.unidades || [])
      setPropiedades(dataProp.propiedades || [])
      setMovimientosMes(dataMov.movimientos || [])
      setReparacionesPendientes(dataRep.reparaciones || [])
      setCargando(false)
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga])

  const nombreUnidad = (id: string) => unidades.find((u) => u.id === id)?.nombre || '—'
  const nombrePropiedad = (id: string) => propiedades.find((p) => p.id === id)?.nombre || '—'

  // Alquileres cuyo alquiler de este mes todavía no aparece como
  // movimiento cobrado y ya pasó (o está por pasar) su día de cobro —
  // es la "mora" del punto 4: quién todavía no pagó este mes.
  // El monto y el vencimiento salen del plan de pago de cada alquiler
  // (canon escalonado, proporcional del primer mes que vence a la
  // firma, etc.). Si según el contrato no hay cuota este mes, no entra.
  // Cuotas de cada alquiler activo con saldo (incluye pagos parciales y
  // meses anteriores que quedaron debiendo). movimientosMes trae TODOS
  // los movimientos: el mes de cada cobro sale de mesCuota.
  const cuotasConSaldo = useMemo(
    () =>
      alquileres.flatMap((a) =>
        estadoCuotas(a, movimientosMes, { hasta: mesActual, hoy })
          .filter((c) => c.pendiente > 0.009)
          .map((c) => ({ a, c }))
      ),
    [alquileres, movimientosMes, mesActual, hoy]
  )

  // En mora: cuotas vencidas con saldo (la más vieja primero).
  const enMora = useMemo(() => cuotasConSaldo.filter((x) => x.c.vencida).sort((x, y) => x.c.vence.localeCompare(y.c.vence)), [cuotasConSaldo])

  // Cobros que vencen en los próximos 7 días.
  const proximosCobros = useMemo(() => {
    const prox = alquileres.flatMap((a) => {
      const [y, m] = mesActual.split('-').map(Number)
      const sig = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`
      return estadoCuotas(a, movimientosMes, { hasta: sig, hoy })
        .filter((c) => c.pendiente > 0.009 && !c.vencida)
        .filter((c) => {
          const dias = diasEntre(hoy, c.vence)
          return dias >= 0 && dias <= 7
        })
        .map((c) => ({ a, c }))
    })
    return prox.sort((x, y) => x.c.vence.localeCompare(y.c.vence))
  }, [alquileres, movimientosMes, mesActual, hoy])

  // Cuotas de planes de pago de deudas: vencidas sin pagar y las que
  // vencen en los próximos 7 días.
  const cuotasDeuda = useMemo(() => {
    const filas: { deuda: any; numero: number; total: number; monto: number; vence: string; dias: number }[] = []
    for (const d of deudas) {
      if (d.estado !== 'vigente') continue
      const cs = ordenarCuotas(d.cuotas || [])
      for (const c of cs) {
        if (c.pagada) continue
        const dias = diasEntre(hoy, c.vence)
        if (dias <= 7) filas.push({ deuda: d, numero: c.numero, total: cs.length, monto: c.monto, vence: c.vence, dias })
      }
    }
    return filas.sort((a, b) => a.vence.localeCompare(b.vence))
  }, [deudas, hoy])

  // Gastos por pagar (expensas, servicios...): lo vencido y lo que vence
  // en los próximos 7 días, con el monto que corresponde a hoy.
  const gastosPorPagar = useMemo(() => {
    return pendientes
      .filter((p) => p.estado === 'pendiente')
      .map((p) => ({ p, v: vencimientoVigente(p, hoy)! }))
      .filter((x) => x.v && (x.v.vencidoTodo || x.v.diasParaVencer <= 7))
      .sort((a, b) => a.v.vencimiento.fecha.localeCompare(b.v.vencimiento.fecha))
  }, [pendientes, hoy])

  // Contratos que vencen en los próximos 60 días, o ya vencidos.
  const vencimientos = useMemo(() => {
    return alquileres
      .filter((a) => a.fechaFin)
      .map((a) => ({ ...a, dias: diasEntre(hoy, a.fechaFin) }))
      .filter((a) => a.dias <= 60)
      .sort((a, b) => a.dias - b.dias)
  }, [alquileres, hoy])

  // Función común (no componente) para no remontar el formulario abierto.
  function filaCobro(a: any, c: any, rojo = false) {
    const clave = `${a.id}|${c.mes}`
    return (
      <div key={clave} className={`${rojo ? 'bg-rojosoft border-rojo' : 'border-line'} border rounded-lg p-3 mb-2`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-body text-xs font-semibold text-ink">{a.inquilinoNombre}</div>
            <div className="font-body text-[11px] text-inksoft">
              {nombrePropiedad(a.propiedadId)} — {nombreUnidad(a.unidadId)} · {c.etiqueta}
              {c.tipo !== 'completa' ? ` (proporcional ${c.dias} días)` : ''} ·{' '}
              {c.estado === 'parcial' ? <b className="text-[#8A5A0B]">pagó {formatoBs(c.pagado)}, faltan {formatoBs(c.pendiente)}</b> : formatoBs(c.pendiente)} ·{' '}
              {c.vencida ? <span className="text-rojo font-semibold">venció hace {c.diasAtraso} días</span> : `vence el ${c.vence.slice(8, 10)}/${c.vence.slice(5, 7)}`}
              {a.administradorNombre ? ` · administra ${a.administradorNombre}` : ''}
            </div>
          </div>
          <button
            onClick={() => { setCobrando(cobrando === clave ? null : clave); setMensaje('') }}
            className="shrink-0 min-h-[36px] px-3 rounded-lg bg-verde text-white font-body text-[11px] font-semibold"
          >
            {cobrando === clave ? 'Cerrar' : 'Registrar pago'}
          </button>
        </div>
        {cobrando === clave && (
          <div className="mt-3 bg-white rounded-lg p-3 border border-line">
            <RegistrarCobro
              alquilerIdInicial={a.id}
              mesInicial={c.mes}
              bloquearAlquiler
              onCancelar={() => setCobrando(null)}
              onListo={(msg) => {
                setCobrando(null)
                setMensaje(msg)
                setRecarga((r) => r + 1)
              }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Calendario y alertas</div>
      <div className="font-body text-xs text-inksoft mb-6">Cobros pendientes, moras, vencimientos de contrato y reparaciones sin resolver.</div>

      {cargando ? (
        <div className="font-body text-sm text-inksoft">Cargando...</div>
      ) : (
        <>
          {mensaje && <div className={`font-body text-xs mb-4 ${mensaje.startsWith('✓') ? 'text-verde' : 'text-rojo'}`}>{mensaje}</div>}
          <div className="font-body text-sm font-semibold text-rojo mb-3">
            Alquileres atrasados {enMora.length > 0 && `(${enMora.length})`}
          </div>
          {enMora.length === 0 && <div className="font-body text-xs text-inksoft mb-6">Nadie está atrasado. 🎉</div>}
          {enMora.map(({ a, c }) => filaCobro(a, c, true))}

          <div className="font-body text-sm font-semibold text-ink mb-3 mt-8">Próximos cobros (7 días)</div>
          {proximosCobros.length === 0 && <div className="font-body text-xs text-inksoft mb-6">No hay cobros próximos a vencer.</div>}
          {proximosCobros.map(({ a, c }) => filaCobro(a, c))}

          {alertas.length > 0 && (
            <>
              <div className="font-body text-sm font-semibold text-[#8A5A0B] mb-3 mt-8">
                Pagos parciales para tratar en reunión familiar ({alertas.length}) <a href="/dashboard" className="font-normal text-[11px] text-inksoft underline">ver en el Dashboard</a>
              </div>
              {alertas.map((al) => (
                <div key={al.id} className="bg-ocresoft border border-ocre rounded-lg p-3 mb-2">
                  <div className="font-body text-xs font-semibold text-ink">{al.inquilinoNombre} · {al.etiquetaMes}</div>
                  <div className="font-body text-[11px] text-inksoft">
                    {al.lugar} · pagó {formatoBs(al.pagado)} de {formatoBs(al.esperado)} · <b className="text-rojo">faltan {formatoBs(al.faltante)}</b>
                    {al.estado === 'reunion' && al.fechaReunion ? ` · reunión: ${al.fechaReunion.slice(8, 10)}/${al.fechaReunion.slice(5, 7)}` : ''}
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="font-body text-sm font-semibold text-ink mb-3 mt-8">
            Gastos por pagar (vencidos y próximos 7 días) <a href="/pendientes" className="font-normal text-[11px] text-inksoft underline">ver todos</a>
          </div>
          {gastosPorPagar.length === 0 && <div className="font-body text-xs text-inksoft mb-6">No hay expensas ni servicios por vencer esta semana.</div>}
          {gastosPorPagar.map(({ p, v }) => (
            <div key={p.id} className={`border rounded-lg p-3 mb-2 ${v.vencidoTodo || v.vencimiento.numero > 1 ? 'bg-rojosoft border-rojo' : 'border-line'}`}>
              <div className="font-body text-xs font-semibold text-ink">{p.titulo}</div>
              <div className="font-body text-[11px] text-inksoft">
                {p.proveedor ? `${p.proveedor} · ` : ''}{formatoBs(v.vencimiento.monto)} ·{' '}
                {v.vencidoTodo ? (
                  <span className="text-rojo font-semibold">venció hace {Math.abs(v.diasParaVencer)} días</span>
                ) : (
                  <>
                    {v.vencimiento.numero}.º vencimiento {v.diasParaVencer === 0 ? 'hoy' : `en ${v.diasParaVencer} días`}
                    {v.ahorroSiPagaHoy > 0 ? ` · pagando antes te ahorrás ${formatoBs(v.ahorroSiPagaHoy)}` : ''}
                  </>
                )}
              </div>
            </div>
          ))}

          <div className="font-body text-sm font-semibold text-ink mb-3 mt-8">
            Cuotas de deudas (vencidas y próximos 7 días) <a href="/deudas" className="font-normal text-[11px] text-inksoft underline">ver deudas</a>
          </div>
          {cuotasDeuda.length === 0 && <div className="font-body text-xs text-inksoft mb-6">No hay cuotas de deudas vencidas ni por vencer esta semana.</div>}
          {cuotasDeuda.map((c) => (
            <div key={`${c.deuda.id}-${c.numero}`} className={`border rounded-lg p-3 mb-2 ${c.dias < 0 ? 'bg-rojosoft border-rojo' : 'border-line'}`}>
              <div className="font-body text-xs font-semibold text-ink">{c.deuda.deudorNombre} · cuota {c.numero}/{c.total}</div>
              <div className="font-body text-[11px] text-inksoft">
                {[nombrePropiedad(c.deuda.propiedadId), nombreUnidad(c.deuda.unidadId)].filter((x) => x && x !== '—').join(' — ') || 'Sin departamento'} · {formatoBs(c.monto)} ·{' '}
                {c.dias < 0 ? <span className="text-rojo font-semibold">vencida hace {Math.abs(c.dias)} días</span> : c.dias === 0 ? 'vence hoy' : `vence en ${c.dias} días`}
              </div>
            </div>
          ))}

          <div className="font-body text-sm font-semibold text-ink mb-3 mt-8">Vencimientos de contrato próximos</div>
          {vencimientos.length === 0 && <div className="font-body text-xs text-inksoft mb-6">No hay contratos por vencer en los próximos 60 días.</div>}
          {vencimientos.map((a) => (
            <div key={a.id} className={`border rounded-lg p-3 mb-2 ${a.dias < 0 ? 'bg-rojosoft border-rojo' : a.dias <= 15 ? 'bg-amber-50 border-amber-300' : 'border-line'}`}>
              <div className="font-body text-xs font-semibold text-ink">{a.inquilinoNombre}</div>
              <div className="font-body text-[11px] text-inksoft">
                {nombrePropiedad(a.propiedadId)} — {nombreUnidad(a.unidadId)} · vence el {a.fechaFin}
                {' · '}
                {a.dias < 0 ? <span className="text-rojo font-semibold">vencido hace {Math.abs(a.dias)} días</span> : `en ${a.dias} días`}
              </div>
            </div>
          ))}

          <div className="font-body text-sm font-semibold text-ink mb-3 mt-8">Reparaciones pendientes (notas de inquilinos y familia)</div>
          {reparacionesPendientes.length === 0 && <div className="font-body text-xs text-inksoft">No hay reparaciones pendientes.</div>}
          {reparacionesPendientes.map((r) => (
            <div key={r.id} className="border border-line rounded-lg p-3 mb-2">
              <div className="font-body text-xs text-ink">{r.detalle}</div>
              <div className="font-body text-[10px] text-inksoft mt-0.5">
                {nombrePropiedad(r.propiedadId)}{r.unidadId ? ` — ${nombreUnidad(r.unidadId)}` : ''}
                {r.solicitadoPor && ` · Pidió: ${r.solicitadoPor}`}
                {' · '}Prioridad {r.prioridad}
              </div>
            </div>
          ))}
        </>
      )}
    </PaginaProtegida>
  )
}
