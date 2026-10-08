'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '@/data/categorias'
import { formatoBs, etiquetaMes } from '@/lib/esquemaPago'
import { ItemImportado, parsearTabla, itemsDesdeMatriz, itemsDesdeIA, asociarPropiedades, tituloDe } from '@/lib/importarGastos'

type Fuente = 'planilla' | 'texto' | 'facturas'

// Importa gastos por pagar (e ingresos) desde:
//  - una planilla: enlace de Google Sheets, archivo .xlsx/.csv o celdas pegadas;
//  - texto libre pegado (la IA saca cada gasto con su fecha y monto);
//  - fotos o PDF de facturas (OCR en el navegador + IA, o el lector de expensas).
// Todo se revisa en una tabla antes de guardar.
export function ImportarGastos({ propiedades, onListo, onCerrar }: { propiedades: any[]; onListo: () => void; onCerrar: () => void }) {
  const { obtenerToken, perfil } = useAuth()
  const hoy = new Date().toISOString().slice(0, 10)
  const [fuente, setFuente] = useState<Fuente>('planilla')
  const [url, setUrl] = useState('')
  const [pegado, setPegado] = useState('')
  const [texto, setTexto] = useState('')
  const [items, setItems] = useState<ItemImportado[]>([])
  const [periodo, setPeriodo] = useState('todos')
  const [vencidas, setVencidas] = useState<'pendiente' | 'pagada' | 'historico'>('pagada')
  const [trabajando, setTrabajando] = useState('')
  const [error, setError] = useState('')
  const [log, setLog] = useState<{ txt: string; ok: boolean }[]>([])

  const nombre = perfil?.nombre || ''

  // Ingresos con fecha futura: todavía no entraron, se dejan sin tildar.
  function preparar(nuevos: ItemImportado[]) {
    const listos = asociarPropiedades(nuevos, propiedades).map((it) =>
      it.tipo === 'ingreso' && it.vencimiento && it.vencimiento > hoy && it.incluir ? { ...it, incluir: false, nota: [it.nota, 'todavía no entró'].filter(Boolean).join(' · ') } : it
    )
    setItems((prev) => [...prev, ...listos])
    // Por defecto se muestra el mes en curso si está en la lista.
    const mesActual = hoy.slice(0, 7)
    if (listos.some((x) => x.periodo === mesActual)) setPeriodo(mesActual)
    setLog([])
  }

  async function post(cuerpo: any) {
    const token = await obtenerToken()
    const r = await fetch('/api/importar-gastos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(cuerpo) })
    return r.json()
  }

  async function leerEnlace() {
    setError('')
    setTrabajando('Abriendo la planilla...')
    try {
      const d = await post({ accion: 'planilla', url })
      if (d.error) return setError(d.error)
      const its = itemsDesdeMatriz(parsearTabla(d.csv), { nombreUsuario: nombre, origen: 'planilla' })
      if (!its.length) return setError('No reconocí las columnas. La planilla necesita al menos columnas de servicio/concepto, fecha o vencimiento y monto/precio.')
      preparar(its)
    } finally {
      setTrabajando('')
    }
  }

  async function leerArchivoPlanilla(f: File) {
    setError('')
    setTrabajando('Leyendo el archivo...')
    try {
      let matriz: any[][]
      if (/\.xlsx?$/i.test(f.name)) {
        const { default: leerExcel } = await import('read-excel-file')
        matriz = (await leerExcel(f)) as any[][]
      } else {
        matriz = parsearTabla(await f.text())
      }
      const its = itemsDesdeMatriz(matriz, { nombreUsuario: nombre, origen: f.name })
      if (!its.length) return setError('No reconocí las columnas del archivo (servicio/concepto, vencimiento y monto/precio).')
      preparar(its)
    } catch (err: any) {
      setError(err.message || 'No se pudo leer el archivo.')
    } finally {
      setTrabajando('')
    }
  }

  function leerPegado() {
    setError('')
    const its = itemsDesdeMatriz(parsearTabla(pegado), { nombreUsuario: nombre, origen: 'pegado' })
    if (its.length) return preparar(its)
    // Sin encabezados reconocibles: que lo lea la IA como texto.
    setTexto(pegado)
    setFuente('texto')
    leerTexto(pegado)
  }

  async function leerTexto(t = texto) {
    setError('')
    setTrabajando('La IA está leyendo el texto...')
    try {
      const d = await post({ accion: 'texto', texto: t, hoy })
      if (d.error) return setError(d.error)
      preparar(itemsDesdeIA(d.items, 'texto'))
    } finally {
      setTrabajando('')
    }
  }

  async function leerFacturas(archivos: FileList) {
    setError('')
    const nuevos: ItemImportado[] = []
    const lista = Array.from(archivos)
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i]
      setTrabajando(`Leyendo ${i + 1} de ${lista.length}: ${f.name}...`)
      try {
        if (f.type === 'application/pdf') {
          const base64 = await new Promise<string>((res, rej) => {
            const r = new FileReader()
            r.onload = () => res(r.result as string)
            r.onerror = rej
            r.readAsDataURL(f)
          })
          const token = await obtenerToken()
          const d = await fetch('/api/pendientes/importar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ pdfBase64: base64 }) }).then((r) => r.json())
          if (d.error) {
            setLog((l) => [...l, { txt: `${f.name}: ${d.error}${/escaneada|imagen/i.test(d.error) ? ' Sacale una foto y subila como imagen.' : ''}`, ok: false }])
            continue
          }
          const v = d.vencimientos || []
          nuevos.push(
            ...itemsDesdeIA(
              [{ servicio: d.titulo || d.proveedor || f.name, lugar: d.unidad || d.edificio || '', tipo: 'gasto', categoria: d.categoria, vencimiento: v[0]?.fecha, monto: v[0]?.monto, vencimiento2: v[1]?.fecha, monto2: v[1]?.monto, periodo: d.periodo, referencia: '' }],
              f.name
            )
          )
        } else if (f.type.startsWith('image/')) {
          // OCR en el navegador (el mismo motor que el escáner de cédula).
          const { createWorker } = await import('tesseract.js')
          const worker = await createWorker('spa')
          const { data } = await worker.recognize(f)
          await worker.terminate()
          if (!data.text || data.text.trim().length < 20) {
            setLog((l) => [...l, { txt: `${f.name}: no se pudo leer texto en la foto (probá con más luz y sin que esté movida).`, ok: false }])
            continue
          }
          const d = await post({ accion: 'texto', texto: `Factura (texto leído por OCR, puede tener errores):\n${data.text}`, hoy })
          if (d.error) {
            setLog((l) => [...l, { txt: `${f.name}: ${d.error}`, ok: false }])
            continue
          }
          nuevos.push(...itemsDesdeIA(d.items, f.name))
        }
      } catch (err: any) {
        setLog((l) => [...l, { txt: `${f.name}: ${err.message || 'error'}`, ok: false }])
      }
    }
    setTrabajando('')
    if (nuevos.length) preparar(nuevos)
  }

  const periodos = useMemo(() => Array.from(new Set(items.map((i) => i.periodo).filter(Boolean) as string[])).sort().reverse(), [items])
  const visibles = items.filter((i) => periodo === 'todos' || i.periodo === periodo)
  const elegidos = visibles.filter((i) => i.incluir && i.monto)
  const totalGastos = elegidos.filter((i) => i.tipo === 'gasto').reduce((s, i) => s + (i.monto || 0), 0)
  const totalIngresos = elegidos.filter((i) => i.tipo === 'ingreso').reduce((s, i) => s + (i.monto || 0), 0)
  const hayVencidas = elegidos.some((i) => i.tipo === 'gasto' && i.vencimiento && i.vencimiento < hoy)

  function cambiar(clave: string, cambios: Partial<ItemImportado>) {
    setItems((prev) => prev.map((i) => (i.clave === clave ? { ...i, ...cambios } : i)))
  }

  async function importar() {
    setTrabajando('Guardando...')
    setLog([])
    const token = await obtenerToken()
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    // Para no duplicar ingresos si se importa dos veces la misma planilla.
    const existentes = ((await fetch('/api/movimientos', { headers: h }).then((r) => r.json())).movimientos || []) as any[]
    const resultado: { txt: string; ok: boolean }[] = []
    for (const it of elegidos) {
      const titulo = tituloDe(it)
      try {
        if (it.tipo === 'gasto') {
          const vencido = !!it.vencimiento && it.vencimiento < hoy
          const vencimientos = [{ fecha: it.vencimiento, monto: it.monto }, ...(it.vencimiento2 && it.monto2 ? [{ fecha: it.vencimiento2, monto: it.monto2 }] : [])]
          const d = await fetch('/api/pendientes', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({
              titulo, categoria: it.categoria, proveedor: '', periodo: it.periodo, propiedadId: it.propiedadId,
              vencimientos, notas: it.referencia ? `Referencia / n.° de cliente: ${it.referencia}` : '',
              historico: vencido && vencidas === 'historico',
            }),
          }).then((r) => r.json())
          if (d.error) {
            resultado.push({ txt: `${titulo}: ${d.error}`, ok: /ya está cargado/i.test(d.error) })
            continue
          }
          if (vencido && vencidas === 'pagada') {
            await fetch(`/api/pendientes/${d.id}/pagar`, { method: 'POST', headers: h, body: JSON.stringify({ fecha: it.fechaPago || it.vencimiento }) })
            resultado.push({ txt: `${titulo}: pagado el ${it.fechaPago || it.vencimiento} (gasto registrado)`, ok: true })
          } else {
            resultado.push({ txt: `${titulo}: ${vencido && vencidas === 'historico' ? 'guardado como pagado (sin gasto)' : 'agregado a Por pagar'}`, ok: true })
          }
        } else {
          const fecha = it.fechaPago || it.vencimiento || hoy
          const repetido = existentes.some((m) => m.tipo === 'ingreso' && m.fecha === fecha && Math.abs(Number(m.monto) - (it.monto || 0)) < 0.01)
          if (repetido) {
            resultado.push({ txt: `${titulo}: ya estaba cargado`, ok: true })
            continue
          }
          const categoria = CATEGORIAS_INGRESO.includes(it.categoria) ? it.categoria : 'Otro'
          const d = await fetch('/api/movimientos', { method: 'POST', headers: h, body: JSON.stringify({ tipo: 'ingreso', monto: it.monto, categoria, descripcion: titulo, fecha, propiedadId: it.propiedadId }) }).then((r) => r.json())
          resultado.push({ txt: `${titulo}: ${d.error || 'ingreso registrado'}`, ok: !d.error })
        }
      } catch (err: any) {
        resultado.push({ txt: `${titulo}: ${err.message || 'error'}`, ok: false })
      }
    }
    setLog(resultado)
    setTrabajando('')
    // Saca de la lista lo que ya se importó bien.
    const hechos = new Set(elegidos.map((i) => i.clave))
    setItems((prev) => prev.filter((i) => !hechos.has(i.clave)))
    onListo()
  }

  const tab = (f: Fuente, t: string) => (
    <button key={f} role="tab" aria-selected={fuente === f} onClick={() => setFuente(f)} className={`min-h-[40px] px-3 font-body text-xs ${fuente === f ? 'bg-ink text-white font-semibold' : 'bg-white text-ink'}`}>
      {t}
    </button>
  )
  const input = 'w-full px-3 py-2 rounded-lg border border-line font-body text-sm'

  return (
    <div className="bg-panel border border-line rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-display text-base font-bold text-ink">Importar gastos</div>
        <button onClick={onCerrar} className="font-body text-xs text-inksoft underline">Cerrar</button>
      </div>

      <div className="flex rounded-lg border border-line overflow-hidden w-fit mb-4" role="tablist">
        {tab('planilla', 'Planilla')}
        {tab('texto', 'Texto con IA')}
        {tab('facturas', 'Fotos / PDF de facturas')}
      </div>

      {fuente === 'planilla' && (
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <label className="font-body text-[11px] text-inksoft block mb-1">Enlace de Google Sheets (compartida como "cualquier persona con el enlace")</label>
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className={input} />
              <button onClick={leerEnlace} disabled={!url || !!trabajando} className="shrink-0 px-3 rounded-lg bg-ink text-white font-body text-xs font-semibold disabled:opacity-50">Leer</button>
            </div>
          </div>
          <div>
            <label className="font-body text-[11px] text-inksoft block mb-1">O subí el archivo (.xlsx o .csv)</label>
            <input type="file" accept=".xlsx,.xls,.csv,text/csv" disabled={!!trabajando} onChange={(e) => e.target.files?.[0] && leerArchivoPlanilla(e.target.files[0])} className="font-body text-xs" />
          </div>
          <div>
            <label className="font-body text-[11px] text-inksoft block mb-1">O copiá las celdas en Sheets (con la fila de títulos) y pegalas acá</label>
            <textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={3} className={input} placeholder="lugar	Servicio	mes-año	fecha pago	Fecha Vencim	Precio	encargado	tipo" />
            <button onClick={leerPegado} disabled={!pegado.trim() || !!trabajando} className="mt-1 px-3 py-1.5 rounded-lg border border-line bg-white font-body text-xs text-ink disabled:opacity-50">Leer lo pegado</button>
          </div>
          <div className="font-body text-[11px] text-inksoft">
            Se reconocen columnas como lugar, servicio, n.° de cliente, mes-año, fecha de pago, vencimiento, precio, encargado y tipo (gasto/ingreso). Lo que tiene otro encargado (por ejemplo "inquilino") queda sin tildar.
          </div>
        </div>
      )}

      {fuente === 'texto' && (
        <div className="mb-4">
          <label className="font-body text-[11px] text-inksoft block mb-1">Pegá lo que tengas: una lista, un mensaje, un mail con vencimientos...</label>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} className={input} placeholder={'Ej: expensas rivera vence 10/10 $377.459\nluz edenor 26.160 el 1/10\ncobro cochera 140.000 el 4/10'} />
          <button onClick={() => leerTexto()} disabled={texto.trim().length < 5 || !!trabajando} className="mt-1 px-3 py-1.5 rounded-lg bg-ink text-white font-body text-xs font-semibold disabled:opacity-50">Leer con IA</button>
        </div>
      )}

      {fuente === 'facturas' && (
        <div className="mb-4">
          <label className="font-body text-[11px] text-inksoft block mb-1">Elegí una o varias facturas: fotos (se leen con OCR en tu celular/computadora) o PDF</label>
          <input type="file" accept="image/*,application/pdf" multiple disabled={!!trabajando} onChange={(e) => e.target.files?.length && leerFacturas(e.target.files)} className="font-body text-xs" />
          <div className="font-body text-[11px] text-inksoft mt-1">Consejo: foto derecha, con buena luz y que se vea el total y el vencimiento. La primera vez el lector tarda un poco más en cargar.</div>
        </div>
      )}

      {trabajando && <div className="font-body text-xs text-inksoft mb-3">{trabajando}</div>}
      {error && <div className="font-body text-xs text-rojo mb-3">{error}</div>}

      {items.length > 0 && (
        <>
          <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
            <label className="font-body text-[11px] text-inksoft flex flex-col gap-1">
              Mostrar
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-line bg-white font-body text-xs text-ink">
                <option value="todos">Todos los meses ({items.length})</option>
                {periodos.map((p) => (
                  <option key={p} value={p}>{etiquetaMes(p)} ({items.filter((i) => i.periodo === p).length})</option>
                ))}
              </select>
            </label>
            <button onClick={() => setItems([])} className="font-body text-[11px] text-inksoft underline">Vaciar lista</button>
          </div>

          <div className="overflow-x-auto border border-line rounded-lg mb-3">
            <table className="w-full font-body text-xs min-w-[760px]">
              <thead>
                <tr className="bg-ink text-white">
                  <th className="px-2 py-1.5" />
                  <th className="text-left px-2 py-1.5">Qué</th>
                  <th className="text-left px-2 py-1.5">Propiedad</th>
                  <th className="text-left px-2 py-1.5">Categoría</th>
                  <th className="text-left px-2 py-1.5">Vence / fecha</th>
                  <th className="text-right px-2 py-1.5">Monto</th>
                  <th className="text-left px-2 py-1.5">Nota</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((it, i) => (
                  <tr key={it.clave} className={`${i % 2 ? 'bg-panelalt' : 'bg-white'} ${it.incluir ? '' : 'opacity-60'}`}>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={it.incluir} onChange={(e) => cambiar(it.clave, { incluir: e.target.checked })} aria-label="Importar" />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${it.tipo === 'ingreso' ? 'bg-verdesoft text-verde' : 'bg-rojosoft text-rojo'}`}>{it.tipo}</span>
                        <input value={it.servicio} onChange={(e) => cambiar(it.clave, { servicio: e.target.value })} className="w-40 px-1.5 py-1 rounded border border-line" />
                      </div>
                      {(it.lugar || it.referencia) && <div className="text-[10px] text-inksoft mt-0.5">{[it.lugar, it.referencia && `ref. ${it.referencia}`].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td className="px-2 py-1">
                      <select value={it.propiedadId || ''} onChange={(e) => cambiar(it.clave, { propiedadId: e.target.value || null })} className="w-32 px-1 py-1 rounded border border-line bg-white">
                        <option value="">—</option>
                        {propiedades.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <select value={it.categoria} onChange={(e) => cambiar(it.clave, { categoria: e.target.value })} className="w-36 px-1 py-1 rounded border border-line bg-white">
                        {(it.tipo === 'ingreso' ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO).map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="date" value={it.vencimiento || ''} onChange={(e) => cambiar(it.clave, { vencimiento: e.target.value || null })} className={`px-1 py-1 rounded border ${it.tipo === 'gasto' && it.vencimiento && it.vencimiento < hoy ? 'border-rojo' : 'border-line'}`} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <input type="number" value={it.monto ?? ''} onChange={(e) => cambiar(it.clave, { monto: Number(e.target.value) || null })} className="w-28 px-1.5 py-1 rounded border border-line text-right" />
                    </td>
                    <td className="px-2 py-1 text-[11px] text-inksoft">{it.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hayVencidas && (
            <div className="border border-line rounded-lg p-3 mb-3 bg-white/60 font-body text-xs text-ink">
              <div className="font-semibold mb-1">Los gastos con fecha ya pasada (borde rojo)...</div>
              {([
                ['pagada', 'ya los pagué: registrar el gasto en esa fecha'],
                ['historico', 'ya los pagué, pero solo para el historial (sin crear gasto)'],
                ['pendiente', 'todavía no los pagué: dejarlos en "Por pagar"'],
              ] as const).map(([v, t]) => (
                <label key={v} className="flex items-center gap-2 py-0.5">
                  <input type="radio" checked={vencidas === v} onChange={() => setVencidas(v)} />
                  {t}
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-body text-xs text-inksoft">
              {elegidos.length} elegidos · gastos {formatoBs(totalGastos)}
              {totalIngresos ? ` · ingresos ${formatoBs(totalIngresos)}` : ''}
            </div>
            <button onClick={importar} disabled={!elegidos.length || !!trabajando} className="min-h-[44px] px-4 rounded-lg bg-verde text-white font-body text-sm font-semibold disabled:opacity-50">
              Importar {elegidos.length}
            </button>
          </div>
        </>
      )}

      {log.length > 0 && (
        <ul className="mt-3 font-body text-[11px]">
          {log.map((l, i) => (
            <li key={i} className={l.ok ? 'text-verde' : 'text-rojo'}>{l.ok ? '✓' : '✗'} {l.txt}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
