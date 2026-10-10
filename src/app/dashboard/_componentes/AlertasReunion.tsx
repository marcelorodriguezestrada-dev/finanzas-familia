'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { formatoBs, fechaCorta } from '@/lib/esquemaPago'

// Pagos parciales de alquileres para tratar en reunión familiar. Cada
// alerta muestra qué se pagó, qué falta y la explicación del inquilino,
// y permite agendar la reunión, avisar a la familia por WhatsApp y
// dejar registrado qué se decidió.
export function AlertasReunion({ alertas, onCambio }: { alertas: any[]; onCambio: () => void }) {
  const { obtenerToken } = useAuth()
  const [fechaReunion, setFechaReunion] = useState<Record<string, string>>({})
  const [decision, setDecision] = useState<Record<string, string>>({})
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState<string | null>(null)

  if (!alertas.length) return null
  const totalFalta = alertas.reduce((s, a) => s + Number(a.faltante || 0), 0)

  async function patch(id: string, body: any) {
    setError('')
    setTrabajando(id)
    try {
      const token = await obtenerToken()
      const d = await fetch(`/api/alertas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }).then((r) => r.json())
      if (d.error) return setError(d.error)
      setResolviendo(null)
      onCambio()
    } finally {
      setTrabajando(null)
    }
  }

  function avisarFamilia() {
    const lineas = [
      '*Pagos de alquiler incompletos — para hablar en familia*',
      '',
      ...alertas.map(
        (a) =>
          `• ${a.inquilinoNombre} (${a.lugar}) — ${a.etiquetaMes}: pagó ${formatoBs(a.pagado)} de ${formatoBs(a.esperado)}, faltan ${formatoBs(a.faltante)}.` +
          (a.explicaciones?.length ? `\n  Dijo: "${a.explicaciones[a.explicaciones.length - 1].texto}"` : '') +
          (a.administradorNombre ? `\n  Administra: ${a.administradorNombre}` : '')
      ),
      '',
      `Total que falta cobrar: ${formatoBs(totalFalta)}.`,
      (() => {
        const f = alertas.map((a) => a.fechaReunion).filter(Boolean).sort()[0]
        return f ? `Propongo reunirnos el ${fechaCorta(f.slice(0, 10))}${f.length > 10 ? ` a las ${f.slice(11, 16)}` : ''} para decidir qué hacemos.` : '¿Cuándo nos reunimos para decidir qué hacemos?'
      })(),
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lineas.join('\n'))}`, '_blank', 'noopener')
  }

  return (
    <section className="border-2 border-ocre bg-ocresoft rounded-xl p-4 mb-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="m-0 font-display text-lg font-bold text-[#6A4708]">⚠ Para tratar en reunión familiar</h2>
          <div className="font-body text-xs text-[#6A4708] mt-0.5">
            {alertas.length} {alertas.length === 1 ? 'alquiler no pagó completo' : 'alquileres no pagaron completo'} · faltan {formatoBs(totalFalta)}
          </div>
        </div>
        <button onClick={avisarFamilia} className="min-h-[40px] px-3 rounded-lg bg-[#B3831F] text-[#1A1408] font-body text-xs font-bold">
          Avisar a la familia por WhatsApp
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {alertas.map((a) => (
          <div key={a.id} className="bg-white border border-line rounded-lg p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-body text-sm font-semibold text-ink">{a.inquilinoNombre} · {a.etiquetaMes}</div>
                <div className="font-body text-[11px] text-inksoft">
                  {a.lugar}
                  {a.administradorNombre ? ` · administra ${a.administradorNombre}` : ''}
                  {a.inquilinoTelefono ? ` · 📞 ${a.inquilinoTelefono}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="font-body text-[11px] text-inksoft">pagó {formatoBs(a.pagado)} de {formatoBs(a.esperado)}</div>
                <div className="font-display text-base font-bold text-rojo">faltan {formatoBs(a.faltante)}</div>
              </div>
            </div>

            {(a.explicaciones || []).length > 0 && (
              <ul className="mt-2 mb-0 pl-0 list-none flex flex-col gap-1">
                {a.explicaciones.map((e: any, i: number) => (
                  <li key={i} className="font-body text-xs text-ink bg-panelalt rounded px-2 py-1.5">
                    <span className="text-inksoft">
                      {fechaCorta(e.fecha)} · pagó {formatoBs(e.monto)} · anotó {e.porNombre}:
                    </span>{' '}
                    "{e.texto}"
                  </li>
                ))}
              </ul>
            )}

            {a.estado === 'reunion' && a.fechaReunion && (
              <div className="font-body text-xs text-[#1C3A5E] mt-2">
                📅 Reunión agendada: {fechaCorta(a.fechaReunion.slice(0, 10))}
                {a.fechaReunion.length > 10 ? ` a las ${a.fechaReunion.slice(11, 16)}` : ''}
                {a.reunionAgendadaPor ? ` (por ${a.reunionAgendadaPor})` : ''}
              </div>
            )}

            <div className="flex items-end gap-2 flex-wrap mt-3">
              <label className="font-body text-[11px] text-inksoft flex flex-col gap-0.5">
                {a.estado === 'reunion' ? 'Cambiar fecha de reunión' : 'Fecha de la reunión'}
                <input
                  type="datetime-local"
                  value={fechaReunion[a.id] ?? (a.fechaReunion || '')}
                  onChange={(e) => setFechaReunion((m) => ({ ...m, [a.id]: e.target.value }))}
                  className="px-2 py-1.5 rounded border border-line font-body text-xs text-ink"
                />
              </label>
              <button
                onClick={() => patch(a.id, { estado: 'reunion', fechaReunion: fechaReunion[a.id] ?? a.fechaReunion })}
                disabled={!(fechaReunion[a.id] ?? a.fechaReunion) || trabajando === a.id}
                className="min-h-[34px] px-3 rounded-lg border border-line bg-white font-body text-xs text-ink disabled:opacity-50"
              >
                Agendar reunión
              </button>
              <button
                onClick={() => setResolviendo(resolviendo === a.id ? null : a.id)}
                className="min-h-[34px] px-3 rounded-lg bg-ink text-white font-body text-xs font-semibold"
              >
                {resolviendo === a.id ? 'Cancelar' : 'Registrar lo que se decidió'}
              </button>
            </div>

            {resolviendo === a.id && (
              <div className="mt-2">
                <textarea
                  value={decision[a.id] || ''}
                  onChange={(e) => setDecision((m) => ({ ...m, [a.id]: e.target.value }))}
                  rows={2}
                  placeholder="Ej: le damos plazo hasta el 20; si no completa, se aplica el recargo y se habla de rescindir."
                  className="w-full px-3 py-2 rounded-lg border border-line font-body text-sm text-ink"
                />
                <button
                  onClick={() => patch(a.id, { estado: 'resuelta', decision: decision[a.id] || '' })}
                  disabled={trabajando === a.id}
                  className="mt-1 min-h-[36px] px-4 rounded-lg bg-verde text-white font-body text-xs font-semibold disabled:opacity-50"
                >
                  Guardar decisión y cerrar alerta
                </button>
                <div className="font-body text-[11px] text-inksoft mt-1">Lo que falta sigue figurando como deuda del inquilino hasta que se cobre (o se registre un acuerdo en Deudas).</div>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <div className="font-body text-xs text-rojo mt-2">{error}</div>}
      <div className="font-body text-[11px] text-[#6A4708] mt-3">Cuando el inquilino complete el pago (registrándolo como cobro de ese mes), la alerta se cierra sola.</div>
    </section>
  )
}
