'use client'

import { Informe, CuentaAlquiler, sumarMesClave, MORA_DIARIA } from '@/lib/informe'
import { formatoBs, fechaCorta, etiquetaMes, calcularPlanDePago, esquemaDeAlquiler } from '@/lib/esquemaPago'
import { monedaActual, simboloDe } from '@/lib/monedas'

export type DatosPago = { titular: string; banco: string; cuenta: string; telefono: string; administrador: string }

// Liquidación mensual con el formato de las expensas: una hoja de
// aviso por inquilino, estado de cuentas + gastos por rubro, y caja +
// patrimonio + saldos pendientes. Cada .hoja es una página A4 al
// imprimir.

const th = 'text-left px-2 py-1.5 border border-[#C9D2DE] font-semibold'
const td = 'px-2 py-1.5 border border-[#C9D2DE]'
const tdNum = `${td} text-right whitespace-nowrap`
const banda = 'bg-[#1C3A5E] text-white text-center py-1.5 font-bold text-sm tracking-wide'
const n = (v: number) => formatoBs(v, false)
// Símbolo de la moneda del espacio activo (Bs en la familia).
const sim = () => simboloDe(monedaActual())

function Hoja({ children, numero, total, inf }: { children: React.ReactNode; numero: number; total: number; inf: Informe }) {
  return (
    <section className="hoja bg-white shadow-sm print:shadow-none border border-[#DCE2EA] print:border-0 mb-6 print:mb-0 text-[#1F2733] text-[13px] flex flex-col">
      <div className="bg-[#1C3A5E] border-b-4 border-[#B3831F] px-6 py-2.5 flex justify-between text-white gap-3 flex-wrap">
        <span className="font-bold">Liquidación de alquileres{inf.propiedadNombre ? ` · ${inf.propiedadNombre}` : ''}</span>
        <span className="text-[#E9D8AE]">Período {inf.mes.slice(5)}/{inf.mes.slice(0, 4)}</span>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4 flex-1">{children}</div>
      <div className="mx-6 mb-4 pt-2 border-t border-[#C9D2DE] flex justify-between text-xs text-[#4A5565]">
        <span>Finanzas de la familia · Documento privado</span>
        <span className="font-bold text-[#1C3A5E]">
          Hoja {numero} de {total}
        </span>
      </div>
    </section>
  )
}

