'use client'

import { Informe } from '@/lib/informe'
import { formatoBs, fechaCorta } from '@/lib/esquemaPago'

// Informe "para que lo entienda toda la familia": frase del mes,
// tres números grandes, semáforo, de dónde vino y en qué se fue la
// plata, deudas en plan de pago, lo que viene y un glosario corto.

const NIVEL = {
  rojo: { fondo: 'bg-[#FBEDEA]', texto: 'text-[#8A3324]', etiqueta: 'Atrasado' },
  amarillo: { fondo: 'bg-[#FBF4E4]', texto: 'text-[#6A5011]', etiqueta: 'Para tener en cuenta' },
  verde: { fondo: 'bg-[#E8F3EC]', texto: 'text-[#1F5E43]', etiqueta: 'Al día' },
}

function IconoNivel({ nivel }: { nivel: 'rojo' | 'amarillo' | 'verde' }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (nivel === 'rojo') return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 8l8 8M16 8l-8 8" /></svg>
  if (nivel === 'amarillo') return <svg {...p}><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16 10" /></svg>
}

function Barras({ items, color }: { items: { etiqueta: string; monto: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((i) => i.monto))
  if (!items.length) return <div className="text-sm text-[#4A5565]">No hay movimientos este mes.</div>
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <div key={i.etiqueta} className="break-inside-avoid">
          <div className="flex justify-between gap-3 text-[15px]">
            <span>{i.etiqueta}</span>
            <b className="whitespace-nowrap">{formatoBs(i.monto)}</b>
          </div>
          <div className="h-3 bg-[#E6EBF1] rounded-md mt-1.5">
            <div className="h-3 rounded-md" style={{ width: `${Math.max(2, (i.monto / max) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function InformeSimple({ inf, marca = 'Finanzas de la familia', personal = false }: { inf: Informe; marca?: string; personal?: boolean }) {
  const dif = inf.resultado - inf.resultadoMesAnterior
  const tarjeta = 'bg-white border border-[#DCE2EA] rounded-2xl p-6 print:rounded-none print:p-4 break-inside-avoid'
  const titulo = 'm-0 mb-1 font-display text-[22px] font-bold text-[#132A45]'

  return (
    <div className="flex flex-col gap-6 text-[#1F2733] print:gap-4">
      <div className="bg-[#1C3A5E] border-b-4 border-[#B3831F] rounded-2xl print:rounded-none px-6 py-5 text-white">
        <div className="text-[13px] uppercase tracking-wider text-[#C9D6E6] font-semibold">{marca}{inf.propiedadNombre ? ` · ${inf.propiedadNombre}` : ''}</div>
        <h1 className="m-0 mt-1 font-display text-3xl font-bold">Informe de {inf.etiqueta.toLowerCase()}</h1>
      </div>

      <section className={tarjeta}>
        <div className="text-sm font-bold text-[#6A5011] uppercase tracking-wide">El mes en una frase</div>
        <p className="m-0 mt-2 font-display text-2xl leading-snug text-[#132A45]">{inf.frase}</p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4">
        <div className={tarjeta}>
          <div className="text-[15px] text-[#4A5565] font-semibold">Entró</div>
          <div className="font-display text-3xl font-bold text-[#1F5E43] mt-1">{formatoBs(inf.ingresos)}</div>
        </div>
        <div className={tarjeta}>
          <div className="text-[15px] text-[#4A5565] font-semibold">Salió</div>
          <div className="font-display text-3xl font-bold text-[#8A3324] mt-1">{formatoBs(inf.gastos)}</div>
        </div>
        <div className="bg-[#1C3A5E] rounded-2xl print:rounded-none p-6 print:p-4 break-inside-avoid">
          <div className="text-[15px] text-[#C9D6E6] font-semibold">{inf.resultado >= 0 ? (personal ? 'Te quedó' : 'Quedó para la familia') : 'Faltó este mes'}</div>
          <div className="font-display text-3xl font-bold text-white mt-1">{formatoBs(Math.abs(inf.resultado))}</div>
          <div className="text-sm text-[#C9D6E6] mt-1">
            {dif === 0 ? 'Igual que el mes anterior' : `${formatoBs(Math.abs(dif))} ${dif > 0 ? 'más' : 'menos'} que el mes anterior`}
          </div>
        </div>
      </section>

      <section className={tarjeta}>
        <h2 className={titulo}>¿Está todo en orden?</h2>
        <p className="m-0 mb-4 text-[15px] text-[#4A5565]">Cada alquiler, deuda y gasto por pagar, con su estado. Primero lo que necesita atención.</p>
        {inf.avisos.length === 0 && <div className="text-sm text-[#4A5565]">No hay nada pendiente para este mes.</div>}
        <div className="flex flex-col gap-2.5">
          {inf.avisos.map((a, i) => (
            <div key={i} className={`grid grid-cols-1 sm:grid-cols-[170px_1fr] print:grid-cols-[170px_1fr] gap-1 sm:gap-4 px-4 py-3 rounded-xl ${NIVEL[a.nivel].fondo} break-inside-avoid`}>
              <span className={`inline-flex items-center gap-1.5 font-bold text-[15px] ${NIVEL[a.nivel].texto}`}>
                <IconoNivel nivel={a.nivel} />
                {NIVEL[a.nivel].etiqueta}
              </span>
              <div className="text-base leading-snug">
                <b>{a.titulo}</b>
                <br />
                <span className="text-[#4A5565]">{a.detalle}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-4">
        <div className={tarjeta}>
          <h2 className={`${titulo} mb-4`}>¿De dónde vino la plata?</h2>
          <Barras items={inf.ingresosPorOrigen} color="#2F6FB0" />
        </div>
        <div className={tarjeta}>
          <h2 className={`${titulo} mb-4`}>¿En qué se gastó?</h2>
          <Barras items={inf.gastosPorCategoria} color="#C46A2B" />
        </div>
      </section>

      {inf.deudas.filter((x) => x.deuda.estado !== 'cancelada' || x.cobradoMes > 0).length > 0 && (
        <section className={tarjeta}>
          <h2 className={titulo}>Deudas que estamos cobrando</h2>
          <p className="m-0 mb-4 text-[15px] text-[#4A5565]">Inquilinos que quedaron debiendo y firmaron un plan de pago.</p>
          <div className="flex flex-col gap-3">
            {inf.deudas
              .filter((x) => x.deuda.estado !== 'cancelada' || x.cobradoMes > 0)
              .map((x) => (
                <div key={x.deuda.id} className="border border-[#DCE2EA] rounded-xl p-4 break-inside-avoid">
                  <div className="flex justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-lg font-bold">{x.deuda.deudorNombre}</div>
                      <div className="text-sm text-[#4A5565]">
                        {x.deuda.concepto}
                        {x.lugar ? ` · ${x.lugar}` : ''}
                        {x.deuda.acreedorNombre ? ` · le debe a ${x.deuda.acreedorNombre}` : ''} · firmado el {fechaCorta(x.deuda.fechaAcuerdo)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[#4A5565]">Falta cobrar</div>
                      <div className="font-display text-2xl font-bold text-[#132A45]">{formatoBs(x.resumen.saldo)}</div>
                    </div>
                  </div>
                  <div className="h-3.5 bg-[#E6EBF1] rounded-md mt-3 mb-2">
                    <div className="h-3.5 bg-[#1F5E43] rounded-md" style={{ width: `${Math.max(1, x.resumen.porcentaje)}%` }} />
                  </div>
                  <div className="flex justify-between flex-wrap gap-2 text-sm text-[#4A5565]">
                    <span>
                      {x.resumen.cuotasPagadas} de {x.resumen.cantidadCuotas} cuotas pagadas · cobrado {formatoBs(x.resumen.pagado)}
                    </span>
                    {x.resumen.proxima && (
                      <span>
                        Próxima: <b className="text-[#1F2733]">{formatoBs(x.resumen.proxima.monto)} el {fechaCorta(x.resumen.proxima.vence)}</b>
                        {x.resumen.ultima ? ` · termina el ${fechaCorta(x.resumen.ultima.vence)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {inf.porPagar.length > 0 && (
        <section className={tarjeta}>
          <h2 className={titulo}>Lo que hay que pagar</h2>
          <p className="m-0 mb-4 text-[15px] text-[#4A5565]">Expensas, servicios e impuestos con vencimiento en los próximos dos meses (o ya vencidos).</p>
          <div className="flex flex-col gap-2">
            {inf.porPagar.map((p, i) => (
              <div key={i} className={`flex justify-between gap-3 flex-wrap px-4 py-3 rounded-xl break-inside-avoid ${p.vencido || p.numeroVencimiento > 1 ? 'bg-[#FBEDEA]' : 'bg-[#F7F9FB] border border-[#E6EBF1]'}`}>
                <div>
                  <div className="font-bold">{p.titulo}</div>
                  <div className="text-sm text-[#4A5565]">
                    {p.vencido ? 'Venció' : `${p.numeroVencimiento}.º vencimiento`} el {fechaCorta(p.vence)}
                    {p.lugar ? ` · ${p.lugar}` : ''}
                    {!p.vencido && p.ahorro > 0 ? ` · después sube ${formatoBs(p.ahorro)}` : ''}
                  </div>
                </div>
                <div className={`font-display text-xl font-bold whitespace-nowrap ${p.vencido ? 'text-[#8A3324]' : 'text-[#132A45]'}`}>{formatoBs(p.monto)}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 pt-3 border-t border-[#E6EBF1] font-bold">
            <span>Total a pagar</span>
            <span className="font-display text-xl text-[#132A45]">{formatoBs(inf.porPagar.reduce((s, p) => s + p.monto, 0))}</span>
          </div>
        </section>
      )}

      {(inf.proximos.length > 0 || !personal) && (
      <section className={tarjeta}>
        <h2 className={`${titulo} mb-4`}>Lo que tiene que entrar en los próximos dos meses</h2>
        {inf.proximos.length === 0 ? (
          <div className="text-sm text-[#4A5565]">No hay cobros programados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[15px] min-w-[520px]">
              <thead>
                <tr className="text-left text-[#4A5565] text-sm">
                  <th className="py-2 px-2.5 border-b-2 border-[#1C3A5E]">Cuándo</th>
                  <th className="py-2 px-2.5 border-b-2 border-[#1C3A5E]">Quién</th>
                  <th className="py-2 px-2.5 border-b-2 border-[#1C3A5E]">Por qué</th>
                  <th className="py-2 px-2.5 border-b-2 border-[#1C3A5E] text-right">Cuánto</th>
                </tr>
              </thead>
              <tbody>
                {inf.proximos.map((p, i) => (
                  <tr key={i} className={i % 2 ? 'bg-[#F7F9FB]' : ''}>
                    <td className="py-2 px-2.5 border-b border-[#E6EBF1] whitespace-nowrap">
                      {p.desde ? `${Number(p.desde.slice(8, 10))} al ${Number(p.fecha.slice(8, 10))}/${p.fecha.slice(5, 7)}` : fechaCorta(p.fecha)}
                    </td>
                    <td className="py-2 px-2.5 border-b border-[#E6EBF1]">{p.quien}</td>
                    <td className="py-2 px-2.5 border-b border-[#E6EBF1]">{p.concepto}</td>
                    <td className="py-2 px-2.5 border-b border-[#E6EBF1] text-right font-bold whitespace-nowrap">{formatoBs(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-3 px-2.5 font-bold">Total esperado</td>
                  <td className="py-3 px-2.5 text-right font-display text-xl font-bold text-[#132A45] whitespace-nowrap">
                    {formatoBs(inf.proximos.reduce((s, p) => s + p.monto, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      )}

      <section className="bg-[#EEF2F7] rounded-2xl print:rounded-none px-6 py-5 break-inside-avoid">
        <h2 className="m-0 mb-3 font-display text-xl font-bold text-[#132A45]">¿Qué quiere decir cada palabra?</h2>
        <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-7 gap-y-3 text-[15px] leading-snug">
          <div><dt className="font-bold">Canon</dt><dd className="m-0 text-[#4A5565]">Lo que paga el inquilino por mes.</dd></div>
          <div><dt className="font-bold">Proporcional</dt><dd className="m-0 text-[#4A5565]">Se cobran solo los días que vivió ese mes (por ejemplo, 10 días de 30).</dd></div>
          <div><dt className="font-bold">Saldo</dt><dd className="m-0 text-[#4A5565]">Lo que todavía falta cobrar.</dd></div>
          <div><dt className="font-bold">Plan de pago</dt><dd className="m-0 text-[#4A5565]">Acuerdo firmado para pagar una deuda en cuotas mensuales.</dd></div>
          {inf.porPagar.length > 0 && (
            <div><dt className="font-bold">1.º y 2.º vencimiento</dt><dd className="m-0 text-[#4A5565]">Hasta el 1.º se paga el monto normal; después, con recargo.</dd></div>
          )}
        </dl>
      </section>

      <p className="m-0 text-[13px] text-[#5A6473] text-center">
        Datos registrados hasta el {fechaCorta(inf.referencia)} · Generado desde Finanzas de la familia el {fechaCorta(new Date().toISOString().slice(0, 10))}
      </p>
    </div>
  )
}
