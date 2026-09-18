'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'

export default function FamiliaPage() {
  const { obtenerToken, usuario } = useAuth()
  const [miembros, setMiembros] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [accionando, setAccionando] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const res = await fetch('/api/familia', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setMiembros(data.miembros || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cambiarRol(uid: string, rol: 'admin' | 'miembro') {
    setAccionando(uid)
    try {
      const token = await obtenerToken()
      await fetch('/api/familia', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, rol }),
      })
      cargar()
    } finally {
      setAccionando(null)
    }
  }

  const pendientes = miembros.filter((m) => !m.aprobado)
  const aprobados = miembros.filter((m) => m.aprobado)

  return (
    <PaginaProtegida soloAdmin>
      <div className="font-display text-xl font-bold text-ink mb-1">Familia</div>
      <div className="font-body text-xs text-inksoft mb-6">
        Acá aprobás a quien se registre y decidís quién más puede ser admin (con los mismos permisos que vos: cargar propiedades, patrimonio, y editar/borrar cualquier movimiento).
      </div>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}

      {!cargando && pendientes.length > 0 && (
        <div className="mb-8">
          <div className="font-body text-sm font-semibold text-ochre mb-3">
            Esperando aprobación ({pendientes.length})
          </div>
          {pendientes.map((m) => (
            <div key={m.uid} className="bg-panel border border-ocre rounded-lg p-4 mb-3">
              <div className="font-body text-sm font-medium text-ink mb-1">{m.nombre}</div>
              <div className="font-body text-xs text-inksoft mb-3">{m.email}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => cambiarRol(m.uid, 'miembro')}
                  disabled={accionando === m.uid}
                  className="px-3.5 py-1.5 rounded-md border-none bg-verde text-white font-body text-xs font-semibold disabled:opacity-50"
                >
                  Aprobar como miembro
                </button>
                <button
                  onClick={() => cambiarRol(m.uid, 'admin')}
                  disabled={accionando === m.uid}
                  className="px-3.5 py-1.5 rounded-md border border-line font-body text-xs text-ink disabled:opacity-50"
                >
                  Aprobar como admin
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!cargando && (
        <div>
          <div className="font-body text-sm font-semibold text-ink mb-3">
            Miembros de la familia ({aprobados.length})
          </div>
          {aprobados.map((m) => (
            <div key={m.uid} className="flex items-center justify-between py-2.5 border-b border-line">
              <div>
                <div className="font-body text-sm text-ink">
                  {m.nombre} {m.uid === usuario?.uid && <span className="text-inksoft">(vos)</span>}
                </div>
                <div className="font-body text-[11px] text-inksoft">{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-body text-[11px] font-semibold px-2 py-1 rounded-full ${m.rol === 'admin' ? 'bg-ocresoft text-ocre' : 'bg-panelalt text-inksoft'}`}>
                  {m.rol === 'admin' ? 'Admin' : 'Miembro'}
                </span>
                {m.uid !== usuario?.uid && (
                  <button
                    onClick={() => cambiarRol(m.uid, m.rol === 'admin' ? 'miembro' : 'admin')}
                    disabled={accionando === m.uid}
                    className="font-body text-[11px] text-inksoft underline disabled:opacity-50"
                  >
                    {m.rol === 'admin' ? 'Sacar admin' : 'Hacer admin'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PaginaProtegida>
  )
}
