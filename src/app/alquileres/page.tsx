'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { FormAlquiler } from './_componentes/FormAlquiler'
import { mesActual } from '@/data/categorias'
import { ResumenPago } from '@/components/ResumenPago'
import { EditorCanon, CanonForm, canonFormDesdeEsquema, esquemaDesdeCanonForm, canonFormValido } from '@/components/EditorCanon'
import { cuotaDelMes, esquemaDeAlquiler, esEscalonado, formatoBs } from '@/lib/esquemaPago'
import { subirArchivo } from '@/lib/subirArchivo'

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

function AlquileresContenido() {
  const { obtenerToken } = useAuth()
  const searchParams = useSearchParams()
  const unidadIdInicial = searchParams.get('unidadId') || ''

  const [propiedades, setPropiedades] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [alquileres, setAlquileres] = useState<any[]>([])
  const [miembros, setMiembros] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const [unidadSeleccionada, setUnidadSeleccionada] = useState(unidadIdInicial)
  const [filtroEstado, setFiltroEstado] = useState<'activo' | 'todos'>('activo')
  const [cobrando, setCobrando] = useState<string | null>(null)
  const [mensajeCobro, setMensajeCobro] = useState<Record<string, string>>({})
  // alquilerId -> meses (YYYY-MM) con cobro registrado
  const [mesesCobrados, setMesesCobrados] = useState<Record<string, Set<string>>>({})
  // Edición del plan de pago de un alquiler ya registrado
  const [editandoPlan, setEditandoPlan] = useState<string | null>(null)
  const [planForm, setPlanForm] = useState<CanonForm | null>(null)
  const [guardandoPlan, setGuardandoPlan] = useState(false)
  const [subiendoContrato, setSubiendoContrato] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    const token = await obtenerToken()
    const headers = { Authorization: `Bearer ${token}` }
    const [resProp, resUni, resAlq, resFam, resMov] = await Promise.all([
      fetch('/api/propiedades', { headers }),
      fetch('/api/unidades', { headers }),
      fetch('/api/alquileres', { headers }),
      fetch('/api/familia', { headers }),
      fetch('/api/movimientos', { headers }),
    ])
    const [dataProp, dataUni, dataAlq, dataFam, dataMov] = await Promise.all([
      resProp.json(), resUni.json(), resAlq.json(), resFam.json(), resMov.json(),
    ])
    const cobrados: Record<string, Set<string>> = {}
    for (const m of dataMov.movimientos || []) {
      if (!m.alquilerId || !m.fecha) continue
      ;(cobrados[m.alquilerId] ||= new Set()).add(String(m.fecha).slice(0, 7))
    }
    setMesesCobrados(cobrados)
    setPropiedades(dataProp.propiedades || [])
    setUnidades(dataUni.unidades || [])
    setAlquileres(dataAlq.alquileres || [])
    setMiembros(dataFam.miembros || [])
    setCargando(false)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function finalizar(id: string, estado: 'finalizado' | 'rescindido') {
    if (!confirm(`¿Marcar este alquiler como ${estado}? La unidad quedará disponible de nuevo.`)) return
    const token = await obtenerToken()
    await fetch(`/api/alquileres/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ estado }),
    })
    setUnidadSeleccionada('')
    cargar()
  }

  async function cobrarMes(alquilerId: string) {
    setCobrando(alquilerId)
    setMensajeCobro((m) => ({ ...m, [alquilerId]: '' }))
    try {
      const token = await obtenerToken()
      const res = await fetch('/api/cobrar-alquiler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alquilerId, mes: mesActual() }),
      })
      const data = await res.json()
      setMensajeCobro((m) => ({ ...m, [alquilerId]: data.error || `✓ Registrado como ingreso: ${data.texto || 'este mes'}.` }))
      if (!data.error) {
        setMesesCobrados((prev) => ({ ...prev, [alquilerId]: new Set([...Array.from(prev[alquilerId] || []), mesActual()]) }))
      }
    } finally {
      setCobrando(null)
    }
  }

  function abrirEditorPlan(a: any) {
    setEditandoPlan(a.id)
    setPlanForm(canonFormDesdeEsquema(esquemaDeAlquiler(a), a.montoMensual))
  }

  async function guardarPlan(a: any) {
    if (!planForm || !canonFormValido(planForm)) return alert('Cada tramo del canon necesita un monto.')
    setGuardandoPlan(true)
    try {
      const token = await obtenerToken()
      const res = await fetch(`/api/alquileres/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ esquemaPago: esquemaDesdeCanonForm(planForm) }),
      })
      const data = await res.json()
      if (data.error) return alert(data.error)
      setEditandoPlan(null)
      cargar()
    } finally {
      setGuardandoPlan(false)
    }
  }

  async function subirContratoDespues(a: any, archivo: File) {
    setSubiendoContrato(a.id)
    try {
      const url = await subirArchivo(archivo, obtenerToken)
      const token = await obtenerToken()
      await fetch(`/api/alquileres/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contratoUrl: url }),
      })
      cargar()
    } catch (err: any) {
      alert(err.message || 'No se pudo subir el contrato.')
    } finally {
      setSubiendoContrato(null)
    }
  }

  const unidadesDisponibles = unidades.filter((u) => u.estado !== 'alquilada')
  const unidad = unidades.find((u) => u.id === unidadSeleccionada)
  const propiedad = unidad ? propiedades.find((p) => p.id === unidad.propiedadId) : null

  const listaAlquileres = filtroEstado === 'activo' ? alquileres.filter((a) => a.estado === 'activo') : alquileres

  function nombreUnidad(unidadId: string) {
    const u = unidades.find((x) => x.id === unidadId)
    return u ? u.nombre : '—'
  }
  function nombrePropiedad(propiedadId: string) {
    return propiedades.find((p) => p.id === propiedadId)?.nombre || '—'
  }

  return (
    <PaginaProtegida>
      <div className="font-display text-xl font-bold text-ink mb-1">Alquileres</div>
      <div className="font-body text-xs text-inksoft mb-6">Asignación de inquilinos, contratos y archivo histórico de cada espacio.</div>

      {cargando && <div className="font-body text-sm text-inksoft">Cargando...</div>}

      {!cargando && (
        <>
          <div className="mb-6">
            <label className="font-body text-[11px] text-inksoft block mb-1">Elegí el departamento / habitación a alquilar</label>
            <select
              value={unidadSeleccionada}
              onChange={(e) => setUnidadSeleccionada(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-white"
            >
              <option value="">— Seleccionar espacio —</option>
              {unidadesDisponibles.map((u) => (
                <option key={u.id} value={u.id}>
                  {nombrePropiedad(u.propiedadId)} — {u.nombre} ({bs(u.canonEstandar)}/mes)
                </option>
              ))}
            </select>
            {unidad && unidad.estado === 'alquilada' && (
              <div className="font-body text-[11px] text-amber-600 mt-1">Esta unidad ya tiene un alquiler activo.</div>
            )}
          </div>

          {unidad && propiedad && unidad.estado !== 'alquilada' && (
            <FormAlquiler unidad={unidad} propiedad={propiedad} miembros={miembros} onGuardado={() => { setUnidadSeleccionada(''); cargar() }} />
          )}

          <div className="flex items-center justify-between mb-3 mt-8">
            <div className="font-body text-sm font-semibold text-ink">Archivo de alquileres</div>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as any)} className="px-2.5 py-1.5 rounded-lg border border-line font-body text-xs bg-white">
              <option value="activo">Solo activos</option>
              <option value="todos">Todo el histórico</option>
            </select>
          </div>

          {listaAlquileres.length === 0 && <div className="font-body text-sm text-inksoft">No hay alquileres para mostrar.</div>}

          {listaAlquileres.map((a) => (
            <div key={a.id} className="border border-line rounded-lg p-4 mb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-body text-sm font-semibold text-ink">{a.inquilinoNombre} <span className="font-normal text-inksoft">— C.I. {a.inquilinoCI}</span></div>
                  <div className="font-body text-[11px] text-inksoft">{nombrePropiedad(a.propiedadId)} — {nombreUnidad(a.unidadId)}</div>
                </div>
                <div className={`font-body text-[10px] font-semibold shrink-0 ${a.estado === 'activo' ? 'text-verde' : 'text-inksoft'}`}>
                  ● {a.estado === 'activo' ? 'Activo' : a.estado === 'finalizado' ? 'Finalizado' : 'Rescindido'}
                </div>
              </div>

              {(() => {
                const cuota = a.estado === 'activo' ? cuotaDelMes(a, mesActual()) : null
                const esquema = esquemaDeAlquiler(a)
                return (
                  <>
                    <div className="font-display text-base font-bold text-ink mt-2">
                      {formatoBs(cuota ? cuota.montoMensual : a.montoMensual)}
                      <span className="font-body text-[11px] font-normal text-inksoft">
                        /mes · paga del 1 al {a.diaCobro}
                        {esEscalonado(esquema) && ` · escalonado: ${esquema!.tramos.map((t) => formatoBs(t.monto)).join(' → ')}`}
                      </span>
                    </div>
                    {a.fechaInicio && (
                      <ResumenPago
                        compacto
                        fechaInicio={a.fechaInicio}
                        fechaFin={a.fechaFin}
                        diaCobro={a.diaCobro}
                        esquema={esquema}
                        mesesCobrados={mesesCobrados[a.id] || new Set()}
                      />
                    )}
                  </>
                )
              })()}

              {a.variacionCanon && (
                <div className={`font-body text-[11px] mt-1 ${a.variacionCanon.esMenor ? 'text-amber-600' : 'text-verde'}`}>
                  ⚠ {a.variacionCanon.texto}
                </div>
              )}

              <div className="font-body text-[11px] text-inksoft mt-1">
                Desde {a.fechaInicio}{a.fechaFin ? ` hasta ${a.fechaFin}` : ''} · Administra: {a.administradorNombre || '—'}
              </div>

              <div className="flex gap-3 mt-2 flex-wrap">
                {a.contratoUrl && (
                  <a href={a.contratoUrl} target="_blank" rel="noreferrer" className="font-body text-[11px] text-ink underline">
                    Ver contrato firmado
                  </a>
                )}
                {!a.contratoUrl && (
                  <label className="font-body text-[11px] text-ink underline cursor-pointer">
                    {subiendoContrato === a.id ? 'Subiendo...' : 'Subir contrato firmado'}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={subiendoContrato === a.id}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) subirContratoDespues(a, f)
                      }}
                    />
                  </label>
                )}
                {a.estado === 'activo' && (
                  <>
                    <button onClick={() => (editandoPlan === a.id ? setEditandoPlan(null) : abrirEditorPlan(a))} className="font-body text-[11px] text-ink underline">
                      {editandoPlan === a.id ? 'Cerrar plan de pago' : 'Editar plan de pago'}
                    </button>
                    <button onClick={() => cobrarMes(a.id)} disabled={cobrando === a.id} className="font-body text-[11px] text-verde underline disabled:opacity-50">
                      {cobrando === a.id ? 'Registrando...' : '✓ Marcar cobrado este mes'}
                    </button>
                    <button onClick={() => finalizar(a.id, 'finalizado')} className="font-body text-[11px] text-inksoft underline">
                      Marcar finalizado
                    </button>
                    <button onClick={() => finalizar(a.id, 'rescindido')} className="font-body text-[11px] text-rojo underline">
                      Marcar rescindido
                    </button>
                  </>
                )}
              </div>
              {editandoPlan === a.id && planForm && (
                <div className="mt-3">
                  <EditorCanon valor={planForm} onCambio={setPlanForm} fechaInicio={a.fechaInicio} fechaFin={a.fechaFin} />
                  <ResumenPago fechaInicio={a.fechaInicio} fechaFin={a.fechaFin} diaCobro={a.diaCobro} esquema={esquemaDesdeCanonForm(planForm)} />
                  <button
                    onClick={() => guardarPlan(a)}
                    disabled={guardandoPlan}
                    className="w-full py-2 rounded-lg border-none bg-ink text-white font-body text-xs font-semibold disabled:opacity-60 -mt-2"
                  >
                    {guardandoPlan ? 'Guardando...' : 'Guardar plan de pago'}
                  </button>
                </div>
              )}

              {mensajeCobro[a.id] && (
                <div className={`font-body text-[11px] mt-1.5 ${mensajeCobro[a.id].startsWith('✓') ? 'text-verde' : 'text-rojo'}`}>
                  {mensajeCobro[a.id]}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </PaginaProtegida>
  )
}

export default function AlquileresPage() {
  return (
    <Suspense fallback={<div className="font-body text-sm text-inksoft p-8">Cargando...</div>}>
      <AlquileresContenido />
    </Suspense>
  )
}
