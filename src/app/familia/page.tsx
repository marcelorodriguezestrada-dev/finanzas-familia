'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'

export default function FamiliaPage() {
  const { obtenerToken, usuario } = useAuth()
  const [miembros, setMiembros] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [emailNuevo, setEmailNuevo] = useState('')
  const [passwordNuevo, setPasswordNuevo] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorCreacion, setErrorCreacion] = useState('')
  const [avisoCreacion, setAvisoCreacion] = useState('')

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

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault()
    setErrorCreacion('')
    setAvisoCreacion('')
    if (!nombreNuevo.trim() || !emailNuevo.trim() || !passwordNuevo) {
      return setErrorCreacion('Completá nombre, email y contraseña.')
    }
    setCreando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/crear-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: nombreNuevo, email: emailNuevo, password: passwordNuevo }),
      })
      const data = await res.json()
      if (data.error) return setErrorCreacion(data.error)

      setAvisoCreacion(
        `Cuenta creada para ${data.nombre}. Pasale estos datos por WhatsApp para que entre: email "${data.email}" y la contraseña que elegiste.`
      )
      setNombreNuevo('')
      setEmailNuevo('')
      setPasswordNuevo('')
      cargar()
    } finally {
      setCreando(false)
    }
  }

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Familia</div>
      <div className="font-body text-xs text-inksoft mb-6">
        Todos los que tienen cuenta entran con el mismo acceso, sin aprobación previa.
      </div>

      <div className="border border-line rounded-lg p-4 mb-6 bg-white/50">
        <div className="font-body text-sm font-semibold text-ink mb-1">Crear cuenta para un familiar</div>
        <div className="font-body text-[11px] text-inksoft mb-3">
          Para alguien que no maneja su propio email (por ejemplo, si solo usa WhatsApp): cargá acá su nombre, un email
          (puede ser uno que le armes vos) y una contraseña simple, y pasale esos datos por WhatsApp o de palabra para que
          entre a la app.
        </div>
        <form onSubmit={crearUsuario}>
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre completo"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-2"
          />
          <input
            value={emailNuevo}
            onChange={(e) => setEmailNuevo(e.target.value)}
            placeholder="Email (puede ser uno que le armes vos)"
            type="email"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-2"
          />
          <input
            value={passwordNuevo}
            onChange={(e) => setPasswordNuevo(e.target.value)}
            placeholder="Contraseña (mínimo 6 caracteres, elegí algo fácil de recordar)"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
          />
          <button type="submit" disabled={creando} className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
            {creando ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
        {errorCreacion && <div className="font-body text-xs text-rojo mt-2">{errorCreacion}</div>}
        {avisoCreacion && <div className="font-body text-xs text-verde mt-2">{avisoCreacion}</div>}
      </div>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}

      {!cargando && (
        <div>
          <div className="font-body text-sm font-semibold text-ink mb-3">
            Miembros de la familia ({miembros.length})
          </div>
          {miembros.map((m) => (
            <div key={m.uid} className="flex items-center justify-between py-2.5 border-b border-line">
              <div>
                <div className="font-body text-sm text-ink">
                  {m.nombre} {m.uid === usuario?.uid && <span className="text-inksoft">(vos)</span>}
                </div>
                <div className="font-body text-[11px] text-inksoft">{m.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PaginaProtegida>
  )
}
