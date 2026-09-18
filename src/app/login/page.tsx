'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const { usuario, iniciarSesion, registrarse } = useAuth()
  const router = useRouter()

  const [modo, setModo] = useState<'entrar' | 'registrarse'>('entrar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  if (usuario) {
    router.replace('/')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      if (modo === 'entrar') {
        await iniciarSesion(email, password)
      } else {
        if (!nombre.trim()) {
          setError('Poné tu nombre.')
          return
        }
        await registrarse(email, password, nombre)
      }
      router.replace('/')
    } catch (e: any) {
      setError(traducirError(e?.code || e?.message || ''))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="max-w-[380px] mx-auto px-5 py-16">
      <div className="text-center mb-8">
        <div className="text-3xl mb-2">🏠</div>
        <div className="font-display text-xl font-bold text-ink">Finanzas de la Familia</div>
        <div className="font-body text-xs text-inksoft mt-1">
          Ingresos, gastos, alquileres y patrimonio, todo en un solo lugar.
        </div>
      </div>

      <div className="flex gap-1 bg-panelalt rounded-lg p-1 mb-5">
        <button
          onClick={() => setModo('entrar')}
          className={`flex-1 py-2 rounded-md font-body text-sm font-semibold ${modo === 'entrar' ? 'bg-panel text-ink' : 'text-inksoft'}`}
        >
          Iniciar sesión
        </button>
        <button
          onClick={() => setModo('registrarse')}
          className={`flex-1 py-2 rounded-md font-body text-sm font-semibold ${modo === 'registrarse' ? 'bg-panel text-ink' : 'text-inksoft'}`}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={enviar} className="bg-panel border border-line rounded-xl p-5">
        {modo === 'registrarse' && (
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
            className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
          />
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Contraseña"
          className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3"
        />

        {modo === 'registrarse' && (
          <div className="font-body text-[11px] text-inksoft mb-3">
            Si sos la primera persona de la familia en registrarse, quedás admin automático. Si no, un admin va a tener que aprobarte desde "Familia" antes de que puedas ver o cargar algo.
          </div>
        )}

        {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}

        <button
          type="submit"
          disabled={cargando}
          className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60"
        >
          {cargando ? 'Un momento...' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  )
}

function traducirError(codigo: string) {
  if (codigo.includes('email-already-in-use')) return 'Ese email ya tiene una cuenta — probá iniciar sesión.'
  if (codigo.includes('invalid-credential') || codigo.includes('wrong-password')) return 'Email o contraseña incorrectos.'
  if (codigo.includes('user-not-found')) return 'No hay ninguna cuenta con ese email.'
  if (codigo.includes('weak-password')) return 'La contraseña tiene que tener al menos 6 caracteres.'
  if (codigo.includes('invalid-email')) return 'Ese email no es válido.'
  return 'Algo salió mal. Probá de nuevo.'
}
