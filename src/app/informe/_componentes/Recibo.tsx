'use client'

import { CuentaAlquiler } from '@/lib/informe'
import { formatoBs, fechaCorta, cuotaDelMes } from '@/lib/esquemaPago'
import { montoEnLetras } from '@/lib/numeroALetras'
import { DatosPago } from './Liquidacion'

// Recibo de un cobro de alquiler, con dos talones (copia para la
// administración y original para el inquilino) separados por una
// línea de corte, en una hoja A4.

export function Recibo({ mov, cuenta, pago, firma }: { mov: any; cuenta: CuentaAlquiler; pago: DatosPago; firma?: string | null }) {
  const a = cuenta.alquiler
  const mes = String(mov.fecha).slice(0, 7)
  const cuota = cuotaDelMes(a, mes)
  // Lo que debía justo antes de este pago (por si en el mes hubo más de uno).
  const previos = cuenta.cobrosMes.filter((m: any) => m.id !== mov.id && (m.fecha < mov.fecha || (m.fecha === mov.fecha && m.id < mov.id))).reduce((s: number, m: any) => s + Number(m.monto), 0)
  const debia = Math.max(cuenta.saldoAnterior + cuenta.cargoMes - previos, 0)
  const pago_ = Number(mov.monto)
  const saldo = Math.max(debia - pago_, 0)
  const numero = `${mes.replace('-', '')}-${String(mov.id).slice(0, 5).toUpperCase()}`
  const concepto =
    cuota?.tipo === 'proporcional_inicio'
      ? `Canon proporcional (${cuota.dias} días)`
      : cuota?.tipo === 'proporcional_fin'
      ? `Canon proporcional de salida (${cuota.dias} días)`
      : 'Canon de alquiler'

  const talon = (copia: boolean) => (
    <div className="relative overflow-hidden border-2 border-[#1C3A5E] flex flex-col text-[13px] text-[#1F2733] bg-white">
      {copia && (
        <div aria-hidden className="absolute left-[8%] top-[42%] -rotate-[24deg] text-4xl font-bold tracking-[.3em] text-[#1C3A5E] opacity-10 whitespace-nowrap pointer-events-none">
          COPIA ADMINISTRACIÓN
        </div>
      )}
      <div className="px-4 py-3 border-b-2 border-[#1C3A5E] flex justify-between items-start gap-3">
        <div>
          <div className="font-display text-lg font-bold text-[#1C3A5E]">RECIBO DE ALQUILER</div>
          <div className="text-[#4A5565]">Contrato privado · Art. 519 Código Civil</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-[#1C3A5E]">N.° {numero}</div>
          <div className="text-[#4A5565]">Fecha: {fechaCorta(mov.fecha)}</div>
        </div>
      </div>
      <div className="px-4 py-2 border-b border-[#1C3A5E] flex justify-between gap-3">
        <div>
          <b>Administración:</b> {pago.administrador || a.administradorNombre || '—'}
          {pago.telefono ? ` · Tel. ${pago.telefono}` : ''}
          <br />
          {cuenta.lugar}
        </div>
      </div>
      <div className="px-4 py-2 border-b border-[#1C3A5E] flex justify-between gap-3">
        <div>
          <b className="uppercase">{a.inquilinoNombre}</b>
          <br />
          {a.inquilinoCI ? `C.I. ${a.inquilinoCI}` : ''}
        </div>
        <div className="text-right">
          <b className="uppercase">{cuenta.lugar.split(' — ').pop()}</b>
        </div>
      </div>
      <div className="px-4 py-2 flex flex-col gap-0">
        <div className="grid grid-cols-[1fr_auto] gap-x-3">
          <span>
            <i>Período:</i> <b>{mes.slice(5)}/{mes.slice(0, 4)}</b>
          </span>
          <span />
          <span className="text-right italic">Debía:</span>
          <span className="text-right">{formatoBs(debia)}</span>
          <span className="text-right italic">Pagó ({fechaCorta(mov.fecha)}):</span>
          <span className="text-right">{formatoBs(pago_)}</span>
          <span className="text-right italic">Saldo pendiente:</span>
          <span className="text-right">{formatoBs(saldo)}</span>
        </div>
        <div className="font-bold text-[#1C3A5E] mt-1">Conceptos</div>
        <div className="flex justify-between py-1 border-b border-[#E1E6ED]">
          <span>{concepto}</span>
          <span>{formatoBs(pago_)}</span>
        </div>
        <div className="flex justify-between px-2 py-1.5 mt-1 bg-[#EAF0F7] font-bold text-[#132A45] text-sm">
          <span>TOTAL PAGADO</span>
          <span>{formatoBs(pago_)}</span>
        </div>
        <div className="text-[#4A5565] mt-1">Son: {montoEnLetras(pago_)}</div>
        <div className="flex justify-between items-end gap-3 mt-1.5">
          <div className="text-xs italic text-[#4A5565]">{copia ? 'Talón para la administración' : 'Talón para el inquilino'}</div>
          {!copia && (
            <div className="border border-[#8796A8] w-56 h-20 flex flex-col justify-end items-center pb-1.5 relative">
              {firma && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firma} alt="Firma" className="absolute bottom-6 max-h-14 max-w-[12rem] object-contain" />
              )}
              <div className="w-44 border-t border-[#1C3A5E]" />
              <div className="text-xs italic text-[#4A5565] mt-0.5">Firma de quien cobra · {mov.registradoPorNombre || ''}</div>
            </div>
          )}
        </div>
      </div>
      {cuenta.proxima && (
        <div className="border-t-[3px] border-[#B3831F] bg-[#F7F9FB] px-4 py-1.5 text-center text-xs text-[#4A5565]">
          Próximo pago: {cuenta.proxima.etiqueta.toLowerCase()} · {formatoBs(cuenta.proxima.monto)} · vence {fechaCorta(cuenta.proxima.vence)}
        </div>
      )}
    </div>
  )

  return (
    <div className="recibo bg-white flex flex-col gap-0">
      {talon(true)}
      <div className="my-4 border-t-2 border-dashed border-[#8796A8] relative">
        <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-white px-2 text-xs text-[#4A5565]">cortar aquí</span>
      </div>
      {talon(false)}
    </div>
  )
}
