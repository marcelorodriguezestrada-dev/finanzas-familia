// Arma los datos del informe mensual (vista simple para la familia y
// liquidación estilo expensas) a partir de lo que ya está cargado:
// movimientos, alquileres (con su plan de pago), deudas, propiedades y
// unidades. Código puro: se usa en /informe y es fácil de probar.

import { Cuota, generarCronograma, esquemaDeAlquiler, cuotaDelMes, proximoAumento, redondear, etiquetaMes, formatoBs, fechaCorta } from './esquemaPago'
import { resumirDeuda, ordenarCuotas, CATEGORIA_COBRO_DEUDA, ResumenDeuda } from './deudas'
import { vencimientoVigente } from './pendientes'

// Recargo por día de atraso que fija el contrato (cláusula de mora).
export const MORA_DIARIA = 30

export type DatosInforme = {
  movimientos: any[]
  alquileres: any[]
  deudas: any[]
  propiedades: any[]
  unidades: any[]
  pendientes?: any[] // gastos por pagar (expensas, servicios...)
}

export type EstadoCuenta = 'al_dia' | 'pendiente' | 'atrasado'

export type CuentaAlquiler = {
  alquiler: any
  lugar: string
  saldoAnterior: number
  cargoMes: number
  cuotaMes: Cuota | null
  pagosMes: number
  cobrosMes: any[] // movimientos del mes
  deuda: number // lo que queda debiendo al cierre (negativo = a favor)
  diasAtraso: number
  mora: number
  venceImpago: string | null
  proxima: Cuota | null
  estado: EstadoCuenta
}

export type Aviso = { nivel: 'rojo' | 'amarillo' | 'verde'; titulo: string; detalle: string }

export type ItemMonto = { etiqueta: string; monto: number }
export type Rubro = { numero: number; nombre: string; items: { descripcion: string; fecha: string; lugar: string; monto: number }[]; total: number; porcentaje: number }

export type CuentaDeuda = { deuda: any; lugar: string; resumen: ResumenDeuda; cobradoMes: number }

export type Informe = {
  mes: string
  etiqueta: string // "Septiembre 2026"
  referencia: string // fecha con la que se evalúan atrasos
  propiedadNombre: string | null
  ingresos: number
  gastos: number
  resultado: number
  resultadoMesAnterior: number
  ingresosPorOrigen: ItemMonto[]
  gastosPorCategoria: ItemMonto[]
  rubros: Rubro[]
  cuentas: CuentaAlquiler[]
  deudas: CuentaDeuda[]
  avisos: Aviso[]
  proximos: { fecha: string; quien: string; concepto: string; monto: number; desde?: string }[]
  // Lo que hay que pagar: gastos por pagar vencidos o que vencen en los próximos 2 meses.
  porPagar: { titulo: string; lugar: string; vence: string; monto: number; numeroVencimiento: number; vencido: boolean; ahorro: number }[]
  caja: {
    saldoAnterior: number
    alquileresEnTermino: number
    alquileresAtrasados: number
    cuotasDeuda: number
    otrosIngresos: number
    egresos: number
    saldoCierre: number
  }
  patrimonio: { disponible: number; alquileresProximos: number; alquileresAtrasados: number; deudasEnPlan: number; mora: number; gastosPorPagar: number; neto: number }
  pendientes: { quien: string; origen: string; situacion: string; saldo: number }[]
  frase: string
}

