'use client'

import { Fragment } from 'react'
import { InformeAdministrador as Datos } from '@/lib/informeAdministrador'
import { sumarMesClave } from '@/lib/informe'
import { formatoBs, fechaCorta, etiquetaMes } from '@/lib/esquemaPago'
import { monedaActual, simboloDe } from '@/lib/monedas'

// Informe individual de un administrador: cuánto cobró y cuánto pagó
// de los departamentos que administra, cuánta plata debería tener en
// mano, cómo está cada inquilino y lo que falta cobrar. Dos hojas A4
// (se imprime / guarda como PDF desde el navegador).

const th = 'text-left px-2 py-1.5 border border-[#C9D2DE] font-semibold'
const td = 'px-2 py-1.5 border border-[#C9D2DE]'
const tdNum = `${td} text-right whitespace-nowrap`
const banda = 'bg-[#1C3A5E] text-white text-center py-1.5 font-bold text-sm tracking-wide'
const n = (v: number) => formatoBs(v, false)
const sim = () => simboloDe(monedaActual())
const dinero = (v: number) => `${v < 0 ? '-' : ''}${sim()} ${n(Math.abs(v))}`

function Hoja({ children, numero, total, a, marca }: { children: React.ReactNode; numero: number; total: number; a: Datos; marca: string }) {
  return (
    <section className="hoja bg-white shadow-sm print:shadow-none border border-[#DCE2EA] print:border-0 mb-6 print:mb-0 text-[#1F2733] text-[13px] flex flex-col">
      <div className="bg-[#1C3A5E] border-b-4 border-[#B3831F] px-6 py-2.5 flex justify-between text-white gap-3 flex-wrap">
        <span className="font-bold">Informe del administrador · {a.nombre}{marca ? ` · ${marca}` : ''}</span>
        <span className="text-[#E9D8AE]">Período {a.inf.mes.slice(5)}/{a.inf.mes.slice(0, 4)}</span>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4 flex-1">{children}</div>
      <div className="mx-6 mb-4 pt-2 border-t border-[#C9D2DE] flex justify-between text-xs text-[#4A5565]">
        <span>Finanzas de la familia · Documento privado</span>
        <span className="font-bold text-[#1C3A5E]">
          {a.nombre} · Hoja {numero} de {total}
        </span>
      </div>
    </section>
  )
}

function Fila({ txt, v, sangria, fuerte, rojo }: { txt: string; v: number; sangria?: boolean; fuerte?: boolean; rojo?: boolean }) {
  return (
    <tr>
      <td className={`px-2 py-1.5 border-b border-[#C9D2DE] ${sangria ? 'pl-5' : ''} ${fuerte ? 'font-bold' : ''}`}>{txt}</td>
      <td className={`px-2 py-1.5 border-b border-[#C9D2DE] text-right whitespace-nowrap ${fuerte ? 'font-bold' : ''} ${rojo ? 'text-[#7A2E21]' : ''}`}>{dinero(v)}</td>
    </tr>
  )
}

