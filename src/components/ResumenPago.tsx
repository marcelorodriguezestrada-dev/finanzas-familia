'use client'

import { useMemo, useState } from 'react'
import {
  EsquemaPago, calcularPlanDePago, formatoBs, fechaCorta, proximoAumento, etiquetaMes,
} from '@/lib/esquemaPago'

const COLORES_TRAMO = ['bg-sky-600', 'bg-amber-600', 'bg-emerald-700', 'bg-rose-700', 'bg-violet-600']

// Resumen legible del esquema de pago ("a la firma Bs 766,67, después
// 3 cuotas de Bs 2.300 y 8 de Bs 2.500...") con el cronograma mes a mes
// desplegable. Se usa en el formulario de alquiler (en vivo, mientras
// se cargan los tramos) y en cada tarjeta del archivo de alquileres.
export function ResumenPago({
  fechaInicio,
  fechaFin,
  diaCobro,
  esquema,
  compacto = false,
  mesesCobrados,
  mesActual,
}: {
  fechaInicio: string
  fechaFin?: string | null
  diaCobro: number
  esquema: EsquemaPago | null
  compacto?: boolean
  // Meses (YYYY-MM) que ya tienen el cobro registrado, para marcarlos.
  mesesCobrados?: Set<string>
  mesActual?: string
}) {
  const [abierto, setAbierto] = useState(false)

  const plan = useMemo(() => {
    if (!esquema || !fechaInicio) return null
    return calcularPlanDePago({ fechaInicio, fechaFin: fechaFin || null, diaCobro, esquema })
  }, [esquema, fechaInicio, fechaFin, diaCobro])

  if (!plan || plan.cronograma.length === 0) return null
  const { cronograma, resumen } = plan
  const hoyMes = mesActual || new Date().toISOString().slice(0, 7)
  const cuotaHoy = cronograma.find((c) => c.mes === hoyMes)
  const aumento = proximoAumento(cronograma, hoyMes < cronograma[0].mes ? cronograma[0].mes : hoyMes)
  const variosTramos = new Set(cronograma.map((c) => c.tramo)).size > 1

  const tabla = (
    <div className="overflow-x-auto mt-2">
      <table className="w-full font-body text-[11px]">
        <thead>
          <tr className="bg-ink text-white">
            <th className="text-left px-2 py-1.5 font-semibold">#</th>
            <th className="text-left px-2 py-1.5 font-semibold">Mes</th>
            <th className="text-left px-2 py-1.5 font-semibold">Concepto</th>
            <th className="text-left px-2 py-1.5 font-semibold">Vence</th>
            <th className="text-right px-2 py-1.5 font-semibold">Monto</th>
            {mesesCobrados && <th className="px-2 py-1.5" />}
          </tr>
        </thead>
        <tbody>
          {cronograma.map((c, i) => {
            const cobrado = mesesCobrados?.has(c.mes)
            const vencido = !cobrado && c.vence < new Date().toISOString().slice(0, 10)
            return (
              <tr key={c.mes} className={`${i % 2 ? 'bg-panelalt' : ''} ${c.mes === hoyMes ? 'font-semibold' : ''}`}>
                <td className="px-2 py-1 text-inksoft">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${COLORES_TRAMO[c.tramo % COLORES_TRAMO.length]}`} />
                  {c.numero}
                </td>
                <td className="px-2 py-1 text-ink whitespace-nowrap">{c.etiqueta}{c.mes === hoyMes ? ' ←' : ''}</td>
                <td className="px-2 py-1 text-inksoft">
                  {c.tipo === 'completa' ? `Canon${variosTramos ? ` tramo ${c.tramo + 1}` : ''}` : `Proporcional ${c.dias} días`}
                  {c.proyectada ? ' (proyección)' : ''}
                </td>
                <td className="px-2 py-1 text-inksoft whitespace-nowrap">{fechaCorta(c.vence)}</td>
                <td className="px-2 py-1 text-right text-ink whitespace-nowrap">{formatoBs(c.monto)}</td>
                {mesesCobrados && (
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {cobrado ? <span className="text-verde">✓ cobrado</span> : vencido ? <span className="text-rojo">pendiente</span> : ''}
                  </td>
                )}
              </tr>
            )
          })}
          <tr className="border-t-2 border-ink">
            <td colSpan={4} className="px-2 py-1.5 font-semibold text-ink">{resumen.proyectado ? 'Total proyectado' : 'Total del contrato'}</td>
            <td className="px-2 py-1.5 text-right font-semibold text-ink whitespace-nowrap">{formatoBs(resumen.total)}</td>
            {mesesCobrados && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  )

  if (compacto) {
    return (
      <div className="mt-2">
        <div className="font-body text-[11px] text-inksoft">
          {cuotaHoy ? (
            <>
              Este mes ({etiquetaMes(hoyMes).toLowerCase()}): <span className="font-semibold text-ink">{formatoBs(cuotaHoy.monto)}</span>
              {cuotaHoy.tipo !== 'completa' && ` (proporcional ${cuotaHoy.dias} días)`} · vence {fechaCorta(cuotaHoy.vence)}
            </>
          ) : hoyMes < cronograma[0].mes ? (
            <>Primer pago: {formatoBs(cronograma[0].monto)} el {fechaCorta(cronograma[0].vence)}</>
          ) : (
            <>Sin cuotas pendientes según el contrato.</>
          )}
          {aumento && (
            <span className="text-ocre">
              {' '}· Desde {aumento.etiqueta.toLowerCase()} pasa a {formatoBs(aumento.monto)}
            </span>
          )}
        </div>
        <button type="button" onClick={() => setAbierto((v) => !v)} className="font-body text-[11px] text-ink underline mt-1">
          {abierto ? 'Ocultar cronograma' : `Ver plan de pagos (${resumen.cantidadCuotas} pagos${resumen.proyectado ? '' : ` · total ${formatoBs(resumen.total)}`})`}
        </button>
        {abierto && (
          <div className="mt-1">
            <ul className="mb-1">
              {resumen.lineas.map((l, i) => (
                <li key={i} className="font-body text-[11px] text-ink">• {l}</li>
              ))}
            </ul>
            {tabla}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-ocre/40 bg-ocresoft/60 rounded-lg p-3 mb-4">
      <div className="font-body text-xs font-semibold text-ink mb-2">📋 Resumen del pago</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-white rounded-md px-2.5 py-2 border border-line">
          <div className="font-body text-[10px] text-inksoft uppercase tracking-wide">A la firma</div>
          <div className="font-display text-sm font-bold text-ink">{formatoBs(resumen.pagoALaFirma)}</div>
        </div>
        <div className="bg-ink rounded-md px-2.5 py-2">
          <div className="font-body text-[10px] text-white/70 uppercase tracking-wide">{resumen.proyectado ? 'Primeros meses' : 'Total contrato'}</div>
          <div className="font-display text-sm font-bold text-white">{formatoBs(resumen.total)}</div>
        </div>
        <div className="bg-white rounded-md px-2.5 py-2 border border-line">
          <div className="font-body text-[10px] text-inksoft uppercase tracking-wide">Pagos</div>
          <div className="font-display text-sm font-bold text-ink">{resumen.cantidadCuotas}</div>
        </div>
      </div>
      <ul className="space-y-1">
        {resumen.grupos.map((g, i) => (
          <li key={i} className="flex items-start gap-2 font-body text-xs text-ink">
            <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${g.tipo === 'completa' ? COLORES_TRAMO[g.tramo % COLORES_TRAMO.length] : 'bg-inksoft'}`} />
            <span>{resumen.lineas[i]}</span>
          </li>
        ))}
      </ul>
      {resumen.proyectado && (
        <div className="font-body text-[11px] text-inksoft mt-2">
          Sin fecha de vencimiento: se muestran los primeros meses y el último canon sigue mientras dure el alquiler.
        </div>
      )}
      <button type="button" onClick={() => setAbierto((v) => !v)} className="font-body text-[11px] text-ink underline mt-2">
        {abierto ? 'Ocultar cronograma mes a mes' : 'Ver cronograma mes a mes'}
      </button>
      {abierto && tabla}
    </div>
  )
}
