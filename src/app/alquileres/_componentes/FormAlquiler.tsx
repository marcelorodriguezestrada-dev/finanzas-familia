'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { subirArchivo } from '@/lib/subirArchivo'
import { detectarVariacion } from '@/data/inmuebles'
import { CLAUSULAS_DISPONIBLES, CLAUSULAS_POR_DEFECTO, ClausulaId } from '@/lib/plantillaContrato'
import { EscanerCedula } from '@/components/EscanerCedula'

type ClausulaExtra = { titulo: string; texto: string }
type Plantilla = { id: string; nombre: string; clausulas: ClausulaExtra[] }
type PersonaForm = { nombre: string; ci: string }

function bs(n: number) {
  return 'Bs ' + n.toLocaleString('es-BO', { minimumFractionDigits: 0 })
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}

export function FormAlquiler({
  unidad,
  propiedad,
  miembros,
  onGuardado,
}: {
  unidad: any
  propiedad: any
  miembros: any[]
  onGuardado: () => void
}) {
  const { obtenerToken, perfil, usuario } = useAuth()

  const [inquilinoNombre, setInquilinoNombre] = useState('')
  const [inquilinoCI, setInquilinoCI] = useState('')
  const [inquilinoTelefono, setInquilinoTelefono] = useState('')
  const [inquilinoDireccionAnterior, setInquilinoDireccionAnterior] = useState('')
  // Inquilinos adicionales, solo para el contrato en PDF (el registro
  // del alquiler en la base sigue guardando un único inquilino
  // principal — inquilinoNombre/inquilinoCI arriba — para no romper
  // el resto de la app, que asume un inquilino por alquiler).
  const [inquilinosExtra, setInquilinosExtra] = useState<PersonaForm[]>([])
  // Propietarios firmantes del contrato. Arranca con todos los
  // miembros de la familia tildados (así el contrato sale con todos
  // los dueños listos para firmar), pero se pueden destildar o
  // completar su C.I.
  const [propietariosSeleccion, setPropietariosSeleccion] = useState<Record<string, { incluido: boolean; ci: string }>>({})
  const [montoMensual, setMontoMensual] = useState(unidad.canonEstandar?.toString() || '')
  const [anticipo, setAnticipo] = useState('')
  const [diaCobro, setDiaCobro] = useState('1')
  const [fechaInicio, setFechaInicio] = useState(hoyISO())
  const [fechaFin, setFechaFin] = useState('')
  const [administradorUid, setAdministradorUid] = useState(usuario?.uid || '')

  const [contratoFile, setContratoFile] = useState<File | null>(null)
  const [contratoUrl, setContratoUrl] = useState('')
  const [subiendoContrato, setSubiendoContrato] = useState(false)
  const [generandoContrato, setGenerandoContrato] = useState(false)

  // Checklist de cláusulas del contrato, en base a la plantilla
  // estándar interna. Por defecto van todas tildadas.
  const [clausulasElegidas, setClausulasElegidas] = useState<Set<ClausulaId>>(new Set(CLAUSULAS_POR_DEFECTO))
  const [clausulasExtra, setClausulasExtra] = useState<ClausulaExtra[]>([])
  const [pedidoIA, setPedidoIA] = useState('')
  const [redactandoIA, setRedactandoIA] = useState(false)
  const [mostrarClausulas, setMostrarClausulas] = useState(false)

  // Plantillas de contrato subidas por la familia (ver
  // /plantillas-contrato): cada una trae sus propias cláusulas ya
  // extraídas por IA, que se pueden elegir igual que las estándar.
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [cargandoPlantillas, setCargandoPlantillas] = useState(true)
  // ids con formato "plantillaId::índice" de las cláusulas de
  // plantilla que el usuario tildó.
  const [clausulasPlantillaElegidas, setClausulasPlantillaElegidas] = useState<Set<string>>(new Set())

  // Importar datos de un contrato viejo ya firmado (PDF), para
  // precargar el formulario en vez de tipear todo de nuevo. La
  // propiedad/unidad la sigue eligiendo el usuario a mano — este
  // botón solo completa inquilinos, propietarios, montos, fechas y
  // el checklist de cláusulas detectadas.
  const [importandoContrato, setImportandoContrato] = useState(false)
  const [avisoImportacion, setAvisoImportacion] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const token = await obtenerToken()
        const res = await fetch('/api/plantillas-contrato', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        setPlantillas(data.plantillas || [])
      } finally {
        setCargandoPlantillas(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Por defecto, todos los miembros de la familia aparecen tildados
  // como propietarios firmantes del contrato.
  useEffect(() => {
    setPropietariosSeleccion((prev) => {
      const next = { ...prev }
      for (const m of miembros) {
        if (!next[m.uid]) next[m.uid] = { incluido: true, ci: '' }
      }
      return next
    })
  }, [miembros])

  function toggleClausulaPlantilla(clave: string) {
    setClausulasPlantillaElegidas((prev) => {
      const next = new Set(prev)
      if (next.has(clave)) next.delete(clave)
      else next.add(clave)
      return next
    })
  }

  function toggleClausula(id: ClausulaId) {
    setClausulasElegidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePropietario(uid: string) {
    setPropietariosSeleccion((prev) => ({ ...prev, [uid]: { ...prev[uid], incluido: !prev[uid]?.incluido } }))
  }

  function setCIPropietario(uid: string, ci: string) {
    setPropietariosSeleccion((prev) => ({ ...prev, [uid]: { ...prev[uid], ci } }))
  }

  function agregarInquilinoExtra() {
    setInquilinosExtra((prev) => [...prev, { nombre: '', ci: '' }])
  }

  function actualizarInquilinoExtra(i: number, campo: 'nombre' | 'ci', valor: string) {
    setInquilinosExtra((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)))
  }

  function quitarInquilinoExtra(i: number) {
    setInquilinosExtra((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function importarContratoViejo(archivo: File) {
    setImportandoContrato(true)
    setAvisoImportacion('')
    setError('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(archivo)
      })

      const token = await obtenerToken()
      const res = await fetch('/api/importar-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pdfBase64: base64 }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)

      // Precarga todos los campos con lo que la IA pudo extraer. El
      // usuario revisa y corrige antes de guardar — nada se guarda
      // automáticamente acá.
      if (data.inquilinos?.length > 0) {
        setInquilinoNombre(data.inquilinos[0].nombre || '')
        setInquilinoCI(data.inquilinos[0].ci || '')
        setInquilinosExtra(data.inquilinos.slice(1).map((p: PersonaForm) => ({ nombre: p.nombre || '', ci: p.ci || '' })))
      }
      if (data.propietarios?.length > 0) {
        // Solo marca/completa la C.I. de los propietarios que ya
        // coinciden por nombre con un miembro de la familia; no
        // agrega gente nueva a la lista de miembros.
        setPropietariosSeleccion((prev) => {
          const next = { ...prev }
          for (const m of miembros) {
            const match = data.propietarios.find(
              (p: PersonaForm) => p.nombre?.trim().toLowerCase() === m.nombre?.trim().toLowerCase()
            )
            if (match?.ci) next[m.uid] = { incluido: true, ci: match.ci }
          }
          return next
        })
      }
      if (data.inquilinoTelefono) setInquilinoTelefono(data.inquilinoTelefono)
      if (data.montoMensual) setMontoMensual(String(data.montoMensual))
      if (data.anticipo) setAnticipo(String(data.anticipo))
      if (data.diaCobro) setDiaCobro(String(data.diaCobro))
      if (data.fechaInicio) setFechaInicio(data.fechaInicio)
      if (data.fechaFin) setFechaFin(data.fechaFin)
      if (data.clausulasDetectadas?.length > 0) {
        setClausulasElegidas((prev) => new Set([...Array.from(prev), ...data.clausulasDetectadas]))
        setMostrarClausulas(true)
      }

      setAvisoImportacion(
        `Se precargaron los datos del contrato${data.direccionMencionada ? ` (menciona: "${data.direccionMencionada}")` : ''}. Elegí la propiedad y unidad correspondiente abajo, y revisá todo antes de guardar.`
      )
    } catch (err: any) {
      setError(err.message || 'No se pudo importar el contrato.')
    } finally {
      setImportandoContrato(false)
    }
  }

  async function pedirClausulaIA() {
    if (!pedidoIA.trim()) return
    setRedactandoIA(true)
    setError('')
    try {
      const token = await obtenerToken()
      // Si el usuario ya tildó cláusulas de alguna plantilla propia,
      // se usan esas como referencia de estilo para que la redacción
      // suene parecida a los contratos reales de la familia.
      const plantillaIds = Array.from(new Set(Array.from(clausulasPlantillaElegidas).map((c) => c.split('::')[0])))
      const res = await fetch('/api/redactar-clausula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ descripcion: pedidoIA, plantillaIds }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      setClausulasExtra((prev) => [...prev, { titulo: data.titulo, texto: data.texto }])
      setPedidoIA('')
    } catch (err: any) {
      setError(err.message || 'No se pudo redactar la cláusula.')
    } finally {
      setRedactandoIA(false)
    }
  }

  function quitarClausulaExtra(i: number) {
    setClausulasExtra((prev) => prev.filter((_, idx) => idx !== i))
  }

  function actualizarClausulaExtra(i: number, campo: 'titulo' | 'texto', valor: string) {
    setClausulasExtra((prev) => prev.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)))
  }

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const variacionPreview = montoMensual ? detectarVariacion(Number(montoMensual), Number(unidad.canonEstandar || 0)) : null

  async function generarContratoPDF() {
    setError('')
    if (!inquilinoNombre.trim() || !inquilinoCI.trim() || !montoMensual) {
      setError('Completá al menos nombre, C.I. y monto mensual antes de generar el contrato.')
      return
    }
    setGenerandoContrato(true)
    try {
      const administradorNombre = miembros.find((m) => m.uid === administradorUid)?.nombre || perfil?.nombre || ''
      const token = await obtenerToken()

      // Propietarios firmantes: los miembros tildados, con su C.I. si
      // se completó (si no, van sin C.I. en el documento).
      const propietarios: PersonaForm[] = miembros
        .filter((m) => propietariosSeleccion[m.uid]?.incluido)
        .map((m) => ({ nombre: m.nombre, ci: propietariosSeleccion[m.uid]?.ci || '' }))

      // Inquilinos: el principal (nombre/CI de arriba) más los
      // adicionales que se hayan cargado.
      const inquilinos: PersonaForm[] = [
        { nombre: inquilinoNombre, ci: inquilinoCI },
        ...inquilinosExtra.filter((p) => p.nombre.trim() || p.ci.trim()),
      ]

      // Cláusulas de plantillas propias que el usuario tildó, resueltas
      // a su título+texto real, en el mismo orden en que las tildó.
      const clausulasDePlantillas: ClausulaExtra[] = Array.from(clausulasPlantillaElegidas)
        .map((clave) => {
          const [plantillaId, indiceStr] = clave.split('::')
          const plantilla = plantillas.find((p) => p.id === plantillaId)
          return plantilla?.clausulas?.[Number(indiceStr)]
        })
        .filter((c): c is ClausulaExtra => !!c)

      const res = await fetch('/api/generar-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          propiedadNombre: propiedad.nombre,
          propiedadDireccion: propiedad.direccion || '',
          unidadNombre: unidad.nombre,
          unidadTipo: unidad.tipo,
          propietarios,
          inquilinos,
          inquilinoTelefono,
          inquilinoDireccionAnterior,
          montoMensual: Number(montoMensual),
          anticipo: anticipo ? Number(anticipo) : null,
          diaCobro: Number(diaCobro),
          fechaInicio,
          fechaFin: fechaFin || null,
          administradorNombre,
          clausulasSeleccionadas: Array.from(clausulasElegidas),
          clausulasExtra: [...clausulasDePlantillas, ...clausulasExtra],
        }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)

      // Descarga directa del PDF generado, para imprimir y firmar.
      const bytes = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contrato-${unidad.nombre.replace(/\s+/g, '-')}-${inquilinoNombre.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'No se pudo generar el contrato.')
    } finally {
      setGenerandoContrato(false)
    }
  }

  async function subirContratoFirmado() {
    if (!contratoFile) return
    setSubiendoContrato(true)
    setError('')
    try {
      const url = await subirArchivo(contratoFile, obtenerToken)
      setContratoUrl(url)
    } catch (err: any) {
      setError(err.message || 'No se pudo subir el contrato.')
    } finally {
      setSubiendoContrato(false)
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!inquilinoNombre.trim() || !inquilinoCI.trim()) return setError('Faltan datos del inquilino (nombre y C.I.).')
    if (!montoMensual || Number(montoMensual) <= 0) return setError('Cargá el monto mensual acordado.')
    if (!administradorUid) return setError('Indicá quién de la familia administra este espacio.')
    // Subir el contrato firmado ya no es obligatorio: se puede
    // registrar el alquiler y subirlo (o modificarlo) más adelante.

    setGuardando(true)
    try {
      const administradorNombre = miembros.find((m) => m.uid === administradorUid)?.nombre || ''
      const token = await obtenerToken()
      const res = await fetch('/api/alquileres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          unidadId: unidad.id,
          inquilinoNombre, inquilinoCI, inquilinoTelefono, inquilinoDireccionAnterior,
          montoMensual, anticipo: anticipo || null, diaCobro, fechaInicio, fechaFin: fechaFin || null,
          administradorUid, administradorNombre, contratoUrl,
        }),
      })
      const data = await res.json()
      if (data.error) return setError(data.error)
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="bg-panel border border-line rounded-xl p-5 mb-6">
      <div className="border border-line rounded-lg p-3 mb-5 bg-white/50">
        <div className="font-body text-sm font-semibold text-ink mb-1">¿Ya tenés un contrato viejo firmado para este alquiler?</div>
        <div className="font-body text-[11px] text-inksoft mb-2">
          Subí el PDF y la IA precarga inquilinos, propietarios, montos, fechas y cláusulas — vos elegís la propiedad/unidad y revisás todo antes de guardar.
        </div>
        <input
          type="file"
          accept="application/pdf"
          disabled={importandoContrato}
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo) importarContratoViejo(archivo)
          }}
          className="w-full font-body text-xs"
        />
        {importandoContrato && <div className="font-body text-[11px] text-inksoft mt-2">Leyendo el contrato con IA...</div>}
        {avisoImportacion && <div className="font-body text-[11px] text-verde mt-2">{avisoImportacion}</div>}
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Datos del inquilino</div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <input value={inquilinoNombre} onChange={(e) => setInquilinoNombre(e.target.value)} placeholder="Nombre completo" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        <input value={inquilinoCI} onChange={(e) => setInquilinoCI(e.target.value)} placeholder="C.I." className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <input value={inquilinoTelefono} onChange={(e) => setInquilinoTelefono(e.target.value)} placeholder="Teléfono (opcional)" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        <input value={inquilinoDireccionAnterior} onChange={(e) => setInquilinoDireccionAnterior(e.target.value)} placeholder="Dirección anterior (opcional)" className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
      </div>
      <div className="mb-3">
        <EscanerCedula
          onDatosDetectados={(datos) => {
            if (datos.nombre) setInquilinoNombre(datos.nombre)
            if (datos.ci) setInquilinoCI(datos.ci)
          }}
        />
      </div>

      {inquilinosExtra.map((p, i) => (
        <div key={i} className="mb-3 border-t border-line pt-3">
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mb-2">
            <input
              value={p.nombre}
              onChange={(e) => actualizarInquilinoExtra(i, 'nombre', e.target.value)}
              placeholder="Nombre completo (co-inquilino)"
              className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm"
            />
            <input
              value={p.ci}
              onChange={(e) => actualizarInquilinoExtra(i, 'ci', e.target.value)}
              placeholder="C.I."
              className="px-3.5 py-2.5 rounded-lg border border-line font-body text-sm"
            />
            <button type="button" onClick={() => quitarInquilinoExtra(i)} className="font-body text-xs text-rojo px-2">
              Quitar
            </button>
          </div>
          <EscanerCedula
            onDatosDetectados={(datos) => {
              if (datos.nombre) actualizarInquilinoExtra(i, 'nombre', datos.nombre)
              if (datos.ci) actualizarInquilinoExtra(i, 'ci', datos.ci)
            }}
          />
        </div>
      ))}
      <button type="button" onClick={agregarInquilinoExtra} className="font-body text-[11px] text-ink underline mb-4">
        + Agregar otro inquilino (para el contrato, ej. pareja o familiar que también firma)
      </button>


      <div className="font-body text-sm font-semibold text-ink mb-1">Condiciones de pago</div>
      <div className="grid sm:grid-cols-3 gap-3 mb-1">
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Monto mensual (Bs)</label>
          <input value={montoMensual} onChange={(e) => setMontoMensual(e.target.value)} type="number" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Anticipo / garantía (opcional)</label>
          <input value={anticipo} onChange={(e) => setAnticipo(e.target.value)} type="number" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Día de cobro</label>
          <input value={diaCobro} onChange={(e) => setDiaCobro(e.target.value)} type="number" min={1} max={31} className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
      </div>

      {variacionPreview && (
        <div className={`font-body text-[11px] mt-1.5 mb-3 ${variacionPreview.esMenor ? 'text-amber-600' : 'text-verde'}`}>
          ⚠ {variacionPreview.texto} (canon: {bs(Number(unidad.canonEstandar))})
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-4 mt-3">
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Fecha de inicio</label>
          <input value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} type="date" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
        <div>
          <label className="font-body text-[11px] text-inksoft block mb-1">Vencimiento del contrato (opcional)</label>
          <input value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} type="date" className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm" />
        </div>
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Administración</div>
      <select value={administradorUid} onChange={(e) => setAdministradorUid(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-line font-body text-sm bg-white mb-4">
        <option value="">Quién de la familia administra este espacio</option>
        {miembros.map((m) => (
          <option key={m.uid} value={m.uid}>{m.nombre}</option>
        ))}
      </select>

      <div className="font-body text-sm font-semibold text-ink mb-1">Propietarios firmantes del contrato</div>
      <div className="font-body text-[11px] text-inksoft mb-2">
        Tildá quiénes de la familia figuran como propietarios en el contrato (podés completar su C.I. para que salga en la firma).
      </div>
      <div className="mb-4">
        {miembros.map((m) => (
          <div key={m.uid} className="flex items-center gap-2 py-1">
            <label className="flex items-center gap-2 font-body text-xs text-ink flex-1">
              <input
                type="checkbox"
                checked={propietariosSeleccion[m.uid]?.incluido ?? true}
                onChange={() => togglePropietario(m.uid)}
              />
              {m.nombre}
            </label>
            {propietariosSeleccion[m.uid]?.incluido && (
              <input
                value={propietariosSeleccion[m.uid]?.ci || ''}
                onChange={(e) => setCIPropietario(m.uid, e.target.value)}
                placeholder="C.I. (opcional)"
                className="w-32 px-2.5 py-1.5 rounded-lg border border-line font-body text-xs"
              />
            )}
          </div>
        ))}
      </div>

      <div className="font-body text-sm font-semibold text-ink mb-1">Contrato</div>

      <button
        type="button"
        onClick={() => setMostrarClausulas((v) => !v)}
        className="w-full flex items-center justify-between py-2 px-1 font-body text-xs text-inksoft mb-2"
      >
        <span>Cláusulas a incluir en el contrato</span>
        <span>{mostrarClausulas ? '▲ ocultar' : '▼ elegir'}</span>
      </button>

      {mostrarClausulas && (
        <div className="border border-line rounded-lg p-3 mb-3 bg-white/50">
          <div className="font-body text-[11px] text-inksoft mb-2">
            Basado en el formato de contrato privado de alquiler de la familia (con cita al Art. 519 del Código Civil). Destildá lo que no aplique.
          </div>
          {CLAUSULAS_DISPONIBLES.map((c) => (
            <label key={c.id} className="flex items-start gap-2 py-1 font-body text-xs text-ink">
              <input
                type="checkbox"
                checked={clausulasElegidas.has(c.id)}
                disabled={c.obligatoria}
                onChange={() => toggleClausula(c.id)}
                className="mt-0.5"
              />
              <span className={c.obligatoria ? 'text-inksoft' : ''}>
                {c.numero ? `${c.numero}. ` : ''}{c.titulo}{c.obligatoria ? ' (siempre incluida)' : ''}
              </span>
            </label>
          ))}

          <div className="border-t border-line mt-3 pt-3">
            <div className="font-body text-[11px] font-semibold text-ink mb-1.5">
              Cláusulas de plantillas propias{' '}
              <a href="/plantillas-contrato" target="_blank" className="font-normal text-inksoft underline">
                (gestionar plantillas)
              </a>
            </div>

            {cargandoPlantillas && <div className="font-body text-[11px] text-inksoft mb-2">Cargando plantillas...</div>}
            {!cargandoPlantillas && plantillas.length === 0 && (
              <div className="font-body text-[11px] text-inksoft mb-2">
                Todavía no subiste contratos de ejemplo. Subí uno en "Plantillas de contrato" y sus cláusulas van a aparecer acá.
              </div>
            )}

            {plantillas.map((p) => (
              <div key={p.id} className="mb-2.5">
                <div className="font-body text-[11px] font-semibold text-inksoft mb-1">{p.nombre}</div>
                {p.clausulas.map((c, i) => {
                  const clave = `${p.id}::${i}`
                  return (
                    <label key={clave} className="flex items-start gap-2 py-0.5 font-body text-xs text-ink">
                      <input
                        type="checkbox"
                        checked={clausulasPlantillaElegidas.has(clave)}
                        onChange={() => toggleClausulaPlantilla(clave)}
                        className="mt-0.5"
                      />
                      <span>{c.titulo}</span>
                    </label>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="border-t border-line mt-3 pt-3">
            <div className="font-body text-[11px] font-semibold text-ink mb-1.5">Cláusulas adicionales</div>

            {clausulasExtra.map((c, i) => (
              <div key={i} className="border border-line rounded-lg p-2.5 mb-2 bg-white">
                <div className="flex items-center justify-between mb-1.5">
                  <input
                    value={c.titulo}
                    onChange={(e) => actualizarClausulaExtra(i, 'titulo', e.target.value)}
                    className="font-body text-[11px] font-semibold text-ink bg-transparent border-none flex-1 outline-none"
                  />
                  <button type="button" onClick={() => quitarClausulaExtra(i)} className="font-body text-[11px] text-rojo shrink-0">
                    Quitar
                  </button>
                </div>
                <textarea
                  value={c.texto}
                  onChange={(e) => actualizarClausulaExtra(i, 'texto', e.target.value)}
                  rows={3}
                  className="w-full px-2 py-1.5 rounded border border-line font-body text-xs"
                />
              </div>
            ))}

            <div className="flex gap-2">
              <input
                value={pedidoIA}
                onChange={(e) => setPedidoIA(e.target.value)}
                placeholder="Describí lo que querés pactar y la IA redacta la cláusula (ej: se permiten mascotas)"
                className="flex-1 px-2.5 py-2 rounded-lg border border-line font-body text-xs"
              />
              <button
                type="button"
                onClick={pedirClausulaIA}
                disabled={!pedidoIA.trim() || redactandoIA}
                className="px-3 py-1.5 rounded-lg border border-line font-body text-xs text-ink disabled:opacity-50 shrink-0"
              >
                {redactandoIA ? 'Redactando...' : '✨ Redactar con IA'}
              </button>
            </div>
          </div>
        </div>
      )}

      <button type="button" onClick={generarContratoPDF} disabled={generandoContrato} className="w-full py-2.5 rounded-lg border border-line font-body text-sm text-ink mb-3 disabled:opacity-60">
        {generandoContrato ? 'Generando...' : '📄 Generar contrato automáticamente (PDF para imprimir y firmar)'}
      </button>

      <label className="font-body text-[11px] text-inksoft block mb-1">Subir el contrato ya firmado (imagen o PDF) — opcional</label>
      <div className="flex gap-2 mb-4">
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setContratoFile(e.target.files?.[0] || null)} className="flex-1 font-body text-xs" />
        <button type="button" onClick={subirContratoFirmado} disabled={!contratoFile || subiendoContrato} className="px-3 py-1.5 rounded-lg border border-line font-body text-xs text-ink disabled:opacity-50">
          {subiendoContrato ? 'Subiendo...' : 'Subir'}
        </button>
      </div>
      {contratoUrl && <div className="font-body text-[11px] text-verde mb-3">✓ Contrato subido correctamente.</div>}
      {!contratoUrl && (
        <div className="font-body text-[11px] text-inksoft mb-3">
          Podés registrar el alquiler sin subir el contrato ahora y subirlo más adelante.
        </div>
      )}

      {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}

      <button type="submit" disabled={guardando} className="w-full py-2.5 rounded-lg border-none bg-ink text-white font-body text-sm font-semibold disabled:opacity-60">
        {guardando ? 'Registrando...' : 'Registrar alquiler'}
      </button>
    </form>
  )
}
