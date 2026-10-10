'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { formatoBs, fechaCorta, esquemaDeAlquiler, redondear } from '@/lib/esquemaPago'
import { estadoCuotas } from '@/lib/cobros'
import { mesesHasta, mesCorto, aCSV, descargarArchivo, leerAlquileresPegados, NuevaFila } from '@/lib/planilla'

// Planilla de alquileres para las reuniones de familia: todos los
// alquileres en una tabla, editables en el lugar (inquilino, quién
// administra, canon, día de pago, fin de contrato, estado), con los
// cobros de varios meses a la vista para cargar lo que pagó cada uno,
// y columnas de seguimiento (situación, próxima acción, responsable,
// fecha). Todo se guarda junto con "Guardar cambios".

type Campos = {
  inquilinoNombre: string
  inquilinoTelefono: string
  administradorUid: string
  canon: string
  diaCobro: string
  fechaFin: string
  estado: string
  seguimiento: string
  proximaAccion: string
  accionResponsable: string
  accionFecha: string
  accionHecha: boolean
}
type CeldaCobro = { valor: string; motivo: string }

const hoyISO = () => new Date().toISOString().slice(0, 10)

export default function PlanillaPage() {
  const { obtenerToken } = useAuth()
  const hoy = hoyISO()
  const mesHoy = hoy.slice(0, 7)

  const [datos, setDatos] = useState<{ alquileres: any[]; propiedades: any[]; unidades: any[]; miembros: any[]; movimientos: any[]; alertas: any[] } | null>(null)
  const [error, setError] = useState('')
  const [edits, setEdits] = useState<Record<string, Partial<Campos>>>({})
  const [cobros, setCobros] = useState<Record<string, CeldaCobro>>({})
  const [nuevas, setNuevas] = useState<NuevaFila[]>([])
  const [cantMeses, setCantMeses] = useState(3)
  const [mesFin, setMesFin] = useState(mesHoy)
  const [fechaCobros, setFechaCobros] = useState(hoy)
  const [filtroProp, setFiltroProp] = useState('')
  const [filtroAdmin, setFiltroAdmin] = useState('')
  const [soloSaldo, setSoloSaldo] = useState(false)
  const [verFinalizados, setVerFinalizados] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [log, setLog] = useState<{ txt: string; ok: boolean }[]>([])
  const [problemas, setProblemas] = useState<string[]>([])
  const [pegando, setPegando] = useState(false)
  const [textoPegado, setTextoPegado] = useState('')

  async function cargar() {
    const token = await obtenerToken()
    const h = { Authorization: `Bearer ${token}` }
    try {
      const urls = ['/api/alquileres', '/api/propiedades', '/api/unidades', '/api/familia', '/api/movimientos', '/api/alertas']
      const [a, p, u, f, m, al] = await Promise.all(urls.map((x) => fetch(x, { headers: h }).then((r) => r.json())))
      if (a.error) return setError(a.error)
      setDatos({ alquileres: a.alquileres || [], propiedades: p.propiedades || [], unidades: u.unidades || [], miembros: f.miembros || [], movimientos: m.movimientos || [], alertas: al.alertas || [] })
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar los datos.')
    }
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cantCambios = Object.values(edits).reduce((s, e) => s + Object.keys(e).length, 0) + Object.keys(cobros).length + nuevas.length
  // Aviso si se quiere salir con cambios sin guardar.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (cantCambios > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [cantCambios])

  const meses = mesesHasta(mesFin, cantMeses)
  const nombreProp = (id: string) => datos?.propiedades.find((p) => p.id === id)?.nombre || ''
  const nombreUni = (id: string) => datos?.unidades.find((u) => u.id === id)?.nombre || ''

  // Valores originales de cada alquiler (para comparar y para mostrar).
  const original = (a: any): Campos => {
    const e = esquemaDeAlquiler(a)
    return {
      inquilinoNombre: a.inquilinoNombre || '',
      inquilinoTelefono: a.inquilinoTelefono || '',
      administradorUid: a.administradorUid || '',
      canon: e && e.tramos.length === 1 ? String(e.tramos[0].monto) : '',
      diaCobro: String(a.diaCobro || 1),
      fechaFin: a.fechaFin || '',
      estado: a.estado || 'activo',
      seguimiento: a.seguimiento || '',
      proximaAccion: a.proximaAccion || '',
      accionResponsable: a.accionResponsable || '',
      accionFecha: a.accionFecha || '',
      accionHecha: !!a.accionHecha,
    }
  }
  const valor = <K extends keyof Campos>(a: any, k: K): Campos[K] => (edits[a.id]?.[k] !== undefined ? (edits[a.id]![k] as Campos[K]) : original(a)[k])
  function editar(a: any, k: keyof Campos, v: any) {
    setEdits((prev) => {
      const actual = { ...(prev[a.id] || {}) }
      if (original(a)[k] === v) delete actual[k]
      else (actual as any)[k] = v
      const next: Record<string, Partial<Campos>> = { ...prev, [a.id]: actual }
      if (!Object.keys(actual).length) delete next[a.id]
      return next
    })
  }

  // Filas con su estado de cuenta (cuotas de todos los meses hasta el fin).
  const filas = useMemo(() => {
    if (!datos) return []
    return datos.alquileres
      .filter((a) => verFinalizados || a.estado === 'activo')
      .filter((a) => !filtroProp || a.propiedadId === filtroProp)
      .filter((a) => !filtroAdmin || a.administradorUid === filtroAdmin)
      .map((a) => {
        const cuotas = estadoCuotas(a, datos.movimientos, { hasta: meses[meses.length - 1] > mesHoy ? meses[meses.length - 1] : mesHoy, hoy })
        const alerta = datos.alertas.find((x) => x.alquilerId === a.id)
        return { a, cuotas, alerta }
      })
      .sort((x, y) => `${nombreProp(x.a.propiedadId)} ${nombreUni(x.a.unidadId)}`.localeCompare(`${nombreProp(y.a.propiedadId)} ${nombreUni(y.a.unidadId)}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, verFinalizados, filtroProp, filtroAdmin, meses.join(), mesHoy, hoy])

  // Saldo vencido considerando lo que se está cargando en la planilla.
  const saldoDe = (id: string, cuotas: any[]) =>
    redondear(
      cuotas
        .filter((c) => c.mes <= mesHoy)
        .reduce((s, c) => {
          const ed = cobros[`${id}|${c.mes}`]
          const pagado = ed && ed.valor !== '' ? Number(ed.valor) || 0 : c.pagado
          return s + Math.max(0, c.monto - pagado)
        }, 0)
    )
  const filasVisibles = filas.filter((f) => !soloSaldo || saldoDe(f.a.id, f.cuotas) > 0.009)

  function celdaCobro(id: string, mes: string, cambios: Partial<CeldaCobro>, pagadoOriginal: number) {
    const k = `${id}|${mes}`
    setCobros((prev) => {
      const actual = { valor: prev[k]?.valor ?? String(pagadoOriginal || ''), motivo: prev[k]?.motivo ?? '', ...cambios }
      const next = { ...prev, [k]: actual }
      if ((Number(actual.valor) || 0) === pagadoOriginal && !actual.motivo) delete next[k]
      return next
    })
  }

  // Revisa todo antes de guardar; si hay problemas no se guarda nada.
  function revisar(): string[] {
    const errs: string[] = []
    if (!datos) return errs
    for (const [k, c] of Object.entries(cobros)) {
      const [id, mes] = k.split('|')
      const f = filas.find((x) => x.a.id === id) || { a: datos.alquileres.find((x) => x.id === id), cuotas: [] as any[] }
      const cuota = (f.cuotas.length ? f.cuotas : estadoCuotas(f.a, datos.movimientos, { hasta: mes, hoy })).find((x: any) => x.mes === mes)
      const nombre = `${f.a?.inquilinoNombre} (${mesCorto(mes)})`
      if (!cuota) continue
      const v = Number(c.valor) || 0
      if (v < cuota.pagado - 0.009) errs.push(`${nombre}: ya tenía ${formatoBs(cuota.pagado)} cobrados. Para corregir un cobro, borralo en Ingresos y gastos.`)
      else if (v > cuota.monto + 0.009) errs.push(`${nombre}: el monto supera la cuota (${formatoBs(cuota.monto)}).`)
      else if (v > cuota.pagado + 0.009 && v < cuota.monto - 0.009 && c.motivo.trim().length < 5) errs.push(`${nombre}: pago parcial, falta escribir el motivo.`)
    }
    for (const [id, e] of Object.entries(edits)) {
      const a = datos.alquileres.find((x) => x.id === id)
      if (e.inquilinoNombre !== undefined && !e.inquilinoNombre.trim()) errs.push(`${a?.inquilinoNombre}: el nombre no puede quedar vacío.`)
      if (e.canon !== undefined && !(Number(e.canon) > 0)) errs.push(`${a?.inquilinoNombre}: canon no válido.`)
      if (e.diaCobro !== undefined && !(Number(e.diaCobro) >= 1 && Number(e.diaCobro) <= 28)) errs.push(`${a?.inquilinoNombre}: el día de pago va de 1 a 28.`)
    }
    nuevas.forEach((n, i) => {
      const quien = n.inquilinoNombre || `fila nueva ${i + 1}`
      if (!n.unidadId) errs.push(`${quien}: elegí el departamento.`)
      if (!n.inquilinoNombre.trim() || !n.inquilinoCI.trim()) errs.push(`${quien}: faltan nombre o C.I.`)
      if (!(Number(n.canon) > 0)) errs.push(`${quien}: falta el canon.`)
      if (!n.fechaInicio) errs.push(`${quien}: falta la fecha de inicio.`)
      if (!n.administradorUid) errs.push(`${quien}: elegí quién administra.`)
    })
    return errs
  }

  async function guardar() {
    const errs = revisar()
    setProblemas(errs)
    setLog([])
    if (errs.length || !datos) return
    setGuardando(true)
    const token = await obtenerToken()
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    const res: { txt: string; ok: boolean }[] = []
    try {
      // 1) Datos de cada alquiler
      for (const [id, e] of Object.entries(edits)) {
        const a = datos.alquileres.find((x) => x.id === id)
        const body: Record<string, any> = { ...e, motivo: 'Planilla de alquileres' }
        delete body.canon
        if (e.canon !== undefined) {
          const esq = esquemaDeAlquiler(a)
          body.esquemaPago = { tramos: [{ monto: Number(e.canon), meses: null }], proporcionalInicio: esq?.proporcionalInicio ?? true, proporcionalFin: esq?.proporcionalFin ?? true, baseDias: esq?.baseDias || 30 }
        }
        if (e.diaCobro !== undefined) body.diaCobro = Number(e.diaCobro)
        if (e.fechaFin !== undefined) body.fechaFin = e.fechaFin || null
        const d = await fetch(`/api/alquileres/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify(body) }).then((r) => r.json())
        res.push({ txt: `${a?.inquilinoNombre}: ${d.error || (d.sinCambios ? 'sin cambios' : `actualizado (${(d.cambiados || []).join(', ')})`)}`, ok: !d.error })
      }
      // 2) Cobros (solo lo que se sumó respecto de lo ya cobrado)
      for (const [k, c] of Object.entries(cobros)) {
        const [id, mes] = k.split('|')
        const f = filas.find((x) => x.a.id === id)
        const cuota = f?.cuotas.find((x: any) => x.mes === mes)
        if (!f || !cuota) continue
        const v = Number(c.valor) || 0
        const delta = redondear(v - cuota.pagado)
        if (delta <= 0.009) continue
        const d = await fetch('/api/cobrar-alquiler', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ alquilerId: id, mes, monto: delta, fecha: fechaCobros, explicacion: v < cuota.monto - 0.009 ? c.motivo : '' }),
        }).then((r) => r.json())
        res.push({ txt: `${f.a.inquilinoNombre} · ${mesCorto(mes)}: ${d.error || d.texto}`, ok: !d.error })
      }
      // 3) Alquileres nuevos
      for (const n of nuevas) {
        const adm = datos.miembros.find((m) => m.uid === n.administradorUid)
        const canon = Number(n.canon)
        const d = await fetch('/api/alquileres', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            unidadId: n.unidadId, inquilinoNombre: n.inquilinoNombre.trim(), inquilinoCI: n.inquilinoCI.trim(), inquilinoTelefono: n.inquilinoTelefono.trim(),
            montoMensual: canon, esquemaPago: { tramos: [{ monto: canon, meses: null }], proporcionalInicio: true, proporcionalFin: true, baseDias: 30 },
            diaCobro: Number(n.diaCobro) || 5, fechaInicio: n.fechaInicio, fechaFin: n.fechaFin || null,
            administradorUid: n.administradorUid, administradorNombre: adm?.nombre || '',
          }),
        }).then((r) => r.json())
        res.push({ txt: `Nuevo · ${n.inquilinoNombre} (${nombreProp(datos.unidades.find((u) => u.id === n.unidadId)?.propiedadId)} — ${nombreUni(n.unidadId)}): ${d.error || 'alquiler creado'}`, ok: !d.error })
      }
    } finally {
      setLog(res)
      // Se limpia solo lo que salió bien; lo que falló queda para corregir.
      const fallaron = new Set(res.filter((r) => !r.ok).map((r) => r.txt))
      if (!fallaron.size) {
        setEdits({})
        setCobros({})
        setNuevas([])
      }
      await cargar()
      setGuardando(false)
    }
  }

  function exportar() {
    if (!datos) return
    const enc = ['Inmueble', 'Inquilino', 'Teléfono', 'Administra', 'Canon', 'Paga hasta el día', 'Fin de contrato', 'Estado', ...meses.flatMap((m) => [`${mesCorto(m)} corresponde`, `${mesCorto(m)} cobrado`]), 'Saldo vencido', 'Seguimiento', 'Próxima acción', 'Responsable', 'Para el']
    const filasCSV = filasVisibles.map(({ a, cuotas }) => [
      `${nombreProp(a.propiedadId)} — ${nombreUni(a.unidadId)}`,
      a.inquilinoNombre,
      a.inquilinoTelefono || '',
      a.administradorNombre || '',
      esquemaDeAlquiler(a)?.tramos.map((t) => t.monto).join(' → ') || a.montoMensual,
      a.diaCobro,
      a.fechaFin || '',
      a.estado,
      ...meses.flatMap((m): (string | number)[] => {
        const c = cuotas.find((x: any) => x.mes === m)
        return c ? [c.monto, c.pagado] : ['', '']
      }),
      saldoDe(a.id, cuotas),
      a.seguimiento || '',
      a.proximaAccion || '',
      a.accionResponsable || '',
      a.accionFecha || '',
    ])
    descargarArchivo(`planilla-alquileres-${hoy}.csv`, aCSV([enc, ...filasCSV]))
  }

  function agregarFila() {
    setNuevas((p) => [...p, { key: `n${Date.now()}`, unidadId: '', inquilinoNombre: '', inquilinoCI: '', inquilinoTelefono: '', canon: '', fechaInicio: hoy, fechaFin: '', diaCobro: '5', administradorUid: '' }])
  }
  function editarNueva(key: string, k: keyof NuevaFila, v: string) {
    setNuevas((p) => p.map((n) => (n.key === key ? { ...n, [k]: v } : n)))
  }
  function leerPegado() {
    if (!datos) return
    const r = leerAlquileresPegados(textoPegado, datos.unidades, datos.propiedades, datos.miembros)
    if (r.error) return setProblemas([r.error])
    setProblemas([])
    setNuevas((p) => [...p, ...r.filas])
    setTextoPegado('')
    setPegando(false)
  }

  // Departamentos libres (para filas nuevas)
  const ocupadas = new Set((datos?.alquileres || []).filter((a) => a.estado === 'activo').map((a) => a.unidadId))
  const unidadesLibres = (datos?.unidades || []).filter((u) => !ocupadas.has(u.id))

  // Totales por mes
  const totales = meses.map((m) => {
    let corresponde = 0
    let cobrado = 0
    for (const { a, cuotas } of filasVisibles) {
      const c = cuotas.find((x: any) => x.mes === m)
      if (!c) continue
      corresponde += c.monto
      const ed = cobros[`${a.id}|${m}`]
      cobrado += ed && ed.valor !== '' ? Number(ed.valor) || 0 : c.pagado
    }
    return { m, corresponde: redondear(corresponde), cobrado: redondear(cobrado) }
  })

  const inp = 'w-full px-1.5 py-1 rounded border font-body text-xs text-ink'
  const cambiado = (a: any, k: keyof Campos) => (edits[a.id]?.[k] !== undefined ? 'border-ocre bg-[#FFF3C4]' : 'border-line bg-white')
  const th = 'px-2 py-2 text-left font-semibold whitespace-nowrap'

  return (
    <PaginaProtegida ancho>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="font-display text-xl font-bold text-ink mb-1">Planilla de alquileres</div>
          <div className="font-body text-xs text-inksoft max-w-2xl">
            Para las reuniones de familia: editá directo en la tabla, cargá lo que pagó cada uno en el mes que corresponde y anotá el seguimiento. Las celdas cambiadas se ven en amarillo; nada se guarda hasta tocar "Guardar cambios".
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportar} disabled={!datos} className="min-h-[40px] px-3 rounded-lg border border-line bg-white font-body text-xs text-ink">Descargar Excel (CSV)</button>
          <button onClick={guardar} disabled={!cantCambios || guardando} className="min-h-[40px] px-4 rounded-lg bg-verde text-white font-body text-sm font-semibold disabled:opacity-50">
            {guardando ? 'Guardando...' : `Guardar cambios${cantCambios ? ` (${cantCambios})` : ''}`}
          </button>
        </div>
      </div>

      {/* Filtros y opciones */}
      <div className="flex gap-3 flex-wrap items-end mb-3 font-body text-[11px] text-inksoft">
        <label className="flex flex-col gap-1">
          Propiedad
          <select value={filtroProp} onChange={(e) => setFiltroProp(e.target.value)} className="px-2 py-1.5 rounded border border-line bg-white text-xs text-ink">
            <option value="">Todas</option>
            {(datos?.propiedades || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Administra
          <select value={filtroAdmin} onChange={(e) => setFiltroAdmin(e.target.value)} className="px-2 py-1.5 rounded border border-line bg-white text-xs text-ink">
            <option value="">Todos</option>
            {(datos?.miembros || []).map((m) => <option key={m.uid} value={m.uid}>{m.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Meses a mostrar
          <select value={cantMeses} onChange={(e) => setCantMeses(Number(e.target.value))} className="px-2 py-1.5 rounded border border-line bg-white text-xs text-ink">
            {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Hasta
          <input type="month" value={mesFin} onChange={(e) => e.target.value && setMesFin(e.target.value)} className="px-2 py-1 rounded border border-line bg-white text-xs text-ink" />
        </label>
        <label className="flex flex-col gap-1">
          Fecha de los cobros que cargues
          <input type="date" value={fechaCobros} onChange={(e) => setFechaCobros(e.target.value)} className="px-2 py-1 rounded border border-line bg-white text-xs text-ink" />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink">
          <input type="checkbox" checked={soloSaldo} onChange={(e) => setSoloSaldo(e.target.checked)} /> Solo los que deben
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-ink">
          <input type="checkbox" checked={verFinalizados} onChange={(e) => setVerFinalizados(e.target.checked)} /> Incluir finalizados
        </label>
      </div>

      {error && <div className="font-body text-sm text-rojo mb-3">{error}</div>}
      {!datos && !error && <div className="font-body text-sm text-inksoft">Cargando...</div>}

      {problemas.length > 0 && (
        <div className="border border-rojo bg-rojosoft rounded-lg px-3 py-2 mb-3 font-body text-xs text-rojo">
          <b>Antes de guardar, corregí:</b>
          <ul className="m-0 mt-1 pl-4">{problemas.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      {log.length > 0 && (
        <div className="border border-line bg-white rounded-lg px-3 py-2 mb-3 font-body text-xs">
          <b className="text-ink">Resultado:</b>
          <ul className="m-0 mt-1 pl-4">{log.map((l, i) => <li key={i} className={l.ok ? 'text-verde' : 'text-rojo'}>{l.ok ? '✓' : '✗'} {l.txt}</li>)}</ul>
        </div>
      )}

      {datos && (
        <>
          <div className="overflow-x-auto border border-line rounded-xl bg-panel">
            <table className="border-collapse font-body text-xs min-w-full">
              <thead>
                <tr className="bg-ink text-white">
                  <th className={`${th} sticky left-0 z-10 bg-ink min-w-[150px]`}>Inmueble</th>
                  <th className={`${th} min-w-[170px]`}>Inquilino</th>
                  <th className={`${th} min-w-[110px]`}>Teléfono</th>
                  <th className={`${th} min-w-[130px]`}>Administra</th>
                  <th className={`${th} min-w-[90px]`}>Canon</th>
                  <th className={`${th} min-w-[60px]`} title="Paga dentro de los primeros N días">Día</th>
                  <th className={`${th} min-w-[130px]`}>Fin contrato</th>
                  <th className={`${th} min-w-[100px]`}>Estado</th>
                  {meses.map((m) => (
                    <th key={m} className={`${th} min-w-[120px] text-center ${m === mesHoy ? 'bg-[#2F4A3C]' : ''}`}>{mesCorto(m)}</th>
                  ))}
                  <th className={`${th} min-w-[100px] text-right`}>Saldo vencido</th>
                  <th className={`${th} min-w-[220px]`}>Seguimiento</th>
                  <th className={`${th} min-w-[200px]`}>Próxima acción</th>
                  <th className={`${th} min-w-[130px]`}>Responsable</th>
                  <th className={`${th} min-w-[130px]`}>Para el</th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map(({ a, cuotas, alerta }, i) => {
                  const esq = esquemaDeAlquiler(a)
                  const saldo = saldoDe(a.id, cuotas)
                  const fondo = i % 2 ? 'bg-panelalt' : 'bg-white'
                  return (
                    <tr key={a.id} className={`${fondo} align-top border-t border-line`}>
                      <td className={`px-2 py-1.5 sticky left-0 z-10 ${fondo} border-r border-line`}>
                        <div className="font-semibold text-ink">{nombreUni(a.unidadId) || '—'}</div>
                        <div className="text-[10px] text-inksoft">{nombreProp(a.propiedadId)}</div>
                        {alerta && <div className="text-[10px] text-[#8A5A0B] mt-0.5">⚠ alerta: {alerta.etiquetaMes}</div>}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input value={valor(a, 'inquilinoNombre')} onChange={(e) => editar(a, 'inquilinoNombre', e.target.value)} className={`${inp} ${cambiado(a, 'inquilinoNombre')}`} />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input value={valor(a, 'inquilinoTelefono')} onChange={(e) => editar(a, 'inquilinoTelefono', e.target.value)} className={`${inp} ${cambiado(a, 'inquilinoTelefono')}`} />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <select value={valor(a, 'administradorUid')} onChange={(e) => editar(a, 'administradorUid', e.target.value)} className={`${inp} ${cambiado(a, 'administradorUid')}`}>
                          {!a.administradorUid && <option value="">—</option>}
                          {datos.miembros.map((m) => <option key={m.uid} value={m.uid}>{m.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5 py-1.5">
                        {esq && esq.tramos.length === 1 ? (
                          <input type="number" value={valor(a, 'canon')} onChange={(e) => editar(a, 'canon', e.target.value)} className={`${inp} text-right ${cambiado(a, 'canon')}`} />
                        ) : (
                          <a href="/alquileres" title="Canon escalonado: se edita en Alquileres → Editar plan de pago" className="text-[11px] text-ink underline whitespace-nowrap">
                            {esq?.tramos.map((t) => formatoBs(t.monto).replace(/^\S+ /, '')).join(' → ')}
                          </a>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input type="number" min={1} max={28} value={valor(a, 'diaCobro')} onChange={(e) => editar(a, 'diaCobro', e.target.value)} className={`${inp} text-center ${cambiado(a, 'diaCobro')}`} />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input type="date" value={valor(a, 'fechaFin')} onChange={(e) => editar(a, 'fechaFin', e.target.value)} className={`${inp} ${cambiado(a, 'fechaFin')}`} />
                      </td>
                      <td className="px-1.5 py-1.5">
                        <select value={valor(a, 'estado')} onChange={(e) => editar(a, 'estado', e.target.value)} className={`${inp} ${cambiado(a, 'estado')}`}>
                          <option value="activo">Activo</option>
                          <option value="finalizado">Finalizado</option>
                          <option value="rescindido">Rescindido</option>
                        </select>
                      </td>

                      {meses.map((m) => {
                        const c = cuotas.find((x: any) => x.mes === m)
                        if (!c) return <td key={m} className="px-1.5 py-1.5 text-center text-[10px] text-inksoft">—</td>
                        const k = `${a.id}|${m}`
                        const ed = cobros[k]
                        const v = ed ? Number(ed.valor) || 0 : c.pagado
                        const completo = v >= c.monto - 0.009
                        const parcialNuevo = ed && v > c.pagado + 0.009 && !completo
                        const color = completo ? 'bg-[#E8F3EC] border-[#9CCBB0]' : v > 0 ? 'bg-[#FBF4E4] border-ocre' : c.vencida ? 'bg-[#FBEDEA] border-[#E5A99C]' : 'bg-white border-line'
                        return (
                          <td key={m} className="px-1.5 py-1.5">
                            <div className={`rounded border px-1.5 py-1 ${color} ${ed ? 'ring-2 ring-ocre' : ''}`}>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={ed ? ed.valor : c.pagado ? String(c.pagado) : ''}
                                  placeholder="0"
                                  onChange={(e) => celdaCobro(a.id, m, { valor: e.target.value }, c.pagado)}
                                  className="w-full min-w-0 px-1 py-0.5 rounded border border-line bg-white text-right text-xs text-ink"
                                  aria-label={`Cobrado ${mesCorto(m)} ${a.inquilinoNombre}`}
                                />
                                {!completo && (
                                  <button type="button" title="Pagó todo" onClick={() => celdaCobro(a.id, m, { valor: String(c.monto) }, c.pagado)} className="shrink-0 px-1 rounded text-verde font-bold hover:bg-white">
                                    ✓
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-inksoft mt-0.5 whitespace-nowrap">
                                de {formatoBs(c.monto).replace(/^\S+ /, '')}
                                {!completo && c.vencida ? ` · ${c.diasAtraso}d` : ''}
                              </div>
                              {parcialNuevo && (
                                <input
                                  value={ed!.motivo}
                                  onChange={(e) => celdaCobro(a.id, m, { motivo: e.target.value }, c.pagado)}
                                  placeholder="¿Por qué no pagó todo?"
                                  className="mt-1 w-full px-1 py-0.5 rounded border border-ocre bg-white text-[11px] text-ink"
                                />
                              )}
                            </div>
                          </td>
                        )
                      })}

                      <td className={`px-2 py-1.5 text-right font-semibold whitespace-nowrap ${saldo > 0 ? 'text-rojo' : 'text-verde'}`}>{saldo > 0 ? formatoBs(saldo) : '✓ al día'}</td>
                      <td className="px-1.5 py-1.5">
                        <textarea value={valor(a, 'seguimiento')} onChange={(e) => editar(a, 'seguimiento', e.target.value)} rows={2} placeholder="Situación, lo que se habló..." className={`${inp} ${cambiado(a, 'seguimiento')}`} />
                        {(a.historialSeguimiento || []).length > 0 && (
                          <details className="mt-0.5">
                            <summary className="text-[10px] text-inksoft cursor-pointer">historial ({a.historialSeguimiento.length})</summary>
                            <ul className="m-0 pl-3 text-[10px] text-inksoft max-w-[260px]">
                              {[...a.historialSeguimiento].reverse().slice(0, 8).map((h: any, j: number) => (
                                <li key={j}>{fechaCorta(String(h.fecha).slice(0, 10))} · {h.porNombre}: {h.texto}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5">
                        <div className="flex items-start gap-1">
                          <input type="checkbox" checked={valor(a, 'accionHecha')} onChange={(e) => editar(a, 'accionHecha', e.target.checked)} title="Hecha" className="mt-1.5" disabled={!valor(a, 'proximaAccion')} />
                          <textarea value={valor(a, 'proximaAccion')} onChange={(e) => editar(a, 'proximaAccion', e.target.value)} rows={2} placeholder="Ej: llamar para acordar fecha" className={`${inp} ${cambiado(a, 'proximaAccion')} ${valor(a, 'accionHecha') ? 'line-through text-inksoft' : ''}`} />
                        </div>
                      </td>
                      <td className="px-1.5 py-1.5">
                        <select value={valor(a, 'accionResponsable')} onChange={(e) => editar(a, 'accionResponsable', e.target.value)} className={`${inp} ${cambiado(a, 'accionResponsable')}`}>
                          <option value="">—</option>
                          {datos.miembros.map((m) => <option key={m.uid} value={m.nombre}>{m.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5 py-1.5">
                        <input
                          type="date"
                          value={valor(a, 'accionFecha')}
                          onChange={(e) => editar(a, 'accionFecha', e.target.value)}
                          className={`${inp} ${cambiado(a, 'accionFecha')} ${valor(a, 'accionFecha') && valor(a, 'accionFecha') < hoy && !valor(a, 'accionHecha') ? 'text-rojo' : ''}`}
                        />
                      </td>
                    </tr>
                  )
                })}

                {/* Filas nuevas */}
                {nuevas.map((n) => (
                  <tr key={n.key} className="bg-[#EEF6F1] align-top border-t border-line">
                    <td className="px-1.5 py-1.5 sticky left-0 z-10 bg-[#EEF6F1] border-r border-line">
                      <select value={n.unidadId} onChange={(e) => editarNueva(n.key, 'unidadId', e.target.value)} className={`${inp} bg-white border-verde`}>
                        <option value="">— Departamento libre —</option>
                        {unidadesLibres.map((u) => <option key={u.id} value={u.id}>{nombreProp(u.propiedadId)} — {u.nombre}</option>)}
                      </select>
                      <div className="text-[10px] text-verde mt-0.5 font-semibold">NUEVO</div>
                      {n.aviso && <div className="text-[10px] text-rojo">{n.aviso}</div>}
                    </td>
                    <td className="px-1.5 py-1.5">
                      <input value={n.inquilinoNombre} onChange={(e) => editarNueva(n.key, 'inquilinoNombre', e.target.value)} placeholder="Nombre" className={`${inp} bg-white border-verde`} />
                      <input value={n.inquilinoCI} onChange={(e) => editarNueva(n.key, 'inquilinoCI', e.target.value)} placeholder="C.I." className={`${inp} bg-white border-verde mt-1`} />
                    </td>
                    <td className="px-1.5 py-1.5"><input value={n.inquilinoTelefono} onChange={(e) => editarNueva(n.key, 'inquilinoTelefono', e.target.value)} className={`${inp} bg-white border-verde`} /></td>
                    <td className="px-1.5 py-1.5">
                      <select value={n.administradorUid} onChange={(e) => editarNueva(n.key, 'administradorUid', e.target.value)} className={`${inp} bg-white border-verde`}>
                        <option value="">—</option>
                        {datos.miembros.map((m) => <option key={m.uid} value={m.uid}>{m.nombre}</option>)}
                      </select>
                    </td>
                    <td className="px-1.5 py-1.5"><input type="number" value={n.canon} onChange={(e) => editarNueva(n.key, 'canon', e.target.value)} className={`${inp} bg-white border-verde text-right`} /></td>
                    <td className="px-1.5 py-1.5"><input type="number" value={n.diaCobro} onChange={(e) => editarNueva(n.key, 'diaCobro', e.target.value)} className={`${inp} bg-white border-verde text-center`} /></td>
                    <td className="px-1.5 py-1.5">
                      <div className="text-[10px] text-inksoft">inicio</div>
                      <input type="date" value={n.fechaInicio} onChange={(e) => editarNueva(n.key, 'fechaInicio', e.target.value)} className={`${inp} bg-white border-verde`} />
                      <div className="text-[10px] text-inksoft mt-1">fin</div>
                      <input type="date" value={n.fechaFin} onChange={(e) => editarNueva(n.key, 'fechaFin', e.target.value)} className={`${inp} bg-white border-verde`} />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <button onClick={() => setNuevas((p) => p.filter((x) => x.key !== n.key))} className="text-[11px] text-rojo underline">Quitar</button>
                    </td>
                    <td colSpan={meses.length + 5} className="px-2 py-1.5 text-[11px] text-inksoft">Se crea al guardar. El plan de pago empieza con canon fijo; si es escalonado, ajustalo después en Alquileres.</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ink text-white font-semibold">
                  <td className="px-2 py-2 sticky left-0 z-10 bg-ink">Totales ({filasVisibles.length})</td>
                  <td colSpan={7} />
                  {totales.map((t) => (
                    <td key={t.m} className="px-2 py-2 text-center whitespace-nowrap">
                      <div>{formatoBs(t.cobrado)}</div>
                      <div className="text-[10px] font-normal text-white/70">de {formatoBs(t.corresponde)}</div>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right whitespace-nowrap">{formatoBs(filasVisibles.reduce((s, f) => s + saldoDe(f.a.id, f.cuotas), 0))}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex gap-2 flex-wrap mt-3">
            <button onClick={agregarFila} className="min-h-[38px] px-3 rounded-lg border border-verde bg-white font-body text-xs text-verde font-semibold">+ Agregar alquiler</button>
            <button onClick={() => setPegando((v) => !v)} className="min-h-[38px] px-3 rounded-lg border border-line bg-white font-body text-xs text-ink">
              {pegando ? 'Cerrar' : 'Pegar varios alquileres desde Excel'}
            </button>
          </div>
          {pegando && (
            <div className="mt-2 bg-panel border border-line rounded-xl p-3">
              <div className="font-body text-[11px] text-inksoft mb-1">
                Copiá desde Excel o Sheets con la fila de títulos. Columnas que reconozco: departamento, inquilino, C.I., teléfono, canon, inicio, fin, día de pago, administra. Se agregan como filas nuevas para revisar antes de guardar.
              </div>
              <textarea value={textoPegado} onChange={(e) => setTextoPegado(e.target.value)} rows={5} className="w-full px-3 py-2 rounded-lg border border-line font-body text-xs" placeholder={'departamento\tinquilino\tci\ttelefono\tcanon\tinicio\tfin\tdia de pago\tadministra\n2.º piso\tWilly Aleman\t4018463\t72400000\t2300\t21/09/2026\t21/09/2027\t5\tMarcelo'} />
              <button onClick={leerPegado} disabled={!textoPegado.trim()} className="mt-1 px-3 py-1.5 rounded-lg bg-ink text-white font-body text-xs font-semibold disabled:opacity-50">Agregar a la planilla</button>
            </div>
          )}

          <div className="font-body text-[11px] text-inksoft mt-4 leading-relaxed">
            <b>Cómo cargar cobros:</b> en la columna de cada mes escribí el total que lleva pagado ese mes (o tocá ✓ si pagó todo). Se registra como ingreso solo la diferencia, con la fecha elegida arriba. Si queda por debajo de lo que corresponde, escribí el motivo: se crea la alerta para la reunión familiar. Verde = pagado, amarillo = parcial, rojo = vencido sin pagar.
          </div>
        </>
      )}
    </PaginaProtegida>
  )
}
