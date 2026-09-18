'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth'
import { auth } from './firebaseClient'

type PerfilPropio = {
  nombre: string
  rol: 'admin' | 'miembro' | 'pendiente'
  aprobado: boolean
} | null

type AuthContexto = {
  usuario: User | null
  perfil: PerfilPropio
  cargando: boolean
  obtenerToken: () => Promise<string>
  iniciarSesion: (email: string, password: string) => Promise<void>
  registrarse: (email: string, password: string, nombre: string) => Promise<void>
  cerrarSesion: () => Promise<void>
  recargarPerfil: () => Promise<void>
}

const Contexto = createContext<AuthContexto | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<PerfilPropio>(null)
  const [cargando, setCargando] = useState(true)

  async function cargarPerfil(u: User) {
    const token = await u.getIdToken()
    const res = await fetch('/api/perfil', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      setPerfil(data.perfil)
    } else {
      setPerfil(null)
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUsuario(u)
      if (u) await cargarPerfil(u)
      else setPerfil(null)
      setCargando(false)
    })
    return () => unsub()
  }, [])

  async function obtenerToken() {
    if (!auth.currentUser) return ''
    return auth.currentUser.getIdToken()
  }

  async function iniciarSesion(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function registrarse(email: string, password: string, nombre: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    const token = await cred.user.getIdToken()
    await fetch('/api/perfil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nombre }),
    })
    await cargarPerfil(cred.user)
  }

  async function cerrarSesion() {
    await signOut(auth)
  }

  async function recargarPerfil() {
    if (auth.currentUser) await cargarPerfil(auth.currentUser)
  }

  return (
    <Contexto.Provider value={{ usuario, perfil, cargando, obtenerToken, iniciarSesion, registrarse, cerrarSesion, recargarPerfil }}>
      {children}
    </Contexto.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>')
  return ctx
}
