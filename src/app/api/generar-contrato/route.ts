import { NextRequest, NextResponse } from 'next/server'
import { requerirUsuarioAprobado } from '@/lib/firebaseAdmin'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { generarClausulasContrato, DatosContrato } from '@/lib/plantillaContrato'

export const dynamic = 'force-dynamic'

// Paleta del documento: azul marino oscuro para título y encabezados
// de cláusula (look prolijo tipo documento legal), gris oscuro para
// el cuerpo del texto.
const COLOR_TITULO = rgb(0.11, 0.22, 0.37) // azul marino
const COLOR_ENCABEZADO = rgb(0.11, 0.22, 0.37)
const COLOR_CUERPO = rgb(0.18, 0.18, 0.18)
const COLOR_SUBTITULO = rgb(0.4, 0.4, 0.4)
const COLOR_LINEA = rgb(0.11, 0.22, 0.37)
const COLOR_FIRMA_ROL = rgb(0.4, 0.4, 0.4)

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

    if (!datos.inquilinos?.length || !datos.inquilinos[0]?.nombre || !datos.inquilinos[0]?.ci || !datos.montoMensual || !datos.fechaInicio) {
      return NextResponse.json({ error: 'Faltan datos del inquilino o de las condiciones del alquiler.' }, { status: 400 })
    }

    const { titulo, subtitulo, parrafos, propietarios, inquilinos } = generarClausulasContrato(datos)

    const pdf = await PDFDocument.create()
    const fuente = await pdf.embedFont(StandardFonts.TimesRoman)
    const fuenteNegrita = await pdf.embedFont(StandardFonts.TimesRomanBold)
    const fuenteItalica = await pdf.embedFont(StandardFonts.TimesRomanItalic)

    const anchoPagina = 595.28 // A4 en puntos
    const altoPagina = 841.89
    const margen = 60
    const anchoTexto = anchoPagina - margen * 2
    const tamanoTexto = 11
    const tamanoEncabezado = 11.5
    const interlineado = 16

    let pagina = pdf.addPage([anchoPagina, altoPagina])
    let y = altoPagina - margen

    function nuevaPaginaSiHaceFalta(alturaNecesaria: number) {
      if (y - alturaNecesaria < margen) {
        pagina = pdf.addPage([anchoPagina, altoPagina])
        y = altoPagina - margen
      }
    }

    function centrarTexto(texto: string, font: any, tamano: number) {
      return (anchoPagina - font.widthOfTextAtSize(texto, tamano)) / 2
    }

    // Título centrado, en dos líneas si el texto no entra en una,
    // en azul marino y negrita.
    const lineasTitulo = envolverTexto(titulo, fuenteNegrita, 16, anchoTexto - 40)
    for (const linea of lineasTitulo) {
      pagina.drawText(linea, { x: centrarTexto(linea, fuenteNegrita, 16), y, size: 16, font: fuenteNegrita, color: COLOR_TITULO })
      y -= 21
    }

    // Subtítulo (referencia del inmueble) centrado, en itálica y gris.
    if (subtitulo) {
      y -= 2
      const lineasSubtitulo = envolverTexto(subtitulo, fuenteItalica, 10, anchoTexto - 40)
      for (const linea of lineasSubtitulo) {
        pagina.drawText(linea, { x: centrarTexto(linea, fuenteItalica, 10), y, size: 10, font: fuenteItalica, color: COLOR_SUBTITULO })
        y -= 13
      }
    }

    // Línea decorativa fina debajo del encabezado, todo el ancho de
    // texto, para separar visualmente el título del cuerpo.
    y -= 6
    pagina.drawLine({ start: { x: margen, y }, end: { x: anchoPagina - margen, y }, thickness: 1, color: COLOR_LINEA })
    y -= 24

    // Párrafos: encabezado de cláusula en negrita/color, cuerpo en
    // gris oscuro normal, con más espacio entre cláusulas para que
    // se lea como un documento prolijo y no un bloque compacto.
    for (const parrafo of parrafos) {
      if (parrafo.encabezado) {
        const lineasEnc = envolverTexto(parrafo.encabezado, fuenteNegrita, tamanoEncabezado, anchoTexto)
        nuevaPaginaSiHaceFalta(lineasEnc.length * interlineado + 6)
        for (const linea of lineasEnc) {
          pagina.drawText(linea, { x: margen, y, size: tamanoEncabezado, font: fuenteNegrita, color: COLOR_ENCABEZADO })
          y -= interlineado
        }
        y -= 4
      }

      const lineasCuerpo = envolverTexto(parrafo.cuerpo, fuente, tamanoTexto, anchoTexto)
      nuevaPaginaSiHaceFalta(lineasCuerpo.length * interlineado + 10)
      for (const linea of lineasCuerpo) {
        pagina.drawText(linea, { x: margen, y, size: tamanoTexto, font: fuente, color: COLOR_CUERPO })
        y -= interlineado
      }
      y -= 14 // espacio entre cláusulas, más generoso que antes
    }

    // Bloque de firmas: una firma individual por cada propietario e
    // inquilino, apiladas verticalmente (línea + nombre + C.I. +
    // rol), igual que en el contrato de referencia — no una sola
    // firma por parte, porque puede haber varios firmantes de cada
    // lado. El nombre va en negrita/color, el rol y C.I. en gris.
    const altoFirma = 58
    const anchoLineaFirma = 260

    function dibujarFirma(persona: { nombre: string; ci: string }, rol: string) {
      nuevaPaginaSiHaceFalta(altoFirma)
      y -= 34
      pagina.drawLine({ start: { x: margen, y }, end: { x: margen + anchoLineaFirma, y }, thickness: 1, color: COLOR_LINEA })
      y -= 15
      pagina.drawText(limpiarTexto(persona.nombre || ''), { x: margen, y, size: 10.5, font: fuenteNegrita, color: COLOR_ENCABEZADO })
      y -= 13
      if (persona.ci) {
        pagina.drawText(limpiarTexto(`C.I. N.° ${persona.ci}`), { x: margen, y, size: 9, font: fuente, color: COLOR_FIRMA_ROL })
        y -= 12
      }
      pagina.drawText(rol, { x: margen, y, size: 9, font: fuente, color: COLOR_FIRMA_ROL })
    }

    nuevaPaginaSiHaceFalta(20)
    y -= 10
    for (const propietario of propietarios) {
      dibujarFirma(propietario, propietarios.length > 1 ? 'PROPIETARIO/A' : 'PROPIETARIO/A (o su representante)')
    }
    for (const inquilino of inquilinos) {
      dibujarFirma(inquilino, inquilinos.length > 1 ? 'INQUILINO/A' : 'INQUILINO/A')
    }

    // Numeración de página al pie, centrada, en gris — detalle prolijo
    // para un documento de varias hojas.
    const paginas = pdf.getPages()
    paginas.forEach((p, idx) => {
      const texto = `Página ${idx + 1} de ${paginas.length}`
      const anchoNum = fuente.widthOfTextAtSize(texto, 8)
      p.drawText(texto, { x: (anchoPagina - anchoNum) / 2, y: margen / 2, size: 8, font: fuente, color: COLOR_SUBTITULO })
    })

    const bytes = await pdf.save()
    const base64 = Buffer.from(bytes).toString('base64')

    return NextResponse.json({ pdfBase64: base64 })
  } catch (err: any) {
    console.error('POST /api/generar-contrato', err)
    return NextResponse.json({ error: err?.message || 'No se pudo generar el contrato.' }, { status: 500 })
  }
}
