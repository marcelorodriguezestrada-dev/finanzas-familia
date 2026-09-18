'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { mesActual, nombreMes } from '@/data/categorias'

function bs(n: number) {
  const signo = n < 0 ? '-' : ''
  return `${signo}Bs ${Math.abs(n).toLocaleString('es-BO', { minimumFractionDigits: 0 })}`
}

export default function BalancePage() {
  const { obtenerToken } = useAuth()
  const [mes, setMes] = useState(mesActual())
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [nota, setNota] = useState('')
  const [notaInfo, setNotaInfo] = useState<any>(null)
  const [guardandoNota, setGuardandoNota] = useState(false)

  useEffect(() => {
    async function cargar() {
      setCargando(true)
      const token = await obtenerToken()
      const headers = { Authorization: `Bearer ${token}` }
      const [resMov, resNota] = await Promise.all([
        fetch(`/api/movimientos?mes=${mes}`, { headers }),
        fetch(`/api/notas-mensuales/${mes}`, { headers }),
      ])
      const dataMov = await resMov.json()
      const dataNota = await resNota.json()
      setMovimientos(dataMov.movimientos || [])
      setNotaInfo(dataNota.nota)
      setNota(dataNota.nota?.texto || '')
      setCargando(false)
    }
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  async function guardarNota() {
    setGuardandoNota(true)
    try {
      const token = await obtenerToken()
      await fetch(`/api/notas-mensuales/${mes}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ texto: nota }),
      })
    } finally {
      setGuardandoNota(false)
    }
  }

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso')
  const gastos = movimientos.filter((m) => m.tipo === 'gasto')
  const totalIngresos = ingresos.reduce((s, m) => s + m.monto, 0)
  const totalGastos = gastos.reduce((s, m) => s + m.monto, 0)
  const balance = totalIngresos - totalGastos

  function agruparPorCategoria(lista: any[]) {
    const mapa = new Map<string, number>()
    for (const m of lista) mapa.set(m.categoria, (mapa.get(m.categoria) || 0) + m.monto)
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }

  const gastosPorCategoria = agruparPorCategoria(gastos)
  const ingresosPorCategoria = agruparPorCategoria(ingresos)

  return (
    <PaginaProtegida>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="font-display text-xl font-bold text-ink">Balance mensual</div>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="px-3 py-2 rounded-lg border border-line font-body text-sm"
        />
      </div>
      <div className="font-body text-xs text-inksoft mb-6 capitalize">{nombreMes(mes)}</div>

      {cargando ? (
        <div className="font-body text-sm text-inksoft">Cargando...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-verdesoft border border-verde rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Ingresos</div>
              <div className="font-display text-lg font-bold text-verde">{bs(totalIngresos)}</div>
            </div>
            <div className="bg-rojosoft border border-rojo rounded-xl p-4">
              <div className="font-body text-[11px] text-inksoft mb-1">Gastos</div>
              <div className="font-display text-lg font-bold text-rojo">{bs(totalGastos)}</div>
            </div>
            <div className={`rounded-xl p-4 border ${balance >= 0 ? 'bg-verdesoft border-verde' : 'bg-rojosoft border-rojo'}`}>
              <div className="font-body text-[11px] text-inksoft mb-1">Balance</div>
              <div className={`font-display text-lg font-bold ${balance >= 0 ? 'text-verde' : 'text-rojo'}`}>{bs(balance)}</div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-8 mb-8">
            <div>
              <div className="font-body text-sm font-semibold text-ink mb-3">Gastos por categoría</div>
              {gastosPorCategoria.length === 0 && <div className="font-body text-xs text-inksoft">Sin gastos este mes.</div>}
              {gastosPorCategoria.map(([cat, monto]) => (
                <div key={cat} className="flex items-center justify-between py-1.5 border-b border-line">
                  <span className="font-body text-xs text-ink">{cat}</span>
                  <span className="font-body text-xs font-semibold text-rojo">{bs(monto)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="font-body text-sm font-semibold text-ink mb-3">Ingresos por categoría</div>
              {ingresosPorCategoria.length === 0 && <div className="font-body text-xs text-inksoft">Sin ingresos este mes.</div>}
              {ingresosPorCategoria.map(([cat, monto]) => (
                <div key={cat} className="flex items-center justify-between py-1.5 border-b border-line">
                  <span className="font-body text-xs text-ink">{cat}</span>
                  <span className="font-body text-xs font-semibold text-verde">{bs(monto)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-panel border border-line rounded-xl p-5">
            <div className="font-body text-sm font-semibold text-ink mb-2">Notas de este mes</div>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              placeholder="Ej: este mes gastamos de más en salud por la operación de..."
              className="w-full px-3 py-2.5 rounded-lg border border-line font-body text-sm mb-2"
            />
            <button
              onClick={guardarNota}
              disabled={guardandoNota}
              className="px-3.5 py-2 rounded-lg border-none bg-ink text-white font-body text-xs font-semibold disabled:opacity-60"
            >
              {guardandoNota ? 'Guardando...' : 'Guardar nota'}
            </button>
            {notaInfo && (
              <div className="font-body text-[11px] text-inksoft mt-2">
                Última edición: {notaInfo.actualizadoPor} — {new Date(notaInfo.actualizadoEn).toLocaleString('es-BO')}
              </div>
            )}
          </div>
        </>
      )}
    </PaginaProtegida>
  )
}
