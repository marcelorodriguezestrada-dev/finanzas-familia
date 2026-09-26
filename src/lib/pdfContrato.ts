// Maquetado del contrato en PDF (pdf-lib, sin servicios externos).
// Separado del endpoint para poder probarlo solo y reutilizarlo.
//
// Diseño: banda y encabezado de página en azul marino, título centrado
// con filete dorado, encabezados de cláusula sobre franja celeste con
// barra lateral, cuerpo justificado con negritas, recuadro de "Resumen
// del pago", firmas en grilla de 2 columnas (con la foto de la firma si
// se cargó) y ANEXO I con el cronograma de pagos mes a mes.

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fs from 'fs'
import path from 'path'
import { ContratoArmado, Persona } from './plantillaContrato'
import { formatoBs, fechaCorta } from './esquemaPago'

const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const C = {
  marino: hex('#1C3A5E'),
  marinoOscuro: hex('#132A45'),
  celeste: hex('#EAF0F7'),
  dorado: hex('#B3831F'),
  doradoSuave: hex('#FBF5E6'),
  cuerpo: hex('#2B2B2B'),
  gris: hex('#6B7280'),
  grisClaro: hex('#D6DCE4'),
  zebra: hex('#F5F7FB'),
  blanco: rgb(1, 1, 1),
  // un color por tramo del canon, para ver el escalonamiento en el anexo
  tramos: [hex('#2F6FB0'), hex('#B3831F'), hex('#2F6D4F'), hex('#8A3324'), hex('#6B4FA0')],
}

const A4: [number, number] = [595.28, 841.89]
const M = { izq: 56, der: 56, arriba: 78, abajo: 62 }

type Fuentes = { normal: PDFFont; negrita: PDFFont; italica: PDFFont }
// Una "palabra" es lo que va entre espacios; puede mezclar tramos en
// negrita y normal sin espacio entre ellos (ej. "**INQUILINOS**.").
type Tramo = { texto: string; negrita: boolean }
type Palabra = { partes: Tramo[]; texto: string }

