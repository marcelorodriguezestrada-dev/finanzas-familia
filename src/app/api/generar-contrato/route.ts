import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { generarClausulasContrato, DatosContrato } from '@/lib/plantillaContrato'

export const dynamic = 'force-dynamic'

// Limpia saltos de línea, tabs y espacios raros de un texto antes de
// dibujarlo. Esto es necesario porque pdf-lib con las fuentes
// estándar (WinAnsi) no puede codificar el carácter de salto de línea
// (\n, 0x000a) si aparece dentro de una palabra al dibujar texto -
// solo sirve como separador de nuestras propias líneas ya envueltas.
// Los saltos de línea sueltos llegan sobre todo en cláusulas pegadas
// a mano o extraídas de un PDF con pdf-parse.
function limpiarTexto(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

// Corta un párrafo en líneas que entren en el ancho disponible,
// midiendo con la fuente real (si se corta "a ojo" por cantidad de
// caracteres, las negritas o números angostos generan renglones
// desparejos).
function envolverTexto(texto: string, font: any, tamano: number, anchoMax: number): string[] {
  const palabras = limpiarTexto(texto).split(' ')
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (font.widthOfTextAtSize(prueba, tamano) > anchoMax && actual) {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = prueba
    }
  }
  if (actual) lineas.push(actual)
  return lineas
}

// POST — recibe los datos del inquilino + condiciones + propiedad y
// devuelve el PDF armado (base64) listo para descargar, imprimir y
// firmar. No guarda nada en la base de datos: es un generador de
// documento, el archivo firmado se sube aparte por /api/subir-pdf al
// crear el alquiler.
export async function POST(req: NextRequest) {
  const chequeo = await requerirUsuarioAprobado(req)
  if ('error' in chequeo) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

  try {
    const datos = (await req.json()) as DatosContrato
    // clausulasSeleccionadas y clausulasExtra vienen del checklist en
    // el formulario; generarClausulasContrato ya sabe usar los valores
    // por defecto si no llegan (ver src/lib/plantillaContrato.ts).

    if (!datos.inquilinoNombre || !datos.inquilinoCI || !datos.montoMensual || !datos.fechaInicio) {
      return NextResponse.json({ error: 'Faltan datos del inquilino o de las condiciones del alquiler.' }, { status: 400 })
    }

    const { titulo, parrafos } = generarClausulasContrato(datos)

    const pdf = await PDFDocument.create()
    const fuente = await pdf.embedFont(StandardFonts.TimesRoman)
    const fuenteNegrita = await pdf.embedFont(StandardFonts.TimesRomanBold)

    const anchoPagina = 595.28 // A4 en puntos
    const altoPagina = 841.89
    const margen = 60
    const anchoTexto = anchoPagina - margen * 2
    const tamanoTexto = 11
    const interlineado = 16

    let pagina = pdf.addPage([anchoPagina, altoPagina])
    let y = altoPagina - margen

    function nuevaPaginaSiHaceFalta(alturaNecesaria: number) {
      if (y - alturaNecesaria < margen) {
        pagina = pdf.addPage([anchoPagina, altoPagina])
        y = altoPagina - margen
      }
    }

    // Título centrado
    const tituloLimpio = limpiarTexto(titulo)
    const anchoTitulo = fuenteNegrita.widthOfTextAtSize(tituloLimpio, 16)
    pagina.drawText(tituloLimpio, {
      x: (anchoPagina - anchoTitulo) / 2,
      y,
      size: 16,
      font: fuenteNegrita,
      color: rgb(0.1, 0.1, 0.1),
    })
    y -= 30

    // Párrafos, con justificación simple por líneas envueltas.
    for (const parrafo of parrafos) {
      const lineas = envolverTexto(parrafo, fuente, tamanoTexto, anchoTexto)
      nuevaPaginaSiHaceFalta(lineas.length * interlineado + 10)
      for (const linea of lineas) {
        pagina.drawText(linea, { x: margen, y, size: tamanoTexto, font: fuente, color: rgb(0.15, 0.15, 0.15) })
        y -= interlineado
      }
      y -= 8 // espacio entre cláusulas
    }

    // Bloque de firmas al final.
    nuevaPaginaSiHaceFalta(120)
    y -= 40
    const anchoFirma = 200
    pagina.drawLine({ start: { x: margen, y }, end: { x: margen + anchoFirma, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) })
    pagina.drawLine({
      start: { x: anchoPagina - margen - anchoFirma, y },
      end: { x: anchoPagina - margen, y },
      thickness: 1,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 14
    pagina.drawText('EL ARRENDADOR', { x: margen, y, size: 10, font: fuenteNegrita })
    pagina.drawText('EL INQUILINO', { x: anchoPagina - margen - anchoFirma, y, size: 10, font: fuenteNegrita })
    y -= 14
    pagina.drawText(limpiarTexto(datos.administradorNombre || ''), { x: margen, y, size: 9, font: fuente })
    pagina.drawText(limpiarTexto(`${datos.inquilinoNombre} — C.I. ${datos.inquilinoCI}`), {
      x: anchoPagina - margen - anchoFirma,
      y,
      size: 9,
      font: fuente,
    })

    const bytes = await pdf.save()
    const base64 = Buffer.from(bytes).toString('base64')

    return NextResponse.json({ pdfBase64: base64 })
  } catch (err: any) {
    console.error('POST /api/generar-contrato', err)
    return NextResponse.json({ error: err?.message || 'No se pudo generar el contrato.' }, { status: 500 })
  }
}
