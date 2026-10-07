'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { PaginaProtegida } from '@/components/PaginaProtegida'
import { mesActual } from '@/data/categorias'
import { armarInforme, textoWhatsApp, sumarMesClave } from '@/lib/informe'
import { etiquetaMes, formatoBs, fechaCorta } from '@/lib/esquemaPago'
import { InformeSimple } from './_componentes/InformeSimple'
import { Liquidacion, DatosPago } from './_componentes/Liquidacion'
import { Recibo } from './_componentes/Recibo'
import { useEspacio } from '@/lib/espacioCliente'

type Vista = 'simple' | 'liquidacion'
const CLAVE_PAGO = 'informe:datosPago'

// Informe mensual: la vista simple para toda la familia y la
// liquidación estilo expensas (con avisos por inquilino y recibos).
// Todo se calcula en el navegador con lo que ya está cargado; "PDF" usa
// la impresión del navegador (Guardar como PDF), con hojas A4.
export default function InformePage() {
  const { obtenerToken, perfil } = useAuth()
  const { esPersonal } = useEspacio()
  const [datos, setDatos] = useState<any | null>(null)
  const [error, setError] = useState('')
  // Por defecto, el último mes cerrado (lo que se informa a la familia).
  const [mes, setMes] = useState(sumarMesClave(mesActual(), -1))
  const [vista, setVista] = useState<Vista>('simple')
  const [propiedadId, setPropiedadId] = useState('')
  const [pago, setPago] = useState<DatosPago>({ titular: '', banco: '', cuenta: '', telefono: '', administrador: '' })
  const [editandoPago, setEditandoPago] = useState(false)
  // Qué se imprime: la vista actual, o un recibo puntual.
  const [reciboId, setReciboId] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const token = await obtenerToken()
        const h = { Authorization: `Bearer ${token}` }
        const urls = ['/api/movimientos', '/api/alquileres', '/api/deudas', '/api/propiedades', '/api/unidades', '/api/familia', '/api/pendientes']
        const [mov, alq, deu, prop, uni, fam, pen] = await Promise.all(urls.map((u) => fetch(u, { headers: h }).then((r) => r.json())))
        setDatos({
          movimientos: mov.movimientos || [],
          alquileres: alq.alquileres || [],
          deudas: deu.deudas || [],
          propiedades: prop.propiedades || [],
          unidades: uni.unidades || [],
          miembros: fam.miembros || [],
          pendientes: pen.pendientes || [],
        })
      } catch (err: any) {
        setError(err.message || 'No se pudieron cargar los datos.')
      }
    })()
    try {
      const guardado = localStorage.getItem(CLAVE_PAGO)
      if (guardado) setPago((p) => ({ ...p, ...JSON.parse(guardado) }))
    } catch {
      // sin datos guardados
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (perfil?.nombre) setPago((p) => (p.administrador ? p : { ...p, administrador: perfil.nombre }))
  }, [perfil])

  useEffect(() => {
    const limpiar = () => setReciboId(null)
    window.addEventListener('afterprint', limpiar)
    return () => window.removeEventListener('afterprint', limpiar)
  }, [])

  const informe = useMemo(() => (datos ? armarInforme(datos, mes, { propiedadId: propiedadId || null, personal: esPersonal }) : null), [datos, mes, propiedadId, esPersonal])
  const liquidacion = useMemo(
    () => (datos ? armarInforme(datos, mes, { propiedadId: propiedadId || null, soloInmuebles: true }) : null),
    [datos, mes, propiedadId]
  )

  // Cobros de alquiler del mes, para emitir recibos.
  const cobros = useMemo(() => {
    if (!liquidacion) return []
    return liquidacion.cuentas.flatMap((c) => c.cobrosMes.map((m: any) => ({ mov: m, cuenta: c })))
  }, [liquidacion])
  const reciboActivo = cobros.find((x) => x.mov.id === reciboId)

  function guardarPago(nuevo: DatosPago) {
    setPago(nuevo)
    try {
      localStorage.setItem(CLAVE_PAGO, JSON.stringify(nuevo))
    } catch {
      // el navegador no deja guardar: se usa solo en esta sesión
    }
  }

  function imprimir(recibo?: string) {
    setReciboId(recibo || null)
    // Se espera un cuadro para que React pinte lo que se va a imprimir.
    setTimeout(() => window.print(), 80)
  }

  function enviarWhatsApp() {
    if (!informe) return
    const texto = textoWhatsApp(informe, typeof window !== 'undefined' ? `${window.location.origin}/informe` : undefined, esPersonal ? 'Mis finanzas' : 'Informe de la familia')
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  const firmaDe = (uid?: string) => datos?.miembros?.find((m: any) => m.uid === uid)?.firmaDataUrl || null
  const meses = Array.from({ length: 13 }, (_, i) => sumarMesClave(mesActual(), -i))

  return (
    <PaginaProtegida>
      {/* Controles: no salen al imprimir */}
      <div className="print:hidden">
        <div className="font-display text-xl font-bold text-ink mb-1">Informe mensual</div>
        <div className="font-body text-xs text-inksoft mb-4">Un resumen claro para toda la familia y la liquidación con formato de expensas, listos para imprimir, guardar en PDF o mandar por WhatsApp.</div>

        <div className="flex flex-wrap gap-2 items-end mb-3">
          <label className="font-body text-[11px] text-inksoft flex flex-col gap-1">
            Mes
            <select value={mes} onChange={(e) => setMes(e.target.value)} className="min-h-[44px] px-3 rounded-lg border border-line bg-white font-body text-sm text-ink">
              {meses.map((m) => (
                <option key={m} value={m}>
                  {etiquetaMes(m)}
                  {m === mesActual() ? ' (en curso)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="font-body text-[11px] text-inksoft flex flex-col gap-1">
            Propiedad
            <select value={propiedadId} onChange={(e) => setPropiedadId(e.target.value)} className="min-h-[44px] px-3 rounded-lg border border-line bg-white font-body text-sm text-ink">
              <option value="">Todas</option>
              {(datos?.propiedades || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <div className="flex rounded-lg border border-line overflow-hidden" role="tablist" aria-label="Tipo de informe">
            {([['simple', 'Informe simple'], ['liquidacion', 'Liquidación']] as const).map(([v, t]) => (
              <button
                key={v}
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={`min-h-[44px] px-4 font-body text-sm ${vista === v ? 'bg-ink text-white font-semibold' : 'bg-white text-ink'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => imprimir()} disabled={!informe} className="min-h-[44px] px-4 rounded-lg bg-ink text-white font-body text-sm font-semibold disabled:opacity-50">
            Imprimir / guardar PDF
          </button>
          <button onClick={enviarWhatsApp} disabled={!informe} className="min-h-[44px] px-4 rounded-lg bg-[#B3831F] text-[#1A1408] font-body text-sm font-bold disabled:opacity-50">
            Enviar resumen por WhatsApp
          </button>
          {vista === 'liquidacion' && (
            <button onClick={() => setEditandoPago((v) => !v)} className="min-h-[44px] px-4 rounded-lg border border-line bg-white font-body text-sm text-ink">
              {editandoPago ? 'Cerrar datos de cobro' : 'Datos de cobro'}
            </button>
          )}
        </div>

        {vista === 'liquidacion' && editandoPago && (
          <div className="bg-panel border border-line rounded-xl p-4 mb-6">
            <div className="font-body text-sm font-semibold text-ink mb-1">Datos que salen en los avisos y recibos</div>
            <div className="font-body text-[11px] text-inksoft mb-3">Quedan guardados en este navegador.</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                ['administrador', 'Administra'],
                ['telefono', 'Teléfono de contacto'],
                ['titular', 'Titular de la cuenta'],
                ['banco', 'Banco'],
                ['cuenta', 'N.° de cuenta'],
              ] as const).map(([k, t]) => (
                <label key={k} className="font-body text-[11px] text-inksoft flex flex-col gap-1">
                  {t}
                  <input value={pago[k]} onChange={(e) => guardarPago({ ...pago, [k]: e.target.value })} className="px-3 py-2 rounded-lg border border-line font-body text-sm text-ink" />
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="font-body text-sm text-rojo mb-4">{error}</div>}
        {!datos && !error && <div className="font-body text-sm text-inksoft">Cargando...</div>}
      </div>

      {/* Contenido: lo que se ve y lo que se imprime (salvo que se esté imprimiendo un recibo) */}
      {informe && liquidacion && (
        <div className={reciboActivo ? 'print:hidden' : ''}>
          {vista === 'simple' ? <InformeSimple inf={informe} marca={esPersonal ? 'Mis finanzas' : 'Finanzas de la familia'} personal={esPersonal} /> : <Liquidacion inf={liquidacion} pago={pago} />}

          {vista === 'liquidacion' && (
            <div className="print:hidden mt-2 bg-panel border border-line rounded-xl p-4">
              <div className="font-body text-sm font-semibold text-ink mb-1">Recibos de {etiquetaMes(mes).toLowerCase()}</div>
              <div className="font-body text-[11px] text-inksoft mb-3">Un recibo por cada cobro de alquiler registrado en el mes, con talón para la administración y para el inquilino.</div>
              {cobros.length === 0 && <div className="font-body text-xs text-inksoft">No hay cobros de alquiler registrados en este mes.</div>}
              {cobros.map(({ mov, cuenta }) => (
                <div key={mov.id} className="flex items-center gap-3 py-2 border-b border-line last:border-b-0 flex-wrap">
                  <div className="flex-1 min-w-[12rem] font-body text-xs text-ink">
                    <b>{cuenta.alquiler.inquilinoNombre}</b> · {cuenta.lugar} · {fechaCorta(mov.fecha)} · {formatoBs(Number(mov.monto))}
                  </div>
                  <button onClick={() => imprimir(mov.id)} className="min-h-[40px] px-3 rounded-lg border border-line bg-white font-body text-xs text-ink">
                    Imprimir recibo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recibo puntual: solo existe en la impresión */}
      {reciboActivo && (
        <div className="hidden print:block">
          <Recibo mov={reciboActivo.mov} cuenta={reciboActivo.cuenta} pago={pago} firma={firmaDe(reciboActivo.mov.registradoPor)} />
        </div>
      )}
    </PaginaProtegida>
  )
}