export function sumarMesClave(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

function ultimoDia(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`
}

function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000)
}

const esIngreso = (m: any) => m.tipo === 'ingreso'
const monto = (m: any) => Number(m.monto) || 0

export function armarInforme(d: DatosInforme, mes: string, opts: { propiedadId?: string | null; soloInmuebles?: boolean; hoy?: string; personal?: boolean } = {}): Informe {
  const hoy = opts.hoy || new Date().toISOString().slice(0, 10)
  const inicio = `${mes}-01`
  const fin = ultimoDia(mes)
  // Fecha con la que se juzga si algo "venció": hoy si es el mes en
  // curso, el último día si es un mes pasado.
  const referencia = hoy < inicio ? inicio : hoy > fin ? fin : hoy
  const propiedadId = opts.propiedadId || null

  const nombreProp = (id: string) => d.propiedades.find((p) => p.id === id)?.nombre || ''
  const nombreUni = (id: string) => d.unidades.find((u) => u.id === id)?.nombre || ''
  const lugarDe = (x: any) => [nombreProp(x?.propiedadId), nombreUni(x?.unidadId)].filter(Boolean).join(' — ')

  // Filtro: la liquidación solo mira lo de los inmuebles (y de una
  // propiedad si se eligió); el informe simple mira todo.
  const movs = d.movimientos.filter((m) => {
    if (propiedadId) return m.propiedadId === propiedadId
    if (opts.soloInmuebles) return !!m.propiedadId || !!m.alquilerId || !!m.deudaId
    return true
  })
  const alquileres = d.alquileres.filter((a) => !propiedadId || a.propiedadId === propiedadId)
  const deudas = d.deudas.filter((x) => x.estado !== 'anulada' && (!propiedadId || x.propiedadId === propiedadId))
  const pendientes = (d.pendientes || []).filter((p) => {
    if (p.estado !== 'pendiente') return false
    if (propiedadId) return p.propiedadId === propiedadId
    if (opts.soloInmuebles) return !!p.propiedadId
    return true
  })

  const delMes = movs.filter((m) => m.fecha >= inicio && m.fecha <= fin)
  const ingresos = redondear(delMes.filter(esIngreso).reduce((s, m) => s + monto(m), 0))
  const gastos = redondear(delMes.filter((m) => !esIngreso(m)).reduce((s, m) => s + monto(m), 0))

  const mesAnt = sumarMesClave(mes, -1)
  const delMesAnt = movs.filter((m) => m.fecha >= `${mesAnt}-01` && m.fecha <= ultimoDia(mesAnt))
  const resultadoMesAnterior = redondear(delMesAnt.reduce((s, m) => s + (esIngreso(m) ? monto(m) : -monto(m)), 0))

  // ---- Cuentas por alquiler
  const cuentas: CuentaAlquiler[] = []
  for (const a of alquileres) {
    const esquema = esquemaDeAlquiler(a)
    if (!esquema || !a.fechaInicio) continue
    const crono = generarCronograma({ fechaInicio: a.fechaInicio, fechaFin: a.fechaFin || null, diaCobro: a.diaCobro, esquema, proyectarHasta: sumarMesClave(mes, 2) })
    const cobros = d.movimientos.filter((m) => m.alquilerId === a.id && esIngreso(m) && m.categoria !== CATEGORIA_COBRO_DEUDA)
    const cargosAntes = crono.filter((c) => c.mes < mes).reduce((s, c) => s + c.monto, 0)
    const pagosAntes = cobros.filter((m) => m.fecha < inicio).reduce((s, m) => s + monto(m), 0)
    const cuotaMes = crono.find((c) => c.mes === mes) || null
    const cobrosMes = cobros.filter((m) => m.fecha >= inicio && m.fecha <= fin)
    const pagosMes = cobrosMes.reduce((s, m) => s + monto(m), 0)
    const saldoAnterior = redondear(cargosAntes - pagosAntes)
    const cargoMes = cuotaMes?.monto || 0
    const deuda = redondear(saldoAnterior + cargoMes - pagosMes)

    // La cuota impaga más vieja (los pagos se imputan en orden).
    let pagado = pagosAntes + pagosMes
    let venceImpago: string | null = null
    for (const c of crono.filter((c) => c.mes <= mes)) {
      if (pagado + 0.01 >= c.monto) {
        pagado -= c.monto
      } else {
        venceImpago = c.vence
        break
      }
    }
    const diasAtraso = deuda > 0.01 && venceImpago && venceImpago < referencia ? diasEntre(venceImpago, referencia) : 0
    const relevante = a.estado === 'activo' || cargoMes > 0 || Math.abs(deuda) > 0.01 || pagosMes > 0
    if (!relevante) continue
    cuentas.push({
      alquiler: a,
      lugar: lugarDe(a),
      saldoAnterior,
      cargoMes,
      cuotaMes,
      pagosMes: redondear(pagosMes),
      cobrosMes,
      deuda,
      diasAtraso,
      mora: diasAtraso * MORA_DIARIA,
      venceImpago,
      proxima: crono.find((c) => c.mes === sumarMesClave(mes, 1)) || null,
      estado: deuda <= 0.01 ? 'al_dia' : diasAtraso > 0 ? 'atrasado' : 'pendiente',
    })
  }

  // ---- Deudas en plan de pago
  const cuentasDeuda: CuentaDeuda[] = deudas.map((x) => ({
    deuda: x,
    lugar: lugarDe(x),
    resumen: resumirDeuda(x, referencia),
    cobradoMes: redondear(
      ordenarCuotas(x.cuotas || [])
        .filter((c) => c.pagada && c.pagadaEn && c.pagadaEn >= inicio && c.pagadaEn <= fin)
        .reduce((s, c) => s + Number(c.montoPagado ?? c.monto), 0)
    ),
  }))

  // ---- Origen de ingresos y destino de gastos
  const agrupar = (lista: any[], clave: (m: any) => string) => {
    const mapa = new Map<string, number>()
    for (const m of lista) mapa.set(clave(m), (mapa.get(clave(m)) || 0) + monto(m))
    return Array.from(mapa.entries())
      .map(([etiqueta, v]) => ({ etiqueta, monto: redondear(v) }))
      .sort((x, y) => y.monto - x.monto)
  }
  const ingresosPorOrigen = agrupar(delMes.filter(esIngreso), (m) =>
    m.categoria === CATEGORIA_COBRO_DEUDA
      ? 'Cuotas de deudas cobradas'
      : m.alquilerId
      ? lugarDe(d.alquileres.find((a) => a.id === m.alquilerId)) || m.categoria
      : m.propiedadId
      ? lugarDe(m) || m.categoria
      : m.categoria
  )
  const gastosMes = delMes.filter((m) => !esIngreso(m))
  const gastosPorCategoria = agrupar(gastosMes, (m) => m.categoria || 'Otro')
  const rubros: Rubro[] = gastosPorCategoria.map((g, i) => ({
    numero: i + 1,
    nombre: g.etiqueta.toUpperCase(),
    items: gastosMes
      .filter((m) => (m.categoria || 'Otro') === g.etiqueta)
      .sort((x, y) => x.fecha.localeCompare(y.fecha))
      .map((m) => ({ descripcion: m.descripcion || m.categoria, fecha: m.fecha, lugar: lugarDe(m) || 'General', monto: monto(m) })),
    total: g.monto,
    porcentaje: gastos > 0 ? Math.round((g.monto / gastos) * 1000) / 10 : 0,
  }))

  // ---- Caja del mes
  const saldoAnteriorCaja = redondear(movs.filter((m) => m.fecha < inicio).reduce((s, m) => s + (esIngreso(m) ? monto(m) : -monto(m)), 0))
  let enTermino = 0, atrasados = 0, cuotasDeuda = 0, otros = 0
  for (const m of delMes.filter(esIngreso)) {
    if (m.categoria === CATEGORIA_COBRO_DEUDA) cuotasDeuda += monto(m)
    else if (m.categoria === 'Alquiler' && m.alquilerId) {
      const a = d.alquileres.find((x) => x.id === m.alquilerId)
      const c = a ? cuotaDelMes(a, mes) : null
      if (!c || m.fecha <= c.vence) enTermino += monto(m)
      else atrasados += monto(m)
    } else otros += monto(m)
  }
  const caja = {
    saldoAnterior: saldoAnteriorCaja,
    alquileresEnTermino: redondear(enTermino),
    alquileresAtrasados: redondear(atrasados),
    cuotasDeuda: redondear(cuotasDeuda),
    otrosIngresos: redondear(otros),
    egresos: gastos,
    saldoCierre: redondear(saldoAnteriorCaja + ingresos - gastos),
  }

  // ---- Patrimonio y pendientes
  const alquileresProximos = redondear(cuentas.reduce((s, c) => s + (c.proxima?.monto || 0), 0))
  const alquileresAtrasados = redondear(cuentas.reduce((s, c) => s + Math.max(c.deuda, 0), 0))
  const deudasEnPlan = redondear(cuentasDeuda.filter((x) => x.deuda.estado !== 'cancelada').reduce((s, x) => s + x.resumen.saldo, 0))
  const mora = redondear(cuentas.reduce((s, c) => s + c.mora, 0))
  const gastosPorPagar = redondear(pendientes.reduce((s, p) => s + (vencimientoVigente(p, referencia)?.vencimiento.monto || 0), 0))
  const patrimonio = {
    disponible: caja.saldoCierre,
    alquileresProximos,
    alquileresAtrasados,
    deudasEnPlan,
    mora,
    gastosPorPagar,
    neto: redondear(caja.saldoCierre + alquileresProximos + alquileresAtrasados + deudasEnPlan + mora - gastosPorPagar),
  }
  const pendientesCobro = [
    ...cuentas
      .filter((c) => c.deuda > 0.01)
      .map((c) => ({
        quien: c.alquiler.inquilinoNombre,
        origen: `${c.lugar || 'Alquiler'} · alquiler`,
        situacion: c.diasAtraso > 0 ? `${c.diasAtraso} días de atraso (recargo ${formatoBs(c.mora)})` : `vence el ${fechaCorta(c.venceImpago || '')}`,
        saldo: c.deuda,
      })),
    ...cuentasDeuda
      .filter((x) => x.deuda.estado !== 'cancelada' && x.resumen.saldo > 0)
      .map((x) => ({
        quien: x.deuda.deudorNombre,
        origen: `${x.deuda.concepto}${x.lugar ? ` · ${x.lugar}` : ''} · acuerdo ${fechaCorta(x.deuda.fechaAcuerdo)}`,
        situacion: `Plan de ${x.resumen.cantidadCuotas} cuotas · ${x.resumen.cuotasPagadas} pagadas${x.resumen.proxima ? ` · próxima ${fechaCorta(x.resumen.proxima.vence)} ${formatoBs(x.resumen.proxima.monto)}` : ''}${x.resumen.vencidas.length ? ` · ${x.resumen.vencidas.length} vencidas` : ''}`,
        saldo: x.resumen.saldo,
      })),
  ]

  // ---- Avisos (semáforo)
  const avisos: Aviso[] = []
  for (const c of cuentas) {
    const quien = c.alquiler.inquilinoNombre
    if (c.estado === 'atrasado') {
      avisos.push({ nivel: 'rojo', titulo: `${quien} · ${c.lugar}`, detalle: `Debe ${formatoBs(c.deuda)}. Lleva ${c.diasAtraso} días de atraso (recargo de ${formatoBs(MORA_DIARIA)} por día: ${formatoBs(c.mora)}).` })
    } else if (c.estado === 'pendiente') {
      avisos.push({ nivel: 'amarillo', titulo: `${quien} · ${c.lugar}`, detalle: `Todavía no pagó ${formatoBs(c.deuda)}; vence el ${fechaCorta(c.venceImpago || '')}.` })
    } else if (c.pagosMes > 0) {
      avisos.push({
        nivel: 'verde',
        titulo: `${quien} · ${c.lugar}`,
        detalle: `Pagó ${formatoBs(c.pagosMes)}${c.cuotaMes && c.cuotaMes.tipo !== 'completa' ? ` (proporcional ${c.cuotaMes.dias} días)` : ''}.${c.proxima ? ` Próximo: ${formatoBs(c.proxima.monto)} hasta el ${fechaCorta(c.proxima.vence)}.` : ''}`,
      })
    } else {
      avisos.push({ nivel: 'verde', titulo: `${quien} · ${c.lugar}`, detalle: 'Al día.' })
    }
    const aum = c.alquiler.estado === 'activo' ? proximoAumento(generarCronograma({ fechaInicio: c.alquiler.fechaInicio, fechaFin: c.alquiler.fechaFin || null, diaCobro: c.alquiler.diaCobro, esquema: esquemaDeAlquiler(c.alquiler)!, proyectarHasta: sumarMesClave(mes, 4) }), mes) : null
    if (aum && aum.mes <= sumarMesClave(mes, 4)) {
      avisos.push({ nivel: 'amarillo', titulo: c.lugar || quien, detalle: `Desde ${aum.etiqueta.toLowerCase()} el alquiler sube de ${formatoBs(aum.anterior)} a ${formatoBs(aum.monto)}, como dice el contrato.` })
    }
    if (c.alquiler.estado === 'activo' && c.alquiler.fechaFin) {
      const dias = diasEntre(referencia, c.alquiler.fechaFin)
      if (dias >= 0 && dias <= 60) avisos.push({ nivel: 'amarillo', titulo: c.lugar || quien, detalle: `El contrato de ${quien} vence el ${fechaCorta(c.alquiler.fechaFin)} (en ${dias} días). Hay que decidir si se renueva.` })
    }
  }
  for (const x of cuentasDeuda) {
    const r = x.resumen
    if (x.deuda.estado === 'cancelada') {
      if (x.cobradoMes > 0) avisos.push({ nivel: 'verde', titulo: `${x.deuda.deudorNombre} · deuda`, detalle: `Terminó de pagar la deuda (${formatoBs(r.totalCuotas)}).` })
      continue
    }
    if (r.vencidas.length) {
      avisos.push({ nivel: 'rojo', titulo: `${x.deuda.deudorNombre} · deuda en plan de pago`, detalle: `${r.vencidas.length} ${r.vencidas.length === 1 ? 'cuota vencida' : 'cuotas vencidas'} sin pagar (${formatoBs(r.montoVencido)}). Falta cobrar ${formatoBs(r.saldo)} en total.` })
    } else if (r.proxima) {
      avisos.push({
        nivel: x.cobradoMes > 0 ? 'verde' : 'amarillo',
        titulo: `${x.deuda.deudorNombre} · deuda en plan de pago`,
        detalle: `${x.cobradoMes > 0 ? `Pagó ${formatoBs(x.cobradoMes)} este mes. ` : ''}Debe ${formatoBs(r.saldo)} en ${r.cantidadCuotas - r.cuotasPagadas} cuotas. La próxima, de ${formatoBs(r.proxima.monto)}, vence el ${fechaCorta(r.proxima.vence)}.`,
      })
    }
  }
  // Gastos por pagar (expensas, servicios...)
  const hastaPagar = ultimoDia(sumarMesClave(mes, 2))
  const porPagar: Informe['porPagar'] = []
  for (const p of pendientes) {
    const v = vencimientoVigente(p, referencia)
    if (!v) continue
    const lugar = lugarDe(p)
    if (v.vencidoTodo) {
      avisos.push({ nivel: 'rojo', titulo: p.titulo, detalle: `Venció el ${fechaCorta(v.vencimiento.fecha)} sin pagarse (${formatoBs(v.vencimiento.monto)}). Puede generar intereses en la próxima liquidación.` })
    } else if (v.vencimiento.numero > 1) {
      avisos.push({ nivel: 'rojo', titulo: p.titulo, detalle: `Pasó el 1.º vencimiento: ahora son ${formatoBs(v.vencimiento.monto)} hasta el ${fechaCorta(v.vencimiento.fecha)}.` })
    } else if (v.vencimiento.fecha <= hastaPagar) {
      avisos.push({
        nivel: 'amarillo',
        titulo: p.titulo,
        detalle: `Pagar ${formatoBs(v.vencimiento.monto)} hasta el ${fechaCorta(v.vencimiento.fecha)}${v.ahorroSiPagaHoy > 0 ? `; después sube ${formatoBs(v.ahorroSiPagaHoy)}` : ''}.`,
      })
    }
    if (Number(p.interesMora) > 0) {
      avisos.push({ nivel: 'amarillo', titulo: p.titulo, detalle: `Esta liquidación trae ${formatoBs(Number(p.interesMora))} de interés por mora de un mes anterior.` })
    }
    if (v.vencidoTodo || v.vencimiento.fecha <= hastaPagar) {
      porPagar.push({ titulo: p.titulo, lugar, vence: v.vencimiento.fecha, monto: v.vencimiento.monto, numeroVencimiento: v.vencimiento.numero, vencido: v.vencidoTodo, ahorro: v.ahorroSiPagaHoy })
    }
  }
  porPagar.sort((a, b) => a.vence.localeCompare(b.vence))

  const orden = { rojo: 0, amarillo: 1, verde: 2 }
  avisos.sort((x, y) => orden[x.nivel] - orden[y.nivel])

  // ---- Lo que tiene que entrar en los próximos 2 meses
  const desde = sumarMesClave(mes, 1)
  const hasta = sumarMesClave(mes, 2)
  const proximos: Informe['proximos'] = []
  for (const c of cuentas) {
    if (c.alquiler.estado !== 'activo') continue
    const crono = generarCronograma({ fechaInicio: c.alquiler.fechaInicio, fechaFin: c.alquiler.fechaFin || null, diaCobro: c.alquiler.diaCobro, esquema: esquemaDeAlquiler(c.alquiler)!, proyectarHasta: hasta })
    for (const q of crono.filter((q) => q.mes >= desde && q.mes <= hasta)) {
      proximos.push({
        fecha: q.vence,
        desde: q.tipo === 'proporcional_inicio' ? undefined : `${q.mes}-01`,
        quien: c.alquiler.inquilinoNombre,
        concepto: `Alquiler de ${etiquetaMes(q.mes).toLowerCase()}${c.lugar ? ` — ${c.lugar}` : ''}${q.tipo !== 'completa' ? ` (proporcional ${q.dias} días)` : ''}`,
        monto: q.monto,
      })
    }
  }
  for (const x of cuentasDeuda) {
    if (x.deuda.estado === 'cancelada') continue
    const cs = ordenarCuotas(x.deuda.cuotas || [])
    for (const q of cs.filter((q) => !q.pagada && q.vence.slice(0, 7) >= desde && q.vence.slice(0, 7) <= hasta)) {
      proximos.push({ fecha: q.vence, quien: x.deuda.deudorNombre, concepto: `Cuota ${q.numero} de ${cs.length} de la deuda`, monto: q.monto })
    }
  }
  proximos.sort((a, b) => a.fecha.localeCompare(b.fecha))

  const etiqueta = etiquetaMes(mes)
  const nombreMes = etiqueta.split(' ')[0].toLowerCase()
  const frase = `En ${nombreMes} entraron ${formatoBs(ingresos)}, se gastaron ${formatoBs(gastos)} y ${ingresos - gastos >= 0 ? `${opts.personal ? 'te quedaron' : 'le quedaron a la familia'} ${formatoBs(ingresos - gastos)}` : `${opts.personal ? 'te faltaron' : 'faltaron'} ${formatoBs(gastos - ingresos)}`}.`

  return {
    mes, etiqueta, referencia,
    propiedadNombre: propiedadId ? nombreProp(propiedadId) : null,
    ingresos, gastos, resultado: redondear(ingresos - gastos), resultadoMesAnterior,
    ingresosPorOrigen, gastosPorCategoria, rubros, cuentas, deudas: cuentasDeuda, avisos, proximos, porPagar, caja, patrimonio, pendientes: pendientesCobro, frase,
  }
}

// Texto para mandar por WhatsApp (sin formato raro: se lee bien en
// cualquier celular).
export function textoWhatsApp(inf: Informe, enlace?: string, titulo = 'Informe de la familia') {
  const ico = { rojo: '🔴', amarillo: '🟡', verde: '🟢' }
  const lineas = [
    `*${titulo} — ${inf.etiqueta}*`,
    '',
    inf.frase,
    `Entró: ${formatoBs(inf.ingresos)} · Salió: ${formatoBs(inf.gastos)} · ${inf.resultado >= 0 ? 'Quedó' : 'Faltó'}: ${formatoBs(Math.abs(inf.resultado))}`,
    '',
    '*¿Está todo en orden?*',
    ...inf.avisos.map((a) => `${ico[a.nivel]} ${a.titulo}: ${a.detalle}`),
  ]
  if (inf.proximos.length) {
    lineas.push('', '*Lo que tiene que entrar*')
    for (const p of inf.proximos.slice(0, 8)) lineas.push(`• ${fechaCorta(p.fecha)} — ${p.quien}: ${formatoBs(p.monto)}`)
  }
  if (inf.porPagar.length) {
    lineas.push('', '*Lo que hay que pagar*')
    for (const p of inf.porPagar) lineas.push(`• ${p.vencido ? 'VENCIDO ' : ''}${fechaCorta(p.vence)} — ${p.titulo}: ${formatoBs(p.monto)}`)
  }
  if (enlace) lineas.push('', `Informe completo: ${enlace}`)
  return lineas.join('\n')
}
