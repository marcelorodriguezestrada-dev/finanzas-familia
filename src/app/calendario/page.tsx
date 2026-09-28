'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { cuotaDelMes, formatoBs } from '@/lib/esquemaPago'
import { ordenarCuotas } from '@/lib/deudas'

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
  const [cargando, setCargando] = useState(true)

  const hoy = new Date().toISOString().slice(0, 10)
  const mesActual = hoy.slice(0, 7)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const token = await obtenerToken()
      const headers = { Authorization: `Bearer ${token}` }
      const [resAlq, resUni, resProp, resMov, resRep, resDeu] = await Promise.all([
        fetch('/api/alquileres?estado=activo', { headers }),
        fetch('/api/unidades', { headers }),
        fetch('/api/propiedades', { headers }),
        fetch(`/api/movimientos?mes=${mesActual}`, { headers }),
        fetch('/api/reparaciones?resuelta=false', { headers }),
        fetch('/api/deudas', { headers }),
      ])
      const [dataAlq, dataUni, dataProp, dataMov, dataRep, dataDeu] = await Promise.all([
        resAlq.json(), resUni.json(), resProp.json(), resMov.json(), resRep.json(), resDeu.json(),
      ])
      setDeudas(dataDeu.deudas || [])
      setAlquileres(dataAlq.alquileres || [])
      setUnidades(dataUni.unidades || [])
      setPropiedades(dataProp.propiedades || [])
      setMovimientosMes(dataMov.movimientos || [])
      setReparacionesPendientes(dataRep.reparaciones || [])
      setCargando(false)
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nombreUnidad = (id: string) => unidades.find((u) => u.id === id)?.nombre || '—'
  const nombrePropiedad = (id: string) => propiedades.find((p) => p.id === id)?.nombre || '—'

  // Alquileres cuyo alquiler de este mes todavía no aparece como
  // movimiento cobrado y ya pasó (o está por pasar) su día de cobro —
  // es la "mora" del punto 4: quién todavía no pagó este mes.
  // El monto y el vencimiento salen del plan de pago de cada alquiler
  // (canon escalonado, proporcional del primer mes que vence a la
  // firma, etc.). Si según el contrato no hay cuota este mes, no entra.
  const conCuota = useMemo(
    () =>
      alquileres
        .map((a) => ({ ...a, cuota: cuotaDelMes(a, mesActual) }))
        .filter((a) => a.cuota && !movimientosMes.some((m) => m.alquilerId === a.id)),
    [alquileres, movimientosMes, mesActual]
  )

  const enMora = useMemo(() => {
    // Pasado el día límite de pago (el contrato dice "dentro de los
    // primeros N días"), ya está en mora.
    return conCuota.filter((a) => hoy > a.cuota!.vence)
  }, [conCuota, hoy])

  // Próximos días de cobro de este mes que todavía no llegaron.
  const proximosCobros = useMemo(() => {
    return conCuota
      .filter((a) => {
        const dias = diasEntre(hoy, a.cuota!.vence)
        return dias >= 0 && dias <= 7
      })
      .sort((a, b) => a.cuota!.vence.localeCompare(b.cuota!.vence))
  }, [conCuota, hoy])

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

  // Contratos que vencen en los próximos 60 días, o ya vencidos.
  const vencimientos = useMemo(() => {
    return alquileres
      .filter((a) => a.fechaFin)
      .map((a) => ({ ...a, dias: diasEntre(hoy, a.fechaFin) }))
      .filter((a) => a.dias <= 60)
      .sort((a, b) => a.dias - b.dias)
  }, [alquileres, hoy])

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Calendario y alertas</div>
      <div className="font-body text-xs text-inksoft mb-6">Cobros pendientes, moras, vencimientos de contrato y reparaciones sin resolver.</div>

      {cargando ? (
        <div className="font-body text-sm text-inksoft">Cargando...</div>
      ) : (
        <>
          <div className="font-body text-sm font-semibold text-rojo mb-3">
            En mora este mes {enMora.length > 0 && `(${enMora.length})`}
          </div>
          {enMora.length === 0 && <div className="font-body text-xs text-inksoft mb-6">Nadie está en mora este mes. 🎉</div>}
          {enMora.map((a) => (
            <div key={a.id} className="bg-rojosoft border border-rojo rounded-lg p-3 mb-2">
              <div className="font-body text-xs font-semibold text-ink">{a.inquilinoNombre}</div>
              <div className="font-body text-[11px] text-inksoft">
                {nombrePropiedad(a.propiedadId)} — {nombreUnidad(a.unidadId)} · {formatoBs(a.cuota!.monto)}{a.cuota!.tipo !== 'completa' ? ` (proporcional ${a.cuota!.dias} días)` : ''} · vencía el {a.cuota!.vence.slice(8, 10)}/{a.cuota!.vence.slice(5, 7)}
              </div>
            </div>
          ))}

          <div className="font-body text-sm font-semibold text-ink mb-3 mt-8">Próximos cobros (7 días)</div>
          {proximosCobros.length === 0 && <div className="font-body text-xs text-inksoft mb-6">No hay cobros próximos a vencer.</div>}
          {proximosCobros.map((a) => (
            <div key={a.id} className="border border-line rounded-lg p-3 mb-2">
              <div className="font-body text-xs font-semibold text-ink">{a.inquilinoNombre}</div>
              <div className="font-body text-[11px] text-inksoft">
                {nombrePropiedad(a.propiedadId)} — {nombreUnidad(a.unidadId)} · {formatoBs(a.cuota!.monto)} · vence el {a.cuota!.vence.slice(8, 10)}/{a.cuota!.vence.slice(5, 7)}
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