function AvisoInquilino({ c, inf, pago }: { c: CuentaAlquiler; inf: Informe; pago: DatosPago }) {
  const a = c.alquiler
  const prox = c.proxima
  const deuda = Math.max(c.deuda, 0)
  const total = deuda + c.mora + (prox?.monto || 0)
  const esquema = esquemaDeAlquiler(a)
  const plan = esquema ? calcularPlanDePago({ fechaInicio: a.fechaInicio, fechaFin: a.fechaFin || null, diaCobro: a.diaCobro, esquema }) : null
  const mesProx = sumarMesClave(inf.mes, 1)
  const ejemploDia = prox ? Math.min(Number(prox.vence.slice(8, 10)) + 5, 28) : 10

  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="font-bold text-[#1C3A5E] text-sm">Administración</div>
          <div className="font-bold mt-1">{pago.administrador || a.administradorNombre || 'Familia'}</div>
          {pago.telefono && <div>Tel.: {pago.telefono}</div>}
        </div>
        <div className="text-right">
          <div className="font-bold text-[#1C3A5E] text-sm">Inmueble</div>
          <div className="font-bold mt-1">{c.lugar || '—'}</div>
          <div>
            Contrato {fechaCorta(a.fechaInicio)}
            {a.fechaFin ? ` – ${fechaCorta(a.fechaFin)}` : ''}
          </div>
        </div>
      </div>

      <div className="bg-[#EAF0F7] px-4 py-2.5 text-center font-bold text-[15px] text-[#132A45] uppercase">
        {a.inquilinoNombre}
        {a.inquilinoCI ? ` · C.I. ${a.inquilinoCI}` : ''}
      </div>

      <div>
        <div className="font-bold text-[#1C3A5E] text-[15px] mb-1.5">CONCEPTOS A PAGAR</div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className="py-1.5 border-b border-[#C9D2DE] font-bold w-[34%]">Saldo anterior</td>
              <td className="py-1.5 border-b border-[#C9D2DE] text-[#4A5565]">
                {deuda > 0 ? `Quedó sin pagar al cierre de ${inf.etiqueta.toLowerCase()}` : c.pagosMes > 0 ? `${inf.etiqueta}: pagado` : 'Sin deuda'}
              </td>
              <td className="py-1.5 border-b border-[#C9D2DE] text-right whitespace-nowrap">{sim()} {n(deuda)}</td>
            </tr>
            <tr>
              <td className="py-1.5 border-b border-[#C9D2DE] font-bold">Canon de alquiler</td>
              <td className="py-1.5 border-b border-[#C9D2DE] text-[#4A5565]">
                {etiquetaMes(mesProx)}
                {prox && prox.tipo !== 'completa' ? ` · proporcional ${prox.dias} días` : ''}
                {esquema && esquema.tramos.length > 1 && prox ? ` · tramo ${prox.tramo + 1} de ${esquema.tramos.length}` : ''}
              </td>
              <td className="py-1.5 border-b border-[#C9D2DE] text-right whitespace-nowrap">{sim()} {n(prox?.monto || 0)}</td>
            </tr>
            <tr>
              <td className="py-1.5 border-b border-[#C9D2DE] font-bold italic">Recargo por mora</td>
              <td className="py-1.5 border-b border-[#C9D2DE] text-[#4A5565]">
                {c.diasAtraso > 0 ? `${c.diasAtraso} días × Bs ${MORA_DIARIA}` : `Bs ${MORA_DIARIA} por día de atraso`}
              </td>
              <td className="py-1.5 border-b border-[#C9D2DE] text-right whitespace-nowrap">{sim()} {n(c.mora)}</td>
            </tr>
          </tbody>
        </table>
        <div className="flex justify-between items-baseline mt-2.5 font-display text-lg font-bold text-[#132A45]">
          <span>TOTAL A PAGAR</span>
          <span>{sim()} {n(total)}</span>
        </div>
      </div>

      {prox && (
        <div className="grid grid-cols-2 gap-2.5">
          <div className="border border-[#C9D2DE] px-3.5 py-2.5">
            <div className="font-bold text-[#1C3A5E]">VENCIMIENTO 1 · hasta el {fechaCorta(prox.vence)}</div>
            <div className="text-[17px] font-bold mt-0.5">{sim()} {n(total)}</div>
          </div>
          <div className="border border-[#C9D2DE] px-3.5 py-2.5">
            <div className="font-bold text-[#7A2E21]">DESPUÉS · + Bs {MORA_DIARIA} por día</div>
            <div className="text-[17px] font-bold mt-0.5">
              al {String(ejemploDia).padStart(2, '0')}/{prox.vence.slice(5, 7)}: {sim()} {n(total + (ejemploDia - Number(prox.vence.slice(8, 10))) * MORA_DIARIA)}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="font-bold text-[#1C3A5E] text-[15px] mb-1">FORMAS DE PAGO</div>
        <div>Efectivo, transferencia bancaria o pago por código QR.</div>
        {(pago.titular || pago.banco || pago.cuenta) && (
          <div className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-0.5 mt-1.5">
            {pago.titular && (<><span className="font-bold">Titular:</span><span>{pago.titular}</span></>)}
            {pago.banco && (<><span className="font-bold">Banco:</span><span>{pago.banco}</span></>)}
            {pago.cuenta && (<><span className="font-bold">N.° de cuenta:</span><span>{pago.cuenta}</span></>)}
          </div>
        )}
        <div className="mt-1.5 text-[#4A5565]">El monto debe llegar completo: la comisión del QR o de la transferencia la paga el inquilino. Indicá el departamento en la referencia.</div>
      </div>

      {plan && (
        <div>
          <div className={banda}>SU PLAN DE PAGOS SEGÚN CONTRATO</div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#EAF0F7]">
                <th className={th}>Período</th>
                <th className={th}>Detalle</th>
                <th className={`${th} text-right`}>Por mes</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {plan.resumen.grupos.map((g, i) => {
                const estado =
                  g.hasta <= inf.mes ? (c.deuda > 0.01 ? 'Con saldo' : 'Pagado') : g.desde <= mesProx && g.hasta >= mesProx ? `${etiquetaMes(mesProx).split(' ')[0]}: este aviso` : 'Pendiente'
                return (
                  <tr key={i}>
                    <td className={td}>{g.desde === g.hasta ? etiquetaMes(g.desde) : `${etiquetaMes(g.desde)} a ${etiquetaMes(g.hasta)}`}</td>
                    <td className={td}>
                      {g.tipo === 'completa' ? `${g.cantidad} ${g.cantidad === 1 ? 'cuota' : 'cuotas'}${plan.resumen.grupos.some((x) => x.tramo > 0) ? ` · tramo ${g.tramo + 1}` : ''}` : `Proporcional ${g.dias} días`}
                    </td>
                    <td className={tdNum}>{sim()} {n(g.monto)}</td>
                    <td className={`${td} ${estado === 'Pagado' ? 'font-bold text-[#1F5E43]' : estado === 'Con saldo' ? 'font-bold text-[#8A3324]' : ''}`}>{estado}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function Liquidacion({ inf, pago }: { inf: Informe; pago: DatosPago }) {
  const avisos = inf.cuentas.filter((c) => c.alquiler.estado === 'activo' && c.proxima)
  const total = avisos.length + 2
  let k = 0

  return (
    <div>
      {avisos.map((c) => (
        <Hoja key={c.alquiler.id} numero={++k} total={total} inf={inf}>
          <AvisoInquilino c={c} inf={inf} pago={pago} />
        </Hoja>
      ))}

      <Hoja numero={++k} total={total} inf={inf}>
        <div>
          <div className={banda}>ESTADO DE CUENTAS POR UNIDAD</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs min-w-[600px]">
              <thead>
                <tr className="bg-[#EAF0F7]">
                  <th className={th}>Unidad</th>
                  <th className={th}>Inquilino / deudor</th>
                  <th className={`${th} text-right`}>Saldo ant.</th>
                  <th className={`${th} text-right`}>Canon mes</th>
                  <th className={`${th} text-right`}>Pagos</th>
                  <th className={`${th} text-right`}>Debe</th>
                  <th className={`${th} text-right`}>Mora</th>
                  <th className={`${th} text-right`}>Próximo</th>
                </tr>
              </thead>
              <tbody>
                {inf.cuentas.map((c, i) => (
                  <tr key={c.alquiler.id} className={c.estado === 'atrasado' ? 'bg-[#FBEDEA]' : i % 2 ? 'bg-[#F7F9FB]' : ''}>
                    <td className={td}>{c.lugar.split(' — ').pop() || '—'}</td>
                    <td className={`${td} uppercase`}>{c.alquiler.inquilinoNombre}</td>
                    <td className={tdNum}>{n(c.saldoAnterior)}</td>
                    <td className={tdNum}>{n(c.cargoMes)}</td>
                    <td className={tdNum}>{c.pagosMes ? `-${n(c.pagosMes)}` : '0'}</td>
                    <td className={`${tdNum} font-bold`}>{n(c.deuda)}</td>
                    <td className={tdNum}>{n(c.mora)}</td>
                    <td className={tdNum}>{c.proxima ? n(c.proxima.monto) : '—'}</td>
                  </tr>
                ))}
                {inf.deudas
                  .filter((x) => x.deuda.estado !== 'cancelada')
                  .map((x) => (
                    <tr key={x.deuda.id} className="bg-[#FBF4E4]">
                      <td className={td}>Plan de pago</td>
                      <td className={`${td} uppercase`}>{x.deuda.deudorNombre}</td>
                      <td className={tdNum}>{n(x.resumen.saldo + x.cobradoMes)}</td>
                      <td className={tdNum}>—</td>
                      <td className={tdNum}>{x.cobradoMes ? `-${n(x.cobradoMes)}` : '0'}</td>
                      <td className={`${tdNum} font-bold`}>{n(x.resumen.saldo)}</td>
                      <td className={tdNum}>—</td>
                      <td className={tdNum}>{x.resumen.proxima ? `${n(x.resumen.proxima.monto)} (${fechaCorta(x.resumen.proxima.vence).slice(0, 5)})` : '—'}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#1C3A5E] text-white font-bold">
                  <td colSpan={2} className="px-2 py-1.5">TOTALES</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.cuentas.reduce((s, c) => s + c.saldoAnterior, 0))}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.cuentas.reduce((s, c) => s + c.cargoMes, 0))}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.cuentas.reduce((s, c) => s + c.pagosMes, 0) + inf.deudas.reduce((s, x) => s + x.cobradoMes, 0))}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.patrimonio.alquileresAtrasados + inf.patrimonio.deudasEnPlan)}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.patrimonio.mora)}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.patrimonio.alquileresProximos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-1 text-xs text-[#4A5565]">
            Saldo ant. = lo que venía debiendo; Canon mes = lo que correspondía pagar en {inf.etiqueta.toLowerCase()}; Debe = lo que quedó sin pagar; Mora = recargo de Bs {MORA_DIARIA} por día.
          </div>
        </div>

        <div>
          <div className={banda}>GASTOS DEL PERÍODO POR RUBRO</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#EAF0F7]">
                <th className={th}>Concepto</th>
                <th className={`${th} w-[150px]`}>Dónde</th>
                <th className={`${th} w-[60px] text-right`}>%</th>
                <th className={`${th} w-[110px] text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {inf.rubros.length === 0 && (
                <tr>
                  <td colSpan={4} className={`${td} text-[#4A5565]`}>No se registraron gastos de los inmuebles en este período.</td>
                </tr>
              )}
              {inf.rubros.map((r) => (
                <Rubro key={r.numero} r={r} />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#1C3A5E] text-white font-bold">
                <td colSpan={2} className="px-2 py-2 text-[13px]">TOTAL DE GASTOS</td>
                <td className="px-2 py-2 text-right">100%</td>
                <td className="px-2 py-2 text-right text-[13px]">{sim()} {n(inf.gastos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Hoja>

      <Hoja numero={++k} total={total} inf={inf}>
        <div>
          <div className={banda}>DETALLE DE INGRESOS Y EGRESOS</div>
          <table className="w-full border-collapse text-xs">
            <tbody>
              <Fila txt={`Saldo anterior (al cierre de ${etiquetaMes(sumarMesClave(inf.mes, -1)).toLowerCase()})`} v={inf.caja.saldoAnterior} fuerte />
              <Fila txt="Ingresos por alquileres pagados en término" v={inf.caja.alquileresEnTermino} sangria />
              <Fila txt="Ingresos por alquileres pagados con atraso" v={inf.caja.alquileresAtrasados} sangria />
              <Fila txt="Ingresos por cuotas de deudas en plan de pago" v={inf.caja.cuotasDeuda} sangria />
              {inf.caja.otrosIngresos !== 0 && <Fila txt="Otros ingresos de los inmuebles" v={inf.caja.otrosIngresos} sangria />}
              <Fila txt="Egresos por gastos del mes" v={-inf.caja.egresos} sangria rojo />
              <tr className="bg-[#EAF0F7]">
                <td className="px-2 py-2 font-bold text-[13px]">Saldo al cierre {fechaCorta(inf.referencia)}</td>
                <td className="px-2 py-2 text-right font-bold text-[13px] whitespace-nowrap">{sim()} {n(inf.caja.saldoCierre)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className={banda}>ESTADO PATRIMONIAL AL {fechaCorta(inf.referencia)}</div>
          <table className="w-full border-collapse text-xs">
            <tbody>
              <Fila txt="Plata disponible al cierre" v={inf.patrimonio.disponible} fuerte />
              <Fila txt={`Alquileres de ${etiquetaMes(sumarMesClave(inf.mes, 1)).toLowerCase()} a cobrar`} v={inf.patrimonio.alquileresProximos} sangria />
              <Fila txt="Alquileres atrasados a cobrar" v={inf.patrimonio.alquileresAtrasados} sangria />
              <Fila txt="Deudas en plan de pago a cobrar" v={inf.patrimonio.deudasEnPlan} sangria />
              <Fila txt="Recargos de mora a cobrar" v={inf.patrimonio.mora} sangria />
              {inf.patrimonio.gastosPorPagar > 0 && <Fila txt="Gastos pendientes de pago (expensas, servicios)" v={-inf.patrimonio.gastosPorPagar} sangria rojo />}
              <tr className="bg-[#EAF0F7]">
                <td className="px-2 py-2 font-bold text-[13px]">PATRIMONIO NETO AL CIERRE</td>
                <td className="px-2 py-2 text-right font-bold text-[13px] whitespace-nowrap">{sim()} {n(inf.patrimonio.neto)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className={banda}>SALDOS PENDIENTES DE PAGO</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#EAF0F7]">
                <th className={th}>Quién</th>
                <th className={th}>Origen</th>
                <th className={th}>Situación</th>
                <th className={`${th} text-right`}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {inf.pendientes.length === 0 && (
                <tr>
                  <td colSpan={4} className={`${td} text-[#4A5565]`}>Nadie debe nada.</td>
                </tr>
              )}
              {inf.pendientes.map((p, i) => (
                <tr key={i}>
                  <td className={`${td} uppercase`}>{i + 1}. {p.quien}</td>
                  <td className={td}>{p.origen}</td>
                  <td className={td}>{p.situacion}</td>
                  <td className={`${tdNum} font-bold`}>{n(p.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#1C3A5E] text-white font-bold">
                <td colSpan={3} className="px-2 py-1.5">TOTAL</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{sim()} {n(inf.pendientes.reduce((s, p) => s + p.saldo, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-[1fr_210px] gap-6 items-end">
        <div>
          <div className="inline-block bg-[#1C3A5E] text-white px-3.5 py-1 font-bold tracking-wide">NOTAS</div>
          <ol className="mt-2 mb-0 pl-5 text-xs leading-relaxed list-decimal">
            <li><b>Se ruega pagar dentro de los primeros días de cada mes, según cada contrato.</b> Pasado el vencimiento corre un recargo de Bs {MORA_DIARIA} por día de atraso.</li>
            {inf.avisos
              .filter((a) => a.nivel === 'amarillo' && /sube|vence el/.test(a.detalle) && !/cuota/.test(a.detalle))
              .map((a, i) => (
                <li key={i}>{a.titulo}: {a.detalle}</li>
              ))}
            <li>Para transferencias o QR, indicar el departamento en la referencia. La comisión bancaria la paga el inquilino.</li>
          </ol>
        </div>

        <div className="flex justify-end">
          <div className="w-full text-center">
            <div className="h-12 w-full border-b-2 border-[#1C3A5E]" />
            <div className="font-bold text-[#1C3A5E] mt-1 uppercase">{pago.administrador || 'Administración'}</div>
            <div className="text-[#4A5565]">Administrador/a</div>
          </div>
        </div>
        </div>
      </Hoja>
    </div>
  )
}

function Rubro({ r }: { r: Informe['rubros'][number] }) {
  return (
    <>
      <tr className="bg-[#F2F5F9]">
        <td colSpan={4} className={`${td} font-bold`}>
          {r.numero}. {r.nombre}
        </td>
      </tr>
      {r.items.map((it, i) => (
        <tr key={i}>
          <td className={`${td} pl-5`}>
            {String.fromCharCode(97 + (i % 26))}. {it.descripcion} · {fechaCorta(it.fecha)}
          </td>
          <td className={td}>{it.lugar}</td>
          <td className={td} />
          <td className={tdNum}>{sim()} {n(it.monto)}</td>
        </tr>
      ))}
      <tr>
        <td colSpan={2} className={`${td} text-right font-bold`}>TOTAL RUBRO {r.numero}</td>
        <td className={tdNum}>{r.porcentaje}%</td>
        <td className={`${tdNum} font-bold`}>{sim()} {n(r.total)}</td>
      </tr>
    </>
  )
}

function Fila({ txt, v, sangria, fuerte, rojo }: { txt: string; v: number; sangria?: boolean; fuerte?: boolean; rojo?: boolean }) {
  return (
    <tr>
      <td className={`px-2 py-1.5 border-b border-[#C9D2DE] ${sangria ? 'pl-5' : ''} ${fuerte ? 'font-bold' : ''}`}>{txt}</td>
      <td className={`px-2 py-1.5 border-b border-[#C9D2DE] text-right whitespace-nowrap ${fuerte ? 'font-bold' : ''} ${rojo ? 'text-[#7A2E21]' : ''}`}>
        {v < 0 ? '-' : ''}{sim()} {n(Math.abs(v))}
      </td>
    </tr>
  )
}
