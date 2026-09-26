'use client'

import { EsquemaPago, normalizarEsquema, formatoBs } from '@/lib/esquemaPago'

// Un tramo del canon tal como se edita en pantalla (strings de los
// inputs). meses vacío = "hasta el final del contrato".
export type TramoForm = { monto: string; meses: string }

export type CanonForm = {
  tramos: TramoForm[]
  proporcionalInicio: boolean
  proporcionalFin: boolean
}

export function canonFormDesdeEsquema(e: EsquemaPago | null | undefined, montoFallback?: number): CanonForm {
  if (!e || !e.tramos.length) {
    return { tramos: [{ monto: montoFallback ? String(montoFallback) : '', meses: '' }], proporcionalInicio: true, proporcionalFin: true }
  }
  return {
    tramos: e.tramos.map((t, i) => ({ monto: String(t.monto), meses: i === e.tramos.length - 1 ? '' : String(t.meses || 1) })),
    proporcionalInicio: e.proporcionalInicio,
    proporcionalFin: e.proporcionalFin,
  }
}

export function esquemaDesdeCanonForm(c: CanonForm): EsquemaPago | null {
  return normalizarEsquema({
    tramos: c.tramos.map((t, i) => ({
      monto: Number(t.monto),
      meses: i === c.tramos.length - 1 && !t.meses ? null : Number(t.meses) || null,
    })),
    proporcionalInicio: c.proporcionalInicio,
    proporcionalFin: c.proporcionalFin,
    baseDias: 30,
  })
}

export function canonFormValido(c: CanonForm) {
  return c.tramos.every((t) => Number(t.monto) > 0)
}

// Editor del canon: uno o más tramos (fijo o escalonado) + prorrateo
// del primer y último mes. Se usa al asignar un alquiler nuevo y para
// corregir el plan de pago de uno ya registrado.
export function EditorCanon({
  valor,
  onCambio,
  fechaInicio,
  fechaFin,
}: {
  valor: CanonForm
  onCambio: (c: CanonForm) => void
  fechaInicio: string
  fechaFin?: string | null
}) {
  const { tramos } = valor
  const arrancaDia1 = (fechaInicio || '').slice(8, 10) === '01'
  const terminaAMitadDeMes = !!fechaFin && fechaFin.slice(8, 10) !== '01'
  const set = (parcial: Partial<CanonForm>) => onCambio({ ...valor, ...parcial })

  function actualizarTramo(i: number, campo: keyof TramoForm, v: string) {
    set({ tramos: tramos.map((t, idx) => (idx === i ? { ...t, [campo]: v } : t)) })
  }

  function agregarTramo() {
    // El tramo que era "hasta el final" pasa a durar 3 meses y el nuevo
    // queda como el último.
    const copia = tramos.map((t, i) => (i === tramos.length - 1 && !t.meses ? { ...t, meses: '3' } : t))
    const ultimo = Number(copia[copia.length - 1]?.monto) || 0
    set({ tramos: [...copia, { monto: ultimo ? String(ultimo) : '', meses: '' }] })
  }

  function quitarTramo(i: number) {
    const next = tramos.filter((_, idx) => idx !== i)
    if (next.length) next[next.length - 1] = { ...next[next.length - 1], meses: '' }
    set({ tramos: next.length ? next : [{ monto: '', meses: '' }] })
  }

  const primerMonto = Number(tramos[0]?.monto) || 0

  return (
    <div className="border border-line rounded-lg p-3 bg-white/50">
      {tramos.map((t, i) => {
        const esUltimo = i === tramos.length - 1
        const desde = tramos.slice(0, i).reduce((s, x) => s + (Number(x.meses) || 0), 0) + 1
        return (
          <div key={i} className="flex items-center gap-2 flex-wrap py-1.5">
            <span className="font-body text-[11px] text-inksoft w-24 shrink-0">
              {tramos.length === 1 ? 'Canon mensual' : i === 0 ? 'Primeros meses' : `Desde el mes ${desde}`}
            </span>
            <div className="flex items-center gap-1">
              <span className="font-body text-xs text-inksoft">Bs</span>
              <input
                value={t.monto}
                onChange={(e) => actualizarTramo(i, 'monto', e.target.value)}
                type="number"
                min={0}
                placeholder="2300"
                className="w-28 px-2.5 py-2 rounded-lg border border-line font-body text-sm"
              />
            </div>
            {tramos.length > 1 && !esUltimo && (
              <div className="flex items-center gap-1">
                <span className="font-body text-xs text-inksoft">durante</span>
                <input
                  value={t.meses}
                  onChange={(e) => actualizarTramo(i, 'meses', e.target.value)}
                  type="number"
                  min={1}
                  className="w-16 px-2.5 py-2 rounded-lg border border-line font-body text-sm"
                />
                <span className="font-body text-xs text-inksoft">meses</span>
              </div>
            )}
            {tramos.length > 1 && esUltimo && <span className="font-body text-xs text-inksoft">hasta el final del contrato</span>}
            {tramos.length > 1 && (
              <button type="button" onClick={() => quitarTramo(i)} className="font-body text-[11px] text-rojo ml-auto">
                Quitar
              </button>
            )}
          </div>
        )
      })}
      <button type="button" onClick={agregarTramo} className="font-body text-[11px] text-ink underline mt-1">
        + Agregar aumento (canon escalonado)
      </button>

      {(!arrancaDia1 || terminaAMitadDeMes) && (
        <div className="border-t border-line mt-3 pt-2 space-y-1">
          {!arrancaDia1 && (
            <label className="flex items-start gap-2 font-body text-xs text-ink">
              <input type="checkbox" checked={valor.proporcionalInicio} onChange={(e) => set({ proporcionalInicio: e.target.checked })} className="mt-0.5" />
              <span>
                Cobrar a la firma solo los días que quedan del primer mes (proporcional, base 30 días)
                {primerMonto > 0 && ` — ${formatoBs(primerMonto / 30)}/día`}
              </span>
            </label>
          )}
          {terminaAMitadDeMes && (arrancaDia1 || valor.proporcionalInicio) && (
            <label className="flex items-start gap-2 font-body text-xs text-ink">
              <input type="checkbox" checked={valor.proporcionalFin} onChange={(e) => set({ proporcionalFin: e.target.checked })} className="mt-0.5" />
              <span>Cobrar proporcional el último mes (solo los días hasta la entrega)</span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
