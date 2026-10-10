'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, mesActual } from '@/data/categorias'
import { formatoBs } from '@/lib/esquemaPago'
import { useEspacio } from '@/lib/espacioCliente'
import { simboloDe } from '@/lib/monedas'
import { RegistrarCobro } from '@/components/RegistrarCobro'

// Monto con el símbolo de la moneda del espacio activo.
function bs(n: number) {
  return formatoBs(n)
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function MovimientosPage() {
  const { obtenerToken, perfil, usuario } = useAuth()
  const { esPersonal } = useEspacio()
  const [moviendo, setMoviendo] = useState<string | null>(null)

  // Pasa el movimiento al otro espacio (Familia <-> Mis finanzas). Si las
  // monedas son distintas, pide el monto convertido.
  async function mover(m: any) {
    const destino = esPersonal ? 'Familia' : 'Mis finanzas'
    if (!confirm(`¿Pasar "${m.descripcion || m.categoria}" a ${destino}?${esPersonal ? '' : ' Dejará de verse en las finanzas de la familia.'}`)) return
    setMoviendo(m.id)
    try {
      const token = await obtenerToken()
      const enviar = (extra: any = {}) =>
        fetch('/api/mover-espacio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tipo: 'movimiento', id: m.id, ...extra }),
        }).then((r) => r.json())
      let d = await enviar()
      if (d.necesitaConversion) {
        const txt = prompt(`${d.error}\n¿Cuánto es ${simboloDe(d.monedaOrigen)} ${d.monto} en ${simboloDe(d.monedaDestino)}?`)
        if (!txt) return
        const convertido = Number(txt.replace(/\./g, '').replace(',', '.'))
        if (!(convertido > 0)) return alert('Monto no válido.')
        d = await enviar({ montoConvertido: convertido })
      }
      if (d.error) return alert(d.error)
      cargar()
    } finally {
      setMoviendo(null)
    }
  }

  const [mesFiltro, setMesFiltro] = useState(mesActual())
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto')
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS_GASTO[0])
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  // Ingreso de alquiler: se carga con el formulario de cobro (inquilino,
  // período y monto salen del contrato; admite pagos parciales).
  const modoCobro = tipo === 'ingreso' && categoria === 'Alquiler'

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const res = await fetch(`/api/movimientos?mes=${mesFiltro}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setMovimientos(data.movimientos || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesFiltro])

  function cambiarTipo(nuevo: 'gasto' | 'ingreso') {
    setTipo(nuevo)
    setCategoria(nuevo === 'gasto' ? CATEGORIAS_GASTO[0] : CATEGORIAS_INGRESO[0])
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (modoCobro) return
    setError('')
    if (!monto || Number(monto) <= 0) {
      setError('Poné un monto válido.')
      return
    }
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo, monto, categoria, descripcion, fecha }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setMonto('')
      setDescripcion('')
      setFecha(hoyISO())
      if (fecha.slice(0, 7) === mesFiltro) cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este movimiento?')) return
    const token = await obtenerToken()
    await fetch(`/api/movimientos/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    cargar()
  }

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const gastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0)

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-6">Ingresos y gastos</div>

      <form onSubmit={agregar} className="bg-panel border border-line rounded-xl p-5 mb-8">
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => cambiarTipo('gasto')}
            className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border ${tipo === 'gasto' ? 'bg-rojo text-white border-rojo' : 'border-line text-inksoft'}`}
          >
            Gasto
          </button>
          <button
            type="button"
            onClick={() => cambiarTipo('ingreso')}
            className={`flex-1 py-2 rounded-lg font-body text-sm font-semibold border ${tipo === 'ingreso' ? 'bg-verde text-white border-verde' : 'border-line text-inksoft'}`}
          >
            Ingreso
          </button>
        </div>

        {modoCobro ? (
          <>
            <div className="mb-3">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-panel">
                {CATEGORIAS_INGRESO.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <RegistrarCobro
              onListo={(msg) => {
                setMensaje(msg)
                cargar()
              }}
            />
          </>
        ) : (
          <>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            type="number"
            placeholder={`Monto en ${simboloDe(esPersonal ? perfil?.monedaPersonal || 'ARS' : 'BOB')}`}
            className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm"
          />
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-panel"
          >
            {(tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción (opcional)"
          className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
        />

        <input
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          type="date"
          className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
        />

        {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}

        <button
          type="submit"
          disabled={guardando}
          className={`w-full py-2.5 rounded-lg border-none text-white font-body text-sm font-semibold disabled:opacity-60 ${tipo === 'gasto' ? 'bg-rojo' : 'bg-verde'}`}
        >
          {guardando ? 'Guardando...' : `Cargar ${tipo}`}
        </button>
          </>
        )}
        {mensaje && <div className={`font-body text-xs mt-3 ${mensaje.startsWith('✓') ? 'text-verde' : 'text-rojo'}`}>{mensaje}</div>}
      </form>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <input
          type="month"
          value={mesFiltro}
          onChange={(e) => setMesFiltro(e.target.value)}
          className="px-3 py-2 rounded-lg border border-line font-body text-sm"
        />
        <div className="font-body text-xs text-inksoft">
          Ingresos: <span className="text-verde font-semibold">{bs(ingresos)}</span> · Gastos: <span className="text-rojo font-semibold">{bs(gastos)}</span>
        </div>
      </div>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      {!cargando && movimientos.length === 0 && (
        <div className="font-body text-sm text-inksoft">No hay movimientos este mes.</div>
      )}
      {!cargando && [...movimientos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map((m) => (
        <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-line">
          <div>
            <div className="font-body text-sm text-ink">{m.descripcion || m.categoria}</div>
            <div className="font-body text-[11px] text-inksoft">
              {m.categoria} · {m.fecha} · {m.registradoPorNombre}
              {m.mesCuota && m.mesCuota !== String(m.fecha).slice(0, 7) ? ` · corresponde a ${m.mesCuota.slice(5)}/${m.mesCuota.slice(0, 4)}` : ''}
              {m.medio ? ` · ${m.medio === 'qr' ? 'QR' : m.medio}` : ''}
            </div>
            {m.parcial && <div className="font-body text-[11px] text-[#8A5A0B] mt-0.5">⚠ Pago parcial{m.nota ? `: "${m.nota}"` : ''}</div>}
          </div>
          <div className="flex items-center gap-3">
            <div className={`font-body text-sm font-semibold ${m.tipo === 'ingreso' ? 'text-verde' : 'text-rojo'}`}>
              {m.tipo === 'ingreso' ? '+' : '-'}{bs(m.monto)}
            </div>
            {!m.alquilerId && !m.deudaId && !m.pendienteId && (esPersonal || !m.registradoPor || m.registradoPor === usuario?.uid) && (
              <button onClick={() => mover(m)} disabled={moviendo === m.id} className="font-body text-[11px] text-ink underline disabled:opacity-50">
                {moviendo === m.id ? 'Moviendo...' : esPersonal ? 'Pasar a Familia' : 'Pasar a Mis finanzas'}
              </button>
            )}
            <button onClick={() => borrar(m.id)} className="font-body text-[11px] text-rojo underline">
              Borrar
            </button>
          </div>
        </div>
      ))}
    </PaginaProtegida>
  )
}