export async function renderizarContratoPDF(c: ContratoArmado): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(c.titulo)
  pdf.setSubject(c.referencia)
  pdf.setCreator('Finanzas de la Familia')
  pdf.setProducer('Finanzas de la Familia')

  const f = await cargarFuentes(pdf)

  // Cualquier carácter que la fuente no tenga (emojis, flechas, saltos
  // raros que vienen de texto pegado o de la IA) se descarta para que
  // el PDF no falle ni muestre cuadraditos.
  const soportados = new Set(f.normal.getCharacterSet())
  const limpiar = (t: string) =>
    Array.from((t || '').replace(/[\t\r]+/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'))
      .map((ch) => (ch === ' ' || soportados.has(ch.codePointAt(0)!) ? ch : ch === '\n' ? '\n' : ''))
      .join('')

  const [W, H] = A4
  const anchoTexto = W - M.izq - M.der
  let pagina: PDFPage = pdf.addPage(A4)
  let y = H - M.arriba

  const nuevaPagina = () => {
    pagina = pdf.addPage(A4)
    y = H - M.arriba
  }
  const asegurar = (alto: number) => {
    if (y - alto < M.abajo) nuevaPagina()
  }

  // ---------- Texto enriquecido (negritas + justificado) ----------
  function palabras(linea: string, negritaBase = false): Palabra[] {
    const out: Palabra[] = []
    let negrita = false
    for (const chunk of limpiar(linea).split(/\s+/).filter(Boolean)) {
      const partes: Tramo[] = []
      chunk.split('**').forEach((seg, i) => {
        if (i > 0) negrita = !negrita
        if (seg) partes.push({ texto: seg, negrita: negritaBase || negrita })
      })
      if (partes.length) out.push({ partes, texto: partes.map((x) => x.texto).join('') })
    }
    return out
  }
  const fuenteT = (t: Tramo) => (t.negrita ? f.negrita : f.normal)
  const anchoPal = (p: Palabra, t: number) => p.partes.reduce((s, x) => s + fuenteT(x).widthOfTextAtSize(x.texto, t), 0)

  function envolver(pals: Palabra[], tam: number, ancho: number): Palabra[][] {
    const lineas: Palabra[][] = []
    let actual: Palabra[] = []
    let w = 0
    const esp = f.normal.widthOfTextAtSize(' ', tam)
    for (const p of pals) {
      const wp = anchoPal(p, tam)
      if (actual.length && w + esp + wp > ancho) {
        lineas.push(actual)
        actual = [p]
        w = wp
      } else {
        w += (actual.length ? esp : 0) + wp
        actual.push(p)
      }
    }
    if (actual.length) lineas.push(actual)
    return lineas
  }

  function dibujarLinea(ls: Palabra[], x: number, yy: number, tam: number, ancho: number, justificar: boolean, color: RGB) {
    const esp = f.normal.widthOfTextAtSize(' ', tam)
    const anchoPals = ls.reduce((s, p) => s + anchoPal(p, tam), 0)
    let espacio = esp
    if (justificar && ls.length > 1) {
      const extra = (ancho - anchoPals) / (ls.length - 1)
      if (extra < esp * 3.2) espacio = extra // si queda muy estirado, mejor alineado a la izquierda
    }
    let cx = x
    for (const p of ls) {
      for (const t of p.partes) {
        pagina.drawText(t.texto, { x: cx, y: yy, size: tam, font: fuenteT(t), color })
        cx += fuenteT(t).widthOfTextAtSize(t.texto, tam)
      }
      cx += espacio
    }
  }

  // Dibuja un bloque de texto con el marcado de la plantilla (\n,
  // viñetas "• ", **negrita**), cortando página cuando hace falta.
  function bloqueTexto(texto: string, opts: { tam?: number; interlineado?: number; color?: RGB; x?: number; ancho?: number; espacioParrafo?: number } = {}) {
    const tam = opts.tam ?? 10
    const il = opts.interlineado ?? tam * 1.48
    const color = opts.color ?? C.cuerpo
    const x0 = opts.x ?? M.izq
    const ancho0 = opts.ancho ?? anchoTexto
    const renglones = texto.split('\n').map((r) => r.trim()).filter(Boolean)
    renglones.forEach((renglon, idx) => {
      const esVinieta = renglon.startsWith('•')
      const sangria = esVinieta ? 16 : 0
      const contenido = esVinieta ? renglon.replace(/^•\s*/, '') : renglon
      const lineas = envolver(palabras(contenido), tam, ancho0 - sangria)
      lineas.forEach((ls, i) => {
        asegurar(il)
        if (esVinieta && i === 0) {
          pagina.drawCircle({ x: x0 + 6, y: y + tam * 0.32, size: 1.9, color: C.dorado })
        }
        dibujarLinea(ls, x0 + sangria, y, tam, ancho0 - sangria, i < lineas.length - 1, color)
        y -= il
      })
      if (idx < renglones.length - 1) y -= opts.espacioParrafo ?? 3.5
    })
  }

  // ---------- Portada: título ----------
  {
    const tamT = 14.5
    const lineasT = envolver(palabras(c.titulo, true), tamT, anchoTexto - 30)
    for (const ls of lineasT) {
      const w = ls.reduce((s, p) => s + anchoPal(p, tamT), 0) + (ls.length - 1) * f.normal.widthOfTextAtSize(' ', tamT)
      dibujarLinea(ls, (W - w) / 2, y, tamT, w, false, C.marino)
      y -= 19
    }
    if (c.subtitulo) {
      const lineasS = envolver(palabras(c.subtitulo), 9.5, anchoTexto - 40)
      y -= 1
      for (const ls of lineasS) {
        const texto = ls.map((p) => p.texto).join(' ')
        const w = f.italica.widthOfTextAtSize(texto, 9.5)
        pagina.drawText(texto, { x: (W - w) / 2, y, size: 9.5, font: f.italica, color: C.gris })
        y -= 13
      }
    }
    y -= 4
    pagina.drawLine({ start: { x: M.izq, y }, end: { x: W - M.der, y }, thickness: 1.1, color: C.marino })
    pagina.drawRectangle({ x: W / 2 - 34, y: y - 4.5, width: 68, height: 3, color: C.dorado })
    y -= 24
  }

  // ---------- Cláusulas ----------
  c.parrafos.forEach((p, idx) => {
    const esUltimo = idx === c.parrafos.length - 1
    if (p.encabezado) {
      const tamE = 10
      const lineasE = envolver(palabras(p.encabezado, true), tamE, anchoTexto - 18)
      const altoFranja = lineasE.length * 13.5 + 8
      // Que el encabezado no quede solo al pie de la hoja; y la
      // cláusula de conformidad, junto con la primera fila de firmas.
      asegurar(altoFranja + (esUltimo ? 60 + 124 : 34))
      y -= 2
      const techo = y + tamE + 4
      pagina.drawRectangle({ x: M.izq, y: techo - altoFranja, width: anchoTexto, height: altoFranja, color: C.celeste })
      pagina.drawRectangle({ x: M.izq, y: techo - altoFranja, width: 3.5, height: altoFranja, color: C.marino })
      for (const ls of lineasE) {
        dibujarLinea(ls, M.izq + 11, y, tamE, anchoTexto - 18, false, C.marinoOscuro)
        y -= 13.5
      }
      y -= 8
    }

    bloqueTexto(p.cuerpo)

    if (p.recuadro) {
      const tam = 9
      const il = 12.8
      const anchoInt = anchoTexto - 30
      const lineas = p.recuadro.lineas.map((l) => envolver(palabras(l), tam, anchoInt - 12))
      const alto = 22 + lineas.reduce((s, ls) => s + ls.length * il, 0) + (lineas.length - 1) * 2 + 8
      y -= 4
      asegurar(alto + 6)
      const techo = y
      pagina.drawRectangle({ x: M.izq, y: techo - alto, width: anchoTexto, height: alto, color: C.doradoSuave, borderColor: hex('#E8D9B0'), borderWidth: 0.6 })
      pagina.drawRectangle({ x: M.izq, y: techo - alto, width: 3.5, height: alto, color: C.dorado })
      let yy = techo - 15
      pagina.drawText(limpiar(p.recuadro.titulo), { x: M.izq + 14, y: yy, size: 8.5, font: f.negrita, color: C.dorado })
      yy -= 14
      for (const ls of lineas) {
        pagina.drawCircle({ x: M.izq + 18, y: yy + 3, size: 1.7, color: C.dorado })
        ls.forEach((l, i) => {
          dibujarLinea(l, M.izq + 26, yy, tam, anchoInt - 12, false, C.cuerpo)
          yy -= il
          if (i === ls.length - 1) yy -= 2
        })
      }
      y = techo - alto - 6
    }
    y -= 12
  })

  // ---------- Firmas ----------
  const imagenes = new Map<string, PDFImage | null>()
  async function imagenFirma(p: Persona): Promise<PDFImage | null> {
    const src = p.firma || ''
    if (!src) return null
    if (imagenes.has(src)) return imagenes.get(src)!
    let img: PDFImage | null = null
    try {
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(src)
      if (m) {
        const bytes = Buffer.from(m[2], 'base64')
        img = m[1].toLowerCase() === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
      }
    } catch {
      img = null // firma corrupta: se deja la línea en blanco
    }
    imagenes.set(src, img)
    return img
  }

  const firmantes = [
    ...c.propietarios.map((p) => ({ p, rol: 'PROPIETARIO/A' })),
    ...c.inquilinos.map((p) => ({ p, rol: 'INQUILINO/A' })),
  ].map((x) => ({ ...x, rol: rolConGenero(x.p.nombre, x.rol) }))

  {
    const colW = anchoTexto / 2
    const altoCelda = 118
    y -= 6
    for (let i = 0; i < firmantes.length; i += 2) {
      asegurar(altoCelda)
      const fila = firmantes.slice(i, i + 2)
      for (let j = 0; j < fila.length; j++) {
        const { p, rol } = fila[j]
        const cx = M.izq + colW * j + colW / 2
        const yLinea = y - 62
        const img = await imagenFirma(p)
        if (img) {
          const esc = Math.min(160 / img.width, 54 / img.height, 1)
          const w = img.width * esc
          const h = img.height * esc
          pagina.drawImage(img, { x: cx - w / 2, y: yLinea + 1, width: w, height: h })
        }
        pagina.drawLine({ start: { x: cx - 95, y: yLinea }, end: { x: cx + 95, y: yLinea }, thickness: 0.8, color: C.marino })
        let yy = yLinea - 14
        const nombre = limpiar((p.nombre || '____________').toUpperCase())
        for (const ls of envolver(palabras(nombre, true), 9.5, colW - 16)) {
          const t = ls.map((q) => q.texto).join(' ')
          pagina.drawText(t, { x: cx - f.negrita.widthOfTextAtSize(t, 9.5) / 2, y: yy, size: 9.5, font: f.negrita, color: C.marino })
          yy -= 12
        }
        const extra = [p.ci ? `C.I. N.° ${p.ci}` : '', rol].filter(Boolean)
        for (const t0 of extra) {
          const t = limpiar(t0)
          pagina.drawText(t, { x: cx - f.normal.widthOfTextAtSize(t, 8.5) / 2, y: yy, size: 8.5, font: f.normal, color: C.gris })
          yy -= 11
        }
      }
      y -= altoCelda
    }
  }

  // ---------- ANEXO I: cronograma ----------
  if (c.incluirCronograma && c.cronograma.length) {
    nuevaPagina()
    const titulo = 'ANEXO I – CRONOGRAMA DE PAGOS'
    pagina.drawText(titulo, { x: (W - f.negrita.widthOfTextAtSize(titulo, 13)) / 2, y, size: 13, font: f.negrita, color: C.marino })
    y -= 15
    const sub = limpiar(`${c.referencia} · Inquilino(s): ${c.inquilinos.map((p) => p.nombre).join(', ')}`)
    for (const ls of envolver(palabras(sub), 8.5, anchoTexto - 40)) {
      const t = ls.map((q) => q.texto).join(' ')
      pagina.drawText(t, { x: (W - f.italica.widthOfTextAtSize(t, 8.5)) / 2, y, size: 8.5, font: f.italica, color: C.gris })
      y -= 11
    }
    y -= 4
    pagina.drawRectangle({ x: W / 2 - 34, y, width: 68, height: 2.5, color: C.dorado })
    y -= 22

    // Tarjetas de resumen
    const r = c.resumen
    if (r) {
      const tarjetas = [
        { t: 'PAGO A LA FIRMA', v: formatoBs(r.pagoALaFirma) },
        { t: r.proyectado ? 'PROYECCIÓN MOSTRADA' : 'TOTAL DEL CONTRATO', v: formatoBs(r.total) },
        { t: 'CANTIDAD DE PAGOS', v: `${r.cantidadCuotas}` },
      ]
      const gap = 10
      const tw = (anchoTexto - gap * 2) / 3
      tarjetas.forEach((t, i) => {
        const x = M.izq + i * (tw + gap)
        pagina.drawRectangle({ x, y: y - 40, width: tw, height: 46, color: i === 1 ? C.marino : C.celeste })
        const colT = i === 1 ? hex('#C9D6E6') : C.gris
        const colV = i === 1 ? C.blanco : C.marinoOscuro
        pagina.drawText(t.t, { x: x + 10, y: y - 10, size: 7, font: f.negrita, color: colT })
        pagina.drawText(limpiar(t.v), { x: x + 10, y: y - 30, size: 14, font: f.negrita, color: colV })
      })
      y -= 62
    }

    // Tabla
    const cols = [
      { t: 'N.°', w: 30, al: 'c' },
      { t: 'PERÍODO', w: 104, al: 'l' },
      { t: 'CONCEPTO', w: anchoTexto - 30 - 104 - 74 - 84, al: 'l' },
      { t: 'VENCE', w: 74, al: 'c' },
      { t: 'MONTO', w: 84, al: 'r' },
    ] as const
    const altoFila = 19
    const cabecera = () => {
      pagina.drawRectangle({ x: M.izq, y: y - 6, width: anchoTexto, height: altoFila, color: C.marino })
      let x = M.izq
      for (const col of cols) {
        celda(col.t, x, col.w, col.al, f.negrita, 7.8, C.blanco)
        x += col.w
      }
      y -= altoFila
    }
    function celda(t: string, x: number, w: number, al: string, font: PDFFont, tam: number, color: RGB) {
      const txt = limpiar(t)
      const tw = font.widthOfTextAtSize(txt, tam)
      const px = al === 'c' ? x + (w - tw) / 2 : al === 'r' ? x + w - tw - 8 : x + 8
      pagina.drawText(txt, { x: px, y, size: tam, font, color })
    }
    cabecera()
    c.cronograma.forEach((q, idx) => {
      if (y - altoFila < M.abajo + 30) {
        nuevaPagina()
        cabecera()
      }
      if (idx % 2 === 1) pagina.drawRectangle({ x: M.izq, y: y - 6, width: anchoTexto, height: altoFila, color: C.zebra })
      pagina.drawRectangle({ x: M.izq, y: y - 6, width: 3, height: altoFila, color: C.tramos[q.tramo % C.tramos.length] })
      const concepto =
        q.tipo === 'proporcional_inicio'
          ? `Proporcional ${q.dias} días (ingreso)`
          : q.tipo === 'proporcional_fin'
          ? `Proporcional ${q.dias} días (salida)`
          : `Canon mensual${c.resumen && new Set(c.cronograma.map((x) => x.tramo)).size > 1 ? ` · tramo ${q.tramo + 1}` : ''}`
      const valores = [String(q.numero), q.etiqueta, concepto, fechaCorta(q.vence), formatoBs(q.monto)]
      let x = M.izq
      cols.forEach((col, i) => {
        celda(valores[i], x, col.w, col.al, i === 4 ? f.negrita : f.normal, 8.5, i === 4 ? C.marinoOscuro : C.cuerpo)
        x += col.w
      })
      y -= altoFila
    })
    if (c.resumen) {
      pagina.drawLine({ start: { x: M.izq, y: y + altoFila - 6 }, end: { x: W - M.der, y: y + altoFila - 6 }, thickness: 1, color: C.marino })
      y -= 2
      celda(c.resumen.proyectado ? 'TOTAL PROYECTADO' : 'TOTAL DEL CONTRATO', M.izq + cols[0].w + cols[1].w, cols[2].w + cols[3].w, 'l', f.negrita, 9, C.marino)
      celda(formatoBs(c.resumen.total), W - M.der - cols[4].w, cols[4].w, 'r', f.negrita, 10, C.marino)
      y -= 22
      if (c.resumen.proyectado) {
        bloqueTexto('Nota: el contrato no tiene fecha de conclusión; el cronograma muestra una proyección de los primeros meses y el último canon se mantiene mientras dure el alquiler.', { tam: 8, color: C.gris })
      }
    }

    // Leyenda de tramos
    const tramos = Array.from(new Set(c.cronograma.map((q) => q.tramo)))
    if (tramos.length > 1) {
      y -= 4
      asegurar(16)
      let x = M.izq
      for (const t of tramos) {
        const monto = c.cronograma.find((q) => q.tramo === t)!.montoMensual
        const txt = `Tramo ${t + 1}: ${formatoBs(monto)}/mes`
        pagina.drawRectangle({ x, y: y - 1, width: 8, height: 8, color: C.tramos[t % C.tramos.length] })
        pagina.drawText(limpiar(txt), { x: x + 12, y, size: 8, font: f.normal, color: C.gris })
        x += f.normal.widthOfTextAtSize(txt, 8) + 30
      }
      y -= 18
    }

    // Rúbricas de conformidad del anexo
    y -= 18
    asegurar(80)
    pagina.drawText('Conformidad de las partes con el presente anexo:', { x: M.izq, y, size: 8.5, font: f.italica, color: C.gris })
    y -= 12
    const porFila = Math.min(firmantes.length, 3)
    const cw = anchoTexto / porFila
    for (let i = 0; i < firmantes.length; i += porFila) {
      asegurar(66)
      const fila = firmantes.slice(i, i + porFila)
      for (let j = 0; j < fila.length; j++) {
        const cx = M.izq + cw * j + cw / 2
        const yl = y - 38
        const img = await imagenFirma(fila[j].p)
        if (img) {
          const esc = Math.min(100 / img.width, 32 / img.height, 1)
          pagina.drawImage(img, { x: cx - (img.width * esc) / 2, y: yl + 1, width: img.width * esc, height: img.height * esc })
        }
        pagina.drawLine({ start: { x: cx - cw / 2 + 12, y: yl }, end: { x: cx + cw / 2 - 12, y: yl }, thickness: 0.6, color: C.grisClaro })
        const nom = limpiar(fila[j].p.nombre.toUpperCase())
        let tam = 7.5
        while (f.negrita.widthOfTextAtSize(nom, tam) > cw - 20 && tam > 5.5) tam -= 0.25
        pagina.drawText(nom, { x: cx - f.negrita.widthOfTextAtSize(nom, tam) / 2, y: yl - 10, size: tam, font: f.negrita, color: C.marino })
      }
      y -= 62
    }
  }

  // ---------- Encabezado y pie de todas las páginas ----------
  const paginas = pdf.getPages()
  const ref = limpiar(c.referencia)
  paginas.forEach((pg, idx) => {
    pg.drawRectangle({ x: 0, y: H - 7, width: W, height: 7, color: C.marino })
    pg.drawRectangle({ x: 0, y: H - 9, width: W, height: 2, color: C.dorado })
    const wRef = f.italica.widthOfTextAtSize(ref, 8)
    pg.drawText(ref, { x: W - M.der - Math.min(wRef, anchoTexto), y: H - 36, size: 8, font: f.italica, color: C.gris })
    pg.drawLine({ start: { x: M.izq, y: H - 44 }, end: { x: W - M.der, y: H - 44 }, thickness: 0.4, color: C.grisClaro })

    pg.drawLine({ start: { x: M.izq, y: 42 }, end: { x: W - M.der, y: 42 }, thickness: 0.4, color: C.grisClaro })
    pg.drawText('Documento privado – Art. 519 del Código Civil de Bolivia', { x: M.izq, y: 29, size: 7.5, font: f.normal, color: C.gris })
    const num = `Página ${idx + 1} de ${paginas.length}`
    pg.drawText(num, { x: W - M.der - f.negrita.widthOfTextAtSize(num, 7.5), y: 29, size: 7.5, font: f.negrita, color: C.marino })
  })

  return pdf.save()
}

// Fuente embebida (Liberation Sans, métrica de Arial, licencia SIL OFL
// — ver src/lib/fuentes). Embebida y recortada al subconjunto usado,
// el PDF se ve IGUAL en cualquier visor, celular o impresora: con las
// fuentes estándar sin embeber cada visor pone la suya y los espacios
// entre palabras bailan. Si por algún motivo no se encuentran los
// archivos (deploy sin los .ttf), cae a Helvetica estándar.
async function cargarFuentes(pdf: PDFDocument): Promise<Fuentes> {
  const candidatos = [process.env.CONTRATO_FUENTES_DIR, path.join(process.cwd(), 'src', 'lib', 'fuentes')].filter(Boolean) as string[]
  for (const dir of candidatos) {
    try {
      const leer = (n: string) => fs.readFileSync(path.join(dir, n))
      const [r, b, i] = [leer('LiberationSans-Regular.ttf'), leer('LiberationSans-Bold.ttf'), leer('LiberationSans-Italic.ttf')]
      pdf.registerFontkit(fontkit)
      return {
        normal: await pdf.embedFont(r, { subset: true }),
        negrita: await pdf.embedFont(b, { subset: true }),
        italica: await pdf.embedFont(i, { subset: true }),
      }
    } catch {
      // probar el siguiente candidato
    }
  }
  return {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrita: await pdf.embedFont(StandardFonts.HelveticaBold),
    italica: await pdf.embedFont(StandardFonts.HelveticaOblique),
  }
}

// "PROPIETARIA" / "INQUILINA" si el nombre de pila parece femenino
// (heurística simple: la terminación en "a"), como en el contrato
// original. Ante la duda deja la forma neutra con barra.
function rolConGenero(nombre: string, rol: string) {
  const pila = (nombre || '').trim().split(/\s+/)[0]?.toLowerCase() || ''
  if (!pila) return rol
  const femeninosSinA = [
    'wendy', 'isabel', 'carmen', 'raquel', 'ruth', 'beatriz', 'inés', 'ines', 'luz', 'pilar', 'rocío', 'rocio',
    'maribel', 'noemí', 'noemi', 'abigail', 'nicole', 'jenny', 'mary', 'cinthya', 'miriam', 'esther', 'ester',
    'lourdes', 'mercedes', 'dolores', 'consuelo', 'soledad', 'elizabeth', 'judith', 'edith', 'yaneth', 'janeth',
    'lizeth', 'ivonne', 'karen', 'marisol', 'gladys', 'nelly', 'betty', 'katty', 'sandy', 'heidy', 'deysi', 'daysi',
  ]
  const masculinosConA = ['joshua', 'luca', 'nicola', 'andrea', 'bautista', 'garcía']
  const femenino = (/a$/.test(pila) && !masculinosConA.includes(pila)) || femeninosSinA.includes(pila)
  const masculino = !femenino && (/[oernl]$/.test(pila) || ['willy', 'tony', 'freddy', 'eddy', 'rudy', 'jhonny', 'johnny'].includes(pila))
  const base = rol.replace('/A', '')
  if (femenino) return base.replace(/O$/, 'A')
  if (masculino) return base
  return rol
}
