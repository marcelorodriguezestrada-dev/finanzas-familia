'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { TarjetaUnidad } from './_componentes/TarjetaUnidad'
import { FormUnidad } from './_componentes/FormUnidad'
import { Reparaciones } from './_componentes/Reparaciones'

export default function PropiedadesPage() {
  const { obtenerToken } = useAuth()
  const [propiedades, setPropiedades] = useState<any[]>([])
  const [unidadesPorPropiedad, setUnidadesPorPropiedad] = useState<Record<string, any[]>>({})
  const [cargando, setCargando] = useState(true)

  const [mostrarFormPropiedad, setMostrarFormPropiedad] = useState(false)
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const [expandida, setExpandida] = useState<string | null>(null)
  const [agregandoUnidadEn, setAgregandoUnidadEn] = useState<string | null>(null)
  const [verReparacionesCasa, setVerReparacionesCasa] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const headers = { Authorization: `Bearer ${token}` }
    const resProp = await fetch('/api/propiedades', { headers })
    const dataProp = await resProp.json()
    const props = dataProp.propiedades || []
    setPropiedades(props)

    // Traemos las unidades de todas las propiedades en paralelo.
    const resultados = await Promise.all(
      props.map((p: any) => fetch(`/api/unidades?propiedadId=${p.id}`, { headers }).then((r) => r.json()))
    )
    const mapa: Record<string, any[]> = {}
    props.forEach((p: any, i: number) => { mapa[p.id] = resultados[i].unidades || [] })
    setUnidadesPorPropiedad(mapa)
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function agregarPropiedad(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Ponele un nombre a la casa (ej: "Casa Sopocachi").')
    setGuardando(true)
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/propiedades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre, direccion, notas }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      setNombre(''); setDireccion(''); setNotas('')
      setMostrarFormPropiedad(false)
      cargar()
    } finally {
      setGuardando(false)
    }
  }

  async function borrarPropiedad(id: string) {
    if (!confirm('¿Borrar esta propiedad?')) return
    const token = await obtenerToken()
    const res = await fetch(`/api/propiedades/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.error) return alert(data.error)
    cargar()
  }

  return (
    <PaginaProtegida>
      <div className="flex items-center justify-between mb-1">
        <div className="font-display text-xl font-bold text-ink">Propiedades</div>
        <button
          onClick={() => setMostrarFormPropiedad((v) => !v)}
          className="px-3.5 py-2 rounded-lg border-none bg-ink text-white font-body text-xs font-semibold"
        >
          {mostrarFormPropiedad ? 'Cancelar' : '+ Agregar casa'}
        </button>
      </div>
      <div className="font-body text-xs text-inksoft mb-6">
        Cada casa se desglosa en departamentos o habitaciones independientes, cada uno con su propia ficha y su propio alquiler.
      </div>

      {mostrarFormPropiedad && (
        <form onSubmit={agregarPropiedad} className="bg-panel border border-line rounded-xl p-5 mb-6">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la casa (ej: Casa Sopocachi)" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección (opcional)" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" rows={2} className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm mb-3" />
          {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}
          <button type="submit" disabled={guardando} className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
            {guardando ? 'Guardando...' : 'Guardar casa'}
          </button>
        </form>
      )}

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      {!cargando && propiedades.length === 0 && (
        <div className="font-body text-sm text-inksoft">Todavía no cargaste ninguna casa familiar.</div>
      )}

      {propiedades.map((p) => {
        const unidades = unidadesPorPropiedad[p.id] || []
        const abierta = expandida === p.id
        const alquiladas = unidades.filter((u) => u.estado === 'alquilada').length

        return (
          <div key={p.id} className="bg-panel border border-line rounded-xl p-5 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="cursor-pointer flex-1" onClick={() => setExpandida(abierta ? null : p.id)}>
                <div className="font-body text-base font-semibold text-ink">{p.nombre}</div>
                {p.direccion && <div className="font-body text-xs text-inksoft">{p.direccion}</div>}
                <div className="font-body text-[11px] text-inksoft mt-1">
                  {unidades.length} espacio{unidades.length !== 1 ? 's' : ''} · {alquiladas} alquilado{alquiladas !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setExpandida(abierta ? null : p.id)} className="font-body text-[11px] text-ink underline">
                  {abierta ? 'Cerrar' : 'Ver espacios'}
                </button>
                <button onClick={() => borrarPropiedad(p.id)} className="font-body text-[11px] text-rojo underline">
                  Borrar
                </button>
              </div>
            </div>

            {abierta && (
              <div className="mt-4 pt-4 border-t border-line">
                {unidades.map((u) => (
                  <TarjetaUnidad key={u.id} unidad={u} onCambio={cargar} />
                ))}

                {agregandoUnidadEn === p.id ? (
                  <FormUnidad
                    propiedadId={p.id}
                    onGuardado={() => { setAgregandoUnidadEn(null); cargar() }}
                    onCancelar={() => setAgregandoUnidadEn(null)}
                  />
                ) : (
                  <button
                    onClick={() => setAgregandoUnidadEn(p.id)}
                    className="w-full py-2.5 rounded-lg border border-dashed border-line font-body text-xs text-inksoft mb-3"
                  >
                    + Agregar departamento / habitación
                  </button>
                )}

                <button
                  onClick={() => setVerReparacionesCasa(verReparacionesCasa === p.id ? null : p.id)}
                  className="font-body text-[11px] text-ink underline"
                >
                  {verReparacionesCasa === p.id ? 'Ocultar reparaciones de la casa entera' : 'Ver reparaciones de la casa entera (techo, portón, etc.)'}
                </button>
                {verReparacionesCasa === p.id && <Reparaciones propiedadId={p.id} />}
              </div>
            )}
          </div>
        )
      })}
    </PaginaProtegida>
  )
}
