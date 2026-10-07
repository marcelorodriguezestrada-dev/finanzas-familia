// bajar-categorias-ml-v2.mjs
//
// Igual que la v1, pero en vez de `fetch` usa Puppeteer (un Chromium
// real) para pedir cada endpoint. El 403 que te tiraba la v1 es casi
// seguro protección anti-bot por huella TLS (Akamai u otro similar) —
// eso detecta que la conexión viene de un script de Node, sin importar
// qué headers le mandes encima, y ningún header lo arregla. Un
// navegador real sí pasa, porque la huella TLS es la de un Chrome de
// verdad — la misma protección no distingue "vos navegando a mano" de
// "Chromium navegando solo".
//
// Instalación (una sola vez):
//   npm install puppeteer
//
// Uso:
//   node bajar-categorias-ml-v2.mjs
//
// Salida: categorias-mercadolibre-ar.csv en la misma carpeta.

import puppeteer from 'puppeteer'
import { writeFileSync } from 'fs'

const SITE = 'MLA' // MLA = Argentina
const BASE = 'https://api.mercadolibre.com'
const DELAY_MS = 250 // un poco más generoso que la v1 — es un navegador real, no hay apuro
const MAX_DEPTH = 6

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

// Pide una URL de la API navegando de verdad con Puppeteer, y devuelve
// el JSON parseado del body de la respuesta.
async function fetchJSON(page, url, intentos = 3) {
  for (let i = 1; i <= intentos; i++) {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const status = res.status()
    if (status === 200) {
      const texto = await page.evaluate(() => document.body.innerText)
      try {
        return JSON.parse(texto)
      } catch (err) {
        throw new Error(`${url} devolvió 200 pero no se pudo parsear como JSON: ${err.message}`)
      }
    }
    if ((status === 403 || status === 429) && i < intentos) {
      console.warn(`  (reintentando ${url} — respondió ${status}, intento ${i}/${intentos})`)
      await sleep(800 * i)
      continue
    }
    throw new Error(`${url} respondió ${status}`)
  }
}

async function bajarHijos(page, categoriaId, ruta, filas, profundidad = 0) {
  if (profundidad > MAX_DEPTH) return

  let detalle
  try {
    detalle = await fetchJSON(page, `${BASE}/categories/${categoriaId}`)
  } catch (err) {
    console.error(`  ! Error bajando ${categoriaId}:`, err.message)
    return
  }
  await sleep(DELAY_MS)

  const hijos = detalle.children_categories || []

  if (hijos.length === 0) {
    filas.push({ id: categoriaId, nivel: ruta.length, ruta })
    return
  }

  for (const hijo of hijos) {
    const nuevaRuta = [...ruta, hijo.name]
    console.log('  '.repeat(profundidad) + '- ' + hijo.name)
    await bajarHijos(page, hijo.id, nuevaRuta, filas, profundidad + 1)
  }
}

function csvEscape(valor) {
  const s = String(valor ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

async function main() {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  // User-Agent explícito de Chrome de escritorio real, por las dudas
  // (Puppeteer ya trae uno razonable, pero lo fijamos para que no
  // delate que es headless)
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  )

  try {
    console.log(`Bajando categorías raíz de ${SITE}...`)
    const raices = await fetchJSON(page, `${BASE}/sites/${SITE}/categories`)
    console.log(`${raices.length} categorías raíz encontradas.\n`)

    const filas = []

    for (const raiz of raices) {
      console.log(`\n=== ${raiz.name} ===`)
      await bajarHijos(page, raiz.id, [raiz.name], filas)
    }

    const headers = [
      'id_hoja',
      'nivel',
      'categoria',
      'subcategoria',
      'sub_subcategoria',
      'sub_sub_subcategoria',
      'ruta_completa',
    ]
    const lineas = [headers.join(',')]

    for (const fila of filas) {
      const [c1, c2, c3, c4, ...resto] = fila.ruta
      const col4 = resto.length > 0 ? [c4, ...resto].filter(Boolean).join(' > ') : c4
      lineas.push(
        [
          fila.id,
          fila.nivel,
          csvEscape(c1 || ''),
          csvEscape(c2 || ''),
          csvEscape(c3 || ''),
          csvEscape(col4 || ''),
          csvEscape(fila.ruta.join(' > ')),
        ].join(',')
      )
    }

    const nombreArchivo = 'categorias-mercadolibre-ar.csv'
    writeFileSync(nombreArchivo, '\uFEFF' + lineas.join('\n'), 'utf8')

    console.log(`\n\nListo. ${filas.length} subcategorías finales (hojas del árbol) volcadas en ${nombreArchivo}`)
    console.log('Abrilo directo con Excel/Google Sheets.')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('Error general:', err)
  process.exitCode = 1
})
