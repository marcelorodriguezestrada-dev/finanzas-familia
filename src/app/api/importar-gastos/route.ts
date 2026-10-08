import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { pedirJsonAGroq, GroqError } from '@/lib/groq'

export const dynamic = 'force-dynamic'

// POST { accion: 'planilla', url } — baja una planilla de Google Sheets
//   como CSV (tiene que estar compartida "cualquier persona con el
//   enlace puede ver"). El CSV se interpreta en el navegador.
// POST { accion: 'texto', texto, hoy } — la IA saca de un texto libre
//   (mensaje, mail, lista, o el texto que el OCR leyó de una foto de
//   factura) la lista de gastos/ingresos con fecha y monto.
// No guarda nada: la pantalla muestra todo para revisar antes.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const body = await req.json()

    if (body.accion === 'planilla') {
      const csvUrl = urlCsvDeGoogleSheets(String(body.url || ''))
      if (!csvUrl) return NextResponse.json({ error: 'Pegá el enlace de una planilla de Google Sheets (docs.google.com/spreadsheets/...).' }, { status: 400 })
      const res = await fetch(csvUrl, { redirect: 'follow', cache: 'no-store' })
      const tipo = res.headers.get('content-type') || ''
      const texto = await res.text()
      if (!res.ok || tipo.includes('text/html') || /^\s*<!DOCTYPE html/i.test(texto)) {
        return NextResponse.json(
          { error: 'No pude abrir la planilla. En Google Sheets tocá Compartir → "Cualquier persona con el enlace" → Lector, y volvé a probar. (O descargala como .xlsx o .csv y subila.)' },
          { status: 400 }
        )
      }
      return NextResponse.json({ csv: texto.slice(0, 2_000_000) })
    }

    if (body.accion === 'texto') {
      const texto = String(body.texto || '').trim()
      if (texto.length < 5) return NextResponse.json({ error: 'Pegá algo de texto para leer.' }, { status: 400 })
      const hoy = /^\d{4}-\d{2}-\d{2}$/.test(body.hoy || '') ? body.hoy : new Date().toISOString().slice(0, 10)
      const sistema = `Extraés gastos a pagar e ingresos de un texto en español de Argentina o Bolivia: una lista personal, un mensaje, un mail o el texto leído (con errores de OCR) de una factura de servicio, impuesto, expensa o tarjeta. Hoy es ${hoy}.
Reglas:
- Un elemento por cada gasto o ingreso distinto. No inventes: si no hay monto o fecha, null.
- servicio: nombre corto (ej "Luz Edenor", "Expensas 7-B", "ABL", "Tarjeta Visa"). lugar: propiedad o lugar si se menciona ("rivera", "moldes"), si no "".
- tipo: "gasto" o "ingreso".
- vencimiento: fecha de vencimiento YYYY-MM-DD (en facturas, el PRIMER vencimiento). Si hay 2.º vencimiento, ponelo en vencimiento2 con su monto2.
- monto: número (11.305,86 -> 11305.86). En facturas, el total a pagar.
- periodo: mes facturado "YYYY-MM" si figura.
- referencia: n.° de cliente, cuenta, partida o factura si figura.
- categoria: una de "Expensas", "Servicios (luz, agua, gas, internet)", "Impuestos", "Salud", "Educación", "Transporte", "Comida", "Alquiler", "Sueldo", "Otro".
Respondé SOLO JSON: {"items":[{"servicio":"","lugar":"","tipo":"gasto","categoria":"","vencimiento":null,"monto":null,"vencimiento2":null,"monto2":null,"periodo":null,"referencia":""}]}`
      const d = await pedirJsonAGroq<any>(sistema, texto.slice(0, 12000), 3000)
      const items = (Array.isArray(d?.items) ? d.items : []).slice(0, 200)
      if (!items.length) return NextResponse.json({ error: 'No encontré gastos ni ingresos en ese texto.' }, { status: 422 })
      return NextResponse.json({ items })
    }

    return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })
  } catch (err: any) {
    if (err instanceof GroqError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('POST /api/importar-gastos', err)
    return NextResponse.json({ error: err?.message || 'No se pudo leer.' }, { status: 500 })
  }
}

// Solo se aceptan enlaces de Google Sheets (no se descarga cualquier URL
// desde el servidor).
function urlCsvDeGoogleSheets(url: string): string | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (u.hostname !== 'docs.google.com' || !u.pathname.startsWith('/spreadsheets/')) return null
  // Planilla "publicada en la web" como CSV
  if (/\/pub$/.test(u.pathname) || u.searchParams.get('output') === 'csv') {
    u.searchParams.set('output', 'csv')
    return u.toString()
  }
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(u.pathname)
  if (!m) return null
  const gid = u.searchParams.get('gid') || /gid=(\d+)/.exec(u.hash)?.[1] || '0'
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`
}
