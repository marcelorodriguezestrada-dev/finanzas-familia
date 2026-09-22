'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

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
  const [cargando, setCargando] = useState(true)

  const hoy = new Date().toISOString().slice(0, 10)
  const mesActual = hoy.slice(0, 7)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const token = await obtenerToken()
      const headers = { Authorization: `Bearer ${token}` }
      const [resAlq, resUni, resProp, resMov, resRep] = await Promise.all([
        fetch('/api/alquileres?estado=activo', { headers }),
        fetch('/api/unidades', { headers }),
        fetch('/api/propiedades', { headers }),
        fetch(`/api/movimientos?mes=${mesActual}`, { headers }),
        fetch('/api/reparaciones?resuelta=false', { headers }),
      ])
      const [dataAlq, dataUni, dataProp, dataMov, dataRep] = await Promise.all([
        resAlq.json(), resUni.json(), resProp.json(), resMov.json(), resRep.json(),
      ])
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
  const enMora = useMemo(() => {
    return alquileres.filter((a) => {
      const yaCobrado = movimientosMes.some((m) => m.alquilerId === a.id)
      if (yaCobrado) return false
      const diaHoy = Number(hoy.slice(8, 10))
      return diaHoy >= a.diaCobro
    })
  }, [alquileres, movimientosMes, hoy])

  // Próximos días de cobro de este mes que todavía no llegaron.
  const proximosCobros = useMemo(() => {
    return alquileres
      .filter((a) => {
        const yaCobrado = movimientosMes.some((m) => m.alquilerId === a.id)
        if (yaCobrado) return false
        const diaHoy = Number(hoy.slice(8, 10))
        return a.diaCobro > diaHoy && a.diaCobro <= diaHoy + 7
      })
      .sort((a, b) => a.diaCobro - b.diaCobro)
  }, [alquileres, movimientosMes, hoy])

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
                {nombrePropiedad(a.propiedadId)} — {nombreUnidad(a.unidadId)} · {bs(a.montoMensual)} · vencía el día {a.diaCobro}
              </div>
            </div>
          ))}

          <div className="font-body text-sm font-semibold text-ink mb-3 mt-8">Próximos cobros (7 días)</div>
          {proximosCobros.length === 0 && <div className="font-body text-xs text-inksoft mb-6">No hay cobros próximos a vencer.</div>}
          {proximosCobros.map((a) => (
            <div key={a.id} className="border border-line rounded-lg p-3 mb-2">
              <div className="font-body text-xs font-semibold text-ink">{a.inquilinoNombre}</div>
              <div className="font-body text-[11px] text-inksoft">
                {nombrePropiedad(a.propiedadId)} — {nombreUnidad(a.unidadId)} · {bs(a.montoMensual)} · día {a.diaCobro}
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
