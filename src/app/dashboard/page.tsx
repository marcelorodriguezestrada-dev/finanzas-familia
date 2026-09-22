'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from 'recharts'

function bs(n: number) {
  const signo = n < 0 ? '-' : ''
  return `${signo}Bs ${Math.abs(Math.round(n)).toLocaleString('es-BO')}`
}

export default function DashboardPage() {
  const { obtenerToken } = useAuth()
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [propiedades, setPropiedades] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const token = await obtenerToken()
      const headers = { Authorization: `Bearer ${token}` }
      const [resMov, resProp] = await Promise.all([
        fetch('/api/movimientos', { headers }),
        fetch('/api/propiedades', { headers }),
      ])
      const dataMov = await resMov.json()
      const dataProp = await resProp.json()
      setMovimientos(dataMov.movimientos || [])
      setPropiedades(dataProp.propiedades || [])
      setCargando(false)
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nombrePropiedad = (id: string | null) => propiedades.find((p) => p.id === id)?.nombre || 'Sin propiedad'

  // Serie mensual de ingresos/gastos y saldo acumulado (el "fondo de
  // inversión" es justamente ese acumulado: lo que sobra mes a mes
  // después de gastos, disponible para reinvertir).
  const serieMensual = useMemo(() => {
    const porMes = new Map<string, { ingresos: number; gastos: number }>()
    for (const m of movimientos) {
      const clave = (m.fecha || '').slice(0, 7)
      if (!clave) continue
      const actual = porMes.get(clave) || { ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') actual.ingresos += m.monto
      else actual.gastos += m.monto
      porMes.set(clave, actual)
    }
    const meses = [...porMes.keys()].sort()
    let acumulado = 0
    return meses.map((mes) => {
      const { ingresos, gastos } = porMes.get(mes)!
      acumulado += ingresos - gastos
      return { mes, ingresos, gastos, balance: ingresos - gastos, acumulado }
    })
  }, [movimientos])

  const fondoInversion = serieMensual.length ? serieMensual[serieMensual.length - 1].acumulado : 0

  // Balance por propiedad — junta ingresos de alquiler y gastos de
  // mantenimiento asociados a cada casa, para ver qué inmueble rinde
  // más y cuál está "comiéndose" la plata en arreglos.
  const balancePorPropiedad = useMemo(() => {
    const mapa = new Map<string, { nombre: string; ingresos: number; gastos: number }>()
    for (const m of movimientos) {
      if (!m.propiedadId) continue
      const actual = mapa.get(m.propiedadId) || { nombre: nombrePropiedad(m.propiedadId), ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') actual.ingresos += m.monto
      else actual.gastos += m.monto
      mapa.set(m.propiedadId, actual)
    }
    return [...mapa.values()]
      .map((p) => ({ ...p, neto: p.ingresos - p.gastos }))
      .sort((a, b) => b.neto - a.neto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientos, propiedades])

  // Balance por usuario — cada quien cobra y gasta a su nombre; es lo
  // que le sirve a la hermana para ver, por ejemplo, cuánto le quedó
  // limpio del consultorio después de descontar sus arreglos.
  const balancePorUsuario = useMemo(() => {
    const mapa = new Map<string, { nombre: string; ingresos: number; gastos: number }>()
    for (const m of movimientos) {
      const clave = m.registradoPorNombre || 'Sin asignar'
      const actual = mapa.get(clave) || { nombre: clave, ingresos: 0, gastos: 0 }
      if (m.tipo === 'ingreso') actual.ingresos += m.monto
      else actual.gastos += m.monto
      mapa.set(clave, actual)
    }
    return [...mapa.values()].map((u) => ({ ...u, neto: u.ingresos - u.gastos })).sort((a, b) => b.neto - a.neto)
  }, [movimientos])

  const gastosMantenimiento = movimientos
    .filter((m) => m.tipo === 'gasto' && m.categoria === 'Mantenimiento de propiedades')
    .reduce((s, m) => s + m.monto, 0)

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Dashboard</div>
      <div className="font-body text-xs text-inksoft mb-6">Liquidez, rendimiento por propiedad y por persona.</div>

      {cargando ? (
        <div className="font-body text-sm text-inksoft">Cargando...</div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-8">
            <div className="bg-verdesoft border border-verde rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Fondo de inversión disponible</div>
              <div className="font-display text-xl font-bold text-verde">{bs(fondoInversion)}</div>
              <div className="font-body text-[10px] text-inksoft mt-1">Acumulado histórico de ingresos menos gastos</div>
            </div>
            <div className="bg-panel border border-line rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Gastado en mantenimiento (histórico)</div>
              <div className="font-display text-xl font-bold text-ink">{bs(gastosMantenimiento)}</div>
            </div>
            <div className="bg-panel border border-line rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Propiedades con movimientos</div>
              <div className="font-display text-xl font-bold text-ink">{balancePorPropiedad.length}</div>
            </div>
          </div>

          <div className="font-body text-sm font-semibold text-ink mb-3">Evolución de la liquidez acumulada</div>
          <div className="bg-panel border border-line rounded-xl p-4 mb-8" style={{ height: 260 }}>
            {serieMensual.length === 0 ? (
              <div className="font-body text-xs text-inksoft">Todavía no hay suficientes movimientos para graficar.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieMensual} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d8" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => bs(v)} />
                  <Tooltip formatter={(v: number) => bs(v)} />
                  <Line type="monotone" dataKey="acumulado" name="Fondo acumulado" stroke="#2f6f4f" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="font-body text-sm font-semibold text-ink mb-3">Ingresos vs gastos por mes</div>
          <div className="bg-panel border border-line rounded-xl p-4 mb-8" style={{ height: 260 }}>
            {serieMensual.length === 0 ? (
              <div className="font-body text-xs text-inksoft">Sin datos todavía.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieMensual} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e1d8" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => bs(v)} />
                  <Tooltip formatter={(v: number) => bs(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill="#2f6f4f" />
                  <Bar dataKey="gastos" name="Gastos" fill="#b3492f" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <div className="font-body text-sm font-semibold text-ink mb-3">Balance por propiedad</div>
              {balancePorPropiedad.length === 0 && <div className="font-body text-xs text-inksoft">Sin movimientos asociados a propiedades.</div>}
              {balancePorPropiedad.map((p) => (
                <div key={p.nombre} className="py-2 border-b border-line">
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-ink">{p.nombre}</span>
                    <span className={`font-body text-xs font-semibold ${p.neto >= 0 ? 'text-verde' : 'text-rojo'}`}>{bs(p.neto)}</span>
                  </div>
                  <div className="font-body text-[10px] text-inksoft">Ingresos {bs(p.ingresos)} · Gastos {bs(p.gastos)}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="font-body text-sm font-semibold text-ink mb-3">Balance por persona</div>
              {balancePorUsuario.length === 0 && <div className="font-body text-xs text-inksoft">Sin movimientos cargados.</div>}
              {balancePorUsuario.map((u) => (
                <div key={u.nombre} className="py-2 border-b border-line">
                  <div className="flex items-center justify-between">
                    <span className="font-body text-xs text-ink">{u.nombre}</span>
                    <span className={`font-body text-xs font-semibold ${u.neto >= 0 ? 'text-verde' : 'text-rojo'}`}>{bs(u.neto)}</span>
                  </div>
                  <div className="font-body text-[10px] text-inksoft">Ingresos {bs(u.ingresos)} · Gastos {bs(u.gastos)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </PaginaProtegida>
  )
}