export function InformeAdministrador({ a, marca = '' }: { a: Datos; marca?: string }) {
  const inf = a.inf
  const caja = inf.caja
  const faltaCobrar = inf.pendientes.reduce((s, p) => s + p.saldo, 0)
  const cobros = inf.cuentas
    .flatMap((c) => c.cobrosMes.map((m: any) => ({ fecha: m.fecha, quien: c.alquiler.inquilinoNombre, lugar: c.lugar, detalle: m.mesCuota ? `Alquiler de ${etiquetaMes(m.mesCuota).toLowerCase()}${m.parcial ? ' (parcial)' : ''}` : 'Alquiler', monto: Number(m.monto) || 0 })))
    .sort((x, y) => x.fecha.localeCompare(y.fecha))
  const cierre = fechaCorta(inf.referencia)

  return (
    <div>
      <Hoja numero={1} total={2} a={a} marca={marca}>
        <div className="grid grid-cols-3 gap-3">
          <div className="border border-[#C9D2DE] px-3.5 py-3">
            <div className="text-xs font-bold text-[#1F5E43] uppercase">Entró en {inf.etiqueta.split(' ')[0].toLowerCase()}</div>
            <div className="text-[20px] font-bold mt-1">{dinero(inf.ingresos)}</div>
          </div>
          <div className="border border-[#C9D2DE] px-3.5 py-3">
            <div className="text-xs font-bold text-[#7A2E21] uppercase">Salió (gastos)</div>
            <div className="text-[20px] font-bold mt-1">{dinero(inf.gastos)}</div>
          </div>
          <div className="border-2 border-[#1C3A5E] bg-[#EAF0F7] px-3.5 py-3">
            <div className="text-xs font-bold text-[#1C3A5E] uppercase">Debería tener en plata</div>
            <div className="text-[20px] font-bold mt-1 text-[#132A45]">{dinero(a.enMano)}</div>
          </div>
        </div>

        <div>
          <div className={banda}>CUENTA DE LA PLATA</div>
          <table className="w-full border-collapse text-xs">
            <tbody>
              <Fila txt={`Venía de antes (cobrado menos pagado hasta el cierre de ${etiquetaMes(sumarMesClave(inf.mes, -1)).toLowerCase()})`} v={caja.saldoAnterior} fuerte />
              <Fila txt="Alquileres cobrados en término" v={caja.alquileresEnTermino} sangria />
              <Fila txt="Alquileres cobrados con atraso" v={caja.alquileresAtrasados} sangria />
              {caja.cuotasDeuda !== 0 && <Fila txt="Cuotas de deudas en plan de pago" v={caja.cuotasDeuda} sangria />}
              {caja.otrosIngresos !== 0 && <Fila txt="Otros ingresos de sus departamentos" v={caja.otrosIngresos} sangria />}
              <Fila txt="Gastos pagados de sus departamentos" v={-caja.egresos} sangria rojo />
              <tr className="bg-[#EAF0F7]">
                <td className="px-2 py-2 font-bold text-[13px]">Debería tener en mano al {cierre}</td>
                <td className="px-2 py-2 text-right font-bold text-[13px] whitespace-nowrap">{dinero(a.enMano)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-1 text-xs text-[#4A5565]">
            Es todo lo cobrado menos todo lo pagado de los departamentos que administra, desde que se lleva la cuenta. Si ya entregó plata a la familia o la depositó, hay que descontarla.
          </div>
        </div>

        <div>
          <div className={banda}>SUS DEPARTAMENTOS · ESTADO DE CUENTAS</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#EAF0F7]">
                <th className={th}>Inmueble</th>
                <th className={th}>Inquilino</th>
                <th className={`${th} text-right`}>Saldo ant.</th>
                <th className={`${th} text-right`}>Canon mes</th>
                <th className={`${th} text-right`}>Pagó</th>
                <th className={`${th} text-right`}>Debe</th>
                <th className={`${th} text-right`}>Mora</th>
              </tr>
            </thead>
            <tbody>
              {inf.cuentas.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${td} text-[#4A5565]`}>No administra alquileres en este período.</td>
                </tr>
              )}
              {inf.cuentas.map((c, i) => (
                <tr key={c.alquiler.id} className={c.estado === 'atrasado' ? 'bg-[#FBEDEA]' : i % 2 ? 'bg-[#F7F9FB]' : ''}>
                  <td className={td}>{c.lugar || '—'}</td>
                  <td className={`${td} uppercase`}>{c.alquiler.inquilinoNombre}</td>
                  <td className={tdNum}>{n(c.saldoAnterior)}</td>
                  <td className={tdNum}>{n(c.cargoMes)}</td>
                  <td className={tdNum}>{n(c.pagosMes)}</td>
                  <td className={`${tdNum} font-bold`}>{n(c.deuda)}</td>
                  <td className={tdNum}>{n(c.mora)}</td>
                </tr>
              ))}
            </tbody>
            {inf.cuentas.length > 0 && (
              <tfoot>
                <tr className="bg-[#1C3A5E] text-white font-bold">
                  <td colSpan={2} className="px-2 py-1.5">TOTALES ({inf.cuentas.length})</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.cuentas.reduce((s, c) => s + c.saldoAnterior, 0))}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.cuentas.reduce((s, c) => s + c.cargoMes, 0))}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.cuentas.reduce((s, c) => s + c.pagosMes, 0))}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.patrimonio.alquileresAtrasados)}</td>
                  <td className="px-2 py-1.5 text-right">{n(inf.patrimonio.mora)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div>
          <div className={banda}>LO QUE FALTA COBRAR</div>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {inf.pendientes.length === 0 && (
                <tr>
                  <td className={`${td} text-[#4A5565]`}>Nadie le debe nada.</td>
                </tr>
              )}
              {inf.pendientes.map((p, i) => (
                <tr key={i}>
                  <td className={`${td} uppercase`}>{p.quien}</td>
                  <td className={td}>{p.origen}</td>
                  <td className={td}>{p.situacion}</td>
                  <td className={`${tdNum} font-bold`}>{n(p.saldo)}</td>
                </tr>
              ))}
            </tbody>
            {inf.pendientes.length > 0 && (
              <tfoot>
                <tr className="bg-[#1C3A5E] text-white font-bold">
                  <td colSpan={3} className="px-2 py-1.5">TOTAL A COBRAR (+ mora {dinero(inf.patrimonio.mora)})</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{dinero(faltaCobrar)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Hoja>

      <Hoja numero={2} total={2} a={a} marca={marca}>
        <div>
          <div className={banda}>DETALLE DE LO QUE COBRÓ</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#EAF0F7]">
                <th className={`${th} w-[80px]`}>Fecha</th>
                <th className={th}>Quién</th>
                <th className={th}>Concepto</th>
                <th className={`${th} w-[110px] text-right`}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {cobros.length === 0 && inf.deudas.every((x) => !x.cobradoMes) && (
                <tr>
                  <td colSpan={4} className={`${td} text-[#4A5565]`}>No registró cobros en este período.</td>
                </tr>
              )}
              {cobros.map((c, i) => (
                <tr key={i}>
                  <td className={td}>{fechaCorta(c.fecha)}</td>
                  <td className={`${td} uppercase`}>{c.quien}</td>
                  <td className={td}>{c.detalle}{c.lugar ? ` · ${c.lugar}` : ''}</td>
                  <td className={tdNum}>{n(c.monto)}</td>
                </tr>
              ))}
              {inf.deudas
                .filter((x) => x.cobradoMes > 0)
                .map((x) => (
                  <tr key={x.deuda.id}>
                    <td className={td}>—</td>
                    <td className={`${td} uppercase`}>{x.deuda.deudorNombre}</td>
                    <td className={td}>Cuotas de deuda en plan de pago{x.lugar ? ` · ${x.lugar}` : ''}</td>
                    <td className={tdNum}>{n(x.cobradoMes)}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#1C3A5E] text-white font-bold">
                <td colSpan={3} className="px-2 py-1.5">TOTAL INGRESOS{caja.otrosIngresos ? ` (incluye otros ${dinero(caja.otrosIngresos)})` : ''}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{dinero(inf.ingresos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div>
          <div className={banda}>DETALLE DE LO QUE GASTÓ</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#EAF0F7]">
                <th className={th}>Concepto</th>
                <th className={`${th} w-[170px]`}>Dónde</th>
                <th className={`${th} w-[110px] text-right`}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {inf.rubros.length === 0 && (
                <tr>
                  <td colSpan={3} className={`${td} text-[#4A5565]`}>No registró gastos de sus departamentos en este período.</td>
                </tr>
              )}
              {inf.rubros.map((r) => (
                <Fragment key={r.numero}>
                  <tr className="bg-[#F2F5F9]">
                    <td colSpan={2} className={`${td} font-bold`}>{r.numero}. {r.nombre}</td>
                    <td className={`${tdNum} font-bold`}>{n(r.total)}</td>
                  </tr>
                  {r.items.map((it, i) => (
                    <tr key={`r${r.numero}-${i}`}>
                      <td className={`${td} pl-5`}>{it.descripcion} · {fechaCorta(it.fecha)}</td>
                      <td className={td}>{it.lugar}</td>
                      <td className={tdNum}>{n(it.monto)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#1C3A5E] text-white font-bold">
                <td colSpan={2} className="px-2 py-1.5">TOTAL GASTOS</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">{dinero(inf.gastos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {inf.porPagar.length > 0 && (
          <div>
            <div className={banda}>GASTOS POR PAGAR DE SUS DEPARTAMENTOS</div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {inf.porPagar.map((p, i) => (
                  <tr key={i} className={p.vencido ? 'bg-[#FBEDEA]' : ''}>
                    <td className={td}>{p.vencido ? 'VENCIDO · ' : ''}{p.titulo}</td>
                    <td className={td}>{p.lugar}</td>
                    <td className={td}>hasta el {fechaCorta(p.vence)}</td>
                    <td className={tdNum}>{n(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {a.compartidos.length > 0 && (
          <div>
            <div className={banda}>MOVIMIENTOS COMPARTIDOS DEL EDIFICIO (NO SUMADOS ARRIBA)</div>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {a.compartidos.map((c, i) => (
                  <tr key={i}>
                    <td className={td}>{fechaCorta(c.fecha)}</td>
                    <td className={td}>{c.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} · {c.descripcion} · {c.lugar}</td>
                    <td className={td}>Entre {c.entre.join(', ')}</td>
                    <td className={tdNum}>{n(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-xs text-[#4A5565]">Son del edificio en general y en él administran varias personas: no se le descuentan a nadie. Para asignarlos, cargalos con el departamento.</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-10 mt-auto pt-8">
          {[a.nombre, 'Revisado por la familia'].map((t) => (
            <div key={t} className="text-center">
              <div className="h-12 border-b-2 border-[#1C3A5E]" />
              <div className="font-bold text-[#1C3A5E] mt-1 uppercase">{t}</div>
              <div className="text-[#4A5565]">{t === a.nombre ? 'Administrador/a' : 'Firma y fecha'}</div>
            </div>
          ))}
        </div>
      </Hoja>
    </div>
  )
}
