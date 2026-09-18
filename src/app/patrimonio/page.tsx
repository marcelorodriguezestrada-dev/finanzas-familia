'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { TIPOS_PATRIMONIO } from '@/data/categorias'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

export default function PatrimonioPage() {
  const { obtenerToken, perfil } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState(TIPOS_PATRIMONIO[0].id)
  const [valor, setValor] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const res = await fetch('/api/patrimonio', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setItems(data.items || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombre.trim() || !valor) {
      setError('Poné al menos el nombre y el valor.')
      return
    }
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/patrimonio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre, tipo, valor, notas }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setNombre(''); setValor(''); setNotas('')
      setMostrarForm(false)
      cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este ítem del patrimonio?')) return
    const token = await obtenerToken()
    await fetch(`/api/patrimonio/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  const activosItems = items.filter((i) => i.tipo !== 'deuda')
  const deudasItems = items.filter((i) => i.tipo === 'deuda')
  const totalActivos = activosItems.reduce((s, i) => s + i.valor, 0)
  const totalDeudas = deudasItems.reduce((s, i) => s + i.valor, 0)

  return (
    <PaginaProtegida>
      <div className="flex items-center justify-between mb-6">
        <div className="font-display text-xl font-bold text-ink">Patrimonio</div>
        {perfil?.rol === 'admin' && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="px-3.5 py-2 rounded-lg border-none bg-ink text-white font-body text-xs font-semibold"
          >
            {mostrarForm ? 'Cancelar' : '+ Agregar ítem'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="font-body text-[11px] text-inksoft mb-1">Activos</div>
          <div className="font-display text-lg font-bold text-verde">{bs(totalActivos)}</div>
        </div>
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="font-body text-[11px] text-inksoft mb-1">Deudas</div>
          <div className="font-display text-lg font-bold text-rojo">{bs(totalDeudas)}</div>
        </div>
        <div className="bg-panelalt border border-line rounded-xl p-4">
          <div className="font-body text-[11px] text-inksoft mb-1">Neto</div>
          <div className="font-display text-lg font-bold text-ink">{bs(totalActivos - totalDeudas)}</div>
        </div>
      </div>

      {mostrarForm && (
        <form onSubmit={agregar} className="bg-panel border border-line rounded-xl p-5 mb-6">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej: Casa Sopocachi, Auto Toyota, Préstamo banco)" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-panel">
              {TIPOS_PATRIMONIO.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <input value={valor} onChange={(e) => setValor(e.target.value)} type="number" placeholder="Valor en Bs" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
          </div>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}
          <button type="submit" disabled={guardando} className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      )}

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}

      <div className="font-body text-sm font-semibold text-ink mb-2">Activos</div>
      {activosItems.length === 0 && <div className="font-body text-xs text-inksoft mb-4">Sin activos cargados.</div>}
      {activosItems.map((i) => (
        <ItemPatrimonio key={i.id} item={i} esAdmin={perfil?.rol === 'admin'} onBorrar={borrar} />
      ))}

      <div className="font-body text-sm font-semibold text-ink mb-2 mt-6">Deudas</div>
      {deudasItems.length === 0 && <div className="font-body text-xs text-inksoft">Sin deudas cargadas — ¡buenísimo!</div>}
      {deudasItems.map((i) => (
        <ItemPatrimonio key={i.id} item={i} esAdmin={perfil?.rol === 'admin'} onBorrar={borrar} negativo />
      ))}
    </PaginaProtegida>
  )
}

function ItemPatrimonio({ item, esAdmin, onBorrar, negativo }: { item: any; esAdmin: boolean; onBorrar: (id: string) => void; negativo?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-line">
      <div>
        <div className="font-body text-sm text-ink">{item.nombre}</div>
        <div className="font-body text-[11px] text-inksoft">
          {TIPOS_PATRIMONIO.find((t) => t.id === item.tipo)?.label}{item.notas ? ` · ${item.notas}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className={`font-body text-sm font-semibold ${negativo ? 'text-rojo' : 'text-ink'}`}>{bs(item.valor)}</div>
        {esAdmin && (
          <button onClick={() => onBorrar(item.id)} className="font-body text-[11px] text-rojo underline">Borrar</button>
        )}
      </div>
    </div>
  )
}
