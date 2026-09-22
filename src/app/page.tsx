'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { mesActual } from '@/data/categorias'

function bs(n: number) {
  const signo = n < 0 ? '-' : ''
  return `${signo}Bs ${Math.abs(n).toLocaleString('es-BO', { minimumFractionDigits: 0 })}`
}

export default function ResumenPage() {
  const { obtenerToken } = useAuth()
  const [movimientosMes, setMovimientosMes] = useState<any[]>([])
  const [patrimonio, setPatrimonio] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const token = await obtenerToken()
      if (!token) return
      const headers = { Authorization: `Bearer ${token}` }
      const [resMov, resPat] = await Promise.all([
        fetch(`/api/movimientos?mes=${mesActual()}`, { headers }),
        fetch('/api/patrimonio', { headers }),
      ])
      const dataMov = await resMov.json()
      const dataPat = await resPat.json()
      setMovimientosMes(dataMov.movimientos || [])
      setPatrimonio(dataPat.items || [])
      setCargando(false)
    }
    cargar()
  }, [obtenerToken])

  const ingresosMes = movimientosMes.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const gastosMes = movimientosMes.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)
  const balanceMes = ingresosMes - gastosMes

  const activos = patrimonio.filter((p) => p.tipo !== 'deuda').reduce((s, p) => s + p.valor, 0)
  const deudas = patrimonio.filter((p) => p.tipo === 'deuda').reduce((s, p) => s + p.valor, 0)
  const patrimonioNeto = activos - deudas

  const ultimosMovimientos = [...movimientosMes]
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, 8)

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Resumen de la familia</div>
      <div className="font-body text-xs text-inksoft mb-6">Este mes ({new Date().toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })})</div>

      {cargando ? (
        <div className="font-body text-sm text-inksoft">Cargando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="bg-panel border border-line rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Patrimonio neto</div>
              <div className="font-display text-xl font-bold text-ink">{bs(patrimonioNeto)}</div>
            </div>
            <div className="bg-verdesoft border border-verde rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Ingresos del mes</div>
              <div className="font-display text-xl font-bold text-verde">{bs(ingresosMes)}</div>
            </div>
            <div className="bg-rojosoft border border-rojo rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Gastos del mes</div>
              <div className="font-display text-xl font-bold text-rojo">{bs(gastosMes)}</div>
            </div>
            <div className={`rounded-xl p-4 border ${balanceMes >= 0 ? 'bg-verdesoft border-verde' : 'bg-rojosoft border-rojo'}`}>
              <div className="font-body text-[11px] text-inksoft mb-1">Balance del mes</div>
              <div className={`font-display text-xl font-bold ${balanceMes >= 0 ? 'text-verde' : 'text-rojo'}`}>{bs(balanceMes)}</div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mb-8">
            <Link href="/movimientos" className="px-4 py-2.5 rounded-lg bg-ink text-white font-body text-sm font-semibold">
              + Cargar ingreso o gasto
            </Link>
            <Link href="/propiedades" className="px-4 py-2.5 rounded-lg border border-line font-body text-sm text-ink">
              Ver propiedades
            </Link>
            <Link href="/alquileres" className="px-4 py-2.5 rounded-lg border border-line font-body text-sm text-ink">
              Alquileres
            </Link>
            <Link href="/dashboard" className="px-4 py-2.5 rounded-lg border border-line font-body text-sm text-ink">
              Dashboard / Fondo de inversión
            </Link>
            <Link href="/calendario" className="px-4 py-2.5 rounded-lg border border-line font-body text-sm text-ink">
              Calendario y alertas
            </Link>
            <Link href="/balance" className="px-4 py-2.5 rounded-lg border border-line font-body text-sm text-ink">
              Balance mensual detallado
            </Link>
          </div>

          <div className="font-body text-sm font-semibold text-ink mb-3">Últimos movimientos de este mes</div>
          {ultimosMovimientos.length === 0 && (
            <div className="font-body text-sm text-inksoft">Todavía no hay movimientos cargados este mes.</div>
          )}
          {ultimosMovimientos.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-line">
              <div>
                <div className="font-body text-sm text-ink">{m.descripcion || m.categoria}</div>
                <div className="font-body text-[11px] text-inksoft">{m.categoria} · {m.fecha} · {m.registradoPorNombre}</div>
              </div>
              <div className={`font-body text-sm font-semibold ${m.tipo === 'ingreso' ? 'text-verde' : 'text-rojo'}`}>
                {m.tipo === 'ingreso' ? '+' : '-'}{bs(m.monto)}
              </div>
            </div>
          ))}
        </>
      )}
    </PaginaProtegida>
  )
}
