// Modelo de datos del módulo de inmuebles.
//
// La idea central: una PROPIEDAD (la casa) se divide en UNIDADES (los
// departamentos/habitaciones que se alquilan por separado). El alquiler
// nunca se le asigna a la casa entera, siempre a una unidad — así una
// misma casa puede tener 3 inquilinos distintos con 3 precios distintos.

// ---------- Unidades (departamentos / habitaciones) ----------

export type TipoUnidad = 'departamento' | 'habitacion' | 'local' | 'consultorio' | 'deposito'

export const TIPOS_UNIDAD: { id: TipoUnidad; label: string }[] = [
  { id: 'departamento', label: 'Departamento' },
  { id: 'habitacion', label: 'Habitación' },
  { id: 'local', label: 'Local comercial' },
  { id: 'consultorio', label: 'Consultorio' },
  { id: 'deposito', label: 'Depósito' },
]

// Qué tiene el ambiente — es lo que distingue un "depto con cocina" de
// una "habitación sola", que es justamente lo que cambia el precio.
export type Comodidad = 'cocina' | 'bano_privado' | 'bano_compartido' | 'amoblado' | 'patio' | 'garaje' | 'agua_caliente' | 'medidor_propio'

export const COMODIDADES: { id: Comodidad; label: string }[] = [
  { id: 'cocina', label: 'Cocina' },
  { id: 'bano_privado', label: 'Baño privado' },
  { id: 'bano_compartido', label: 'Baño compartido' },
  { id: 'amoblado', label: 'Amoblado' },
  { id: 'patio', label: 'Patio' },
  { id: 'garaje', label: 'Garaje' },
  { id: 'agua_caliente', label: 'Agua caliente' },
  { id: 'medidor_propio', label: 'Medidor propio' },
]

export type EstadoUnidad = 'disponible' | 'alquilada' | 'en_refaccion' | 'uso_familiar'

export const ESTADOS_UNIDAD: { id: EstadoUnidad; label: string; color: string }[] = [
  { id: 'disponible', label: 'Disponible', color: 'text-amber-600' },
  { id: 'alquilada', label: 'Alquilada', color: 'text-emerald-600' },
  { id: 'en_refaccion', label: 'En refacción', color: 'text-orange-600' },
  { id: 'uso_familiar', label: 'Uso familiar', color: 'text-slate-500' },
]

export type Unidad = {
  id: string
  propiedadId: string
  nombre: string // "Depto 1", "Habitación 3"
  tipo: TipoUnidad
  comodidades: Comodidad[]
  metros?: number | null
  // Canon estándar: el precio "de lista" que la familia considera justo
  // para esa unidad. Cuando se asigna un alquiler por debajo o por
  // encima, el sistema marca la diferencia (ver detectarVariacion).
  canonEstandar: number
  estado: EstadoUnidad
  notas?: string
  creadoEn: string
}

// ---------- Reparaciones pendientes ----------

export type PrioridadReparacion = 'baja' | 'media' | 'urgente'

export type Reparacion = {
  id: string
  propiedadId: string
  unidadId?: string | null // puede ser de la casa entera (techo, portón)
  detalle: string
  prioridad: PrioridadReparacion
  // Quién lo pidió: puede ser el inquilino (una solicitud que entró por
  // WhatsApp) o alguien de la familia que lo detectó.
  solicitadoPor?: string
  costoEstimado?: number | null
  resuelta: boolean
  resueltaEn?: string | null
  // Si al resolverla se cargó el gasto, guardamos el id del movimiento
  // para poder cruzar "cuánto nos costó mantener esta unidad".
  movimientoGastoId?: string | null
  creadoEn: string
}

// ---------- Administradores (quién gestiona cada espacio) ----------

// A propósito NO es una lista fija de nombres hardcodeados: se resuelve
// contra los perfiles reales de /api/familia, así que si mañana se suma
// alguien más a administrar, no hay que tocar código.
export type Administrador = {
  uid: string
  nombre: string
}

// ---------- Alquileres ----------

export type EstadoAlquiler = 'activo' | 'finalizado' | 'rescindido'

export type Alquiler = {
  id: string
  propiedadId: string
  unidadId: string
  // Datos del inquilino — el CI es obligatorio porque es lo que después
  // usa el generador de contratos.
  inquilinoNombre: string
  inquilinoCI: string
  inquilinoTelefono?: string
  inquilinoDireccionAnterior?: string
  // Condiciones
  montoMensual: number // canon del primer tramo (compatibilidad)
  // Canon fijo o escalonado + prorrateo del primer/último mes. El
  // monto de cada mes se calcula con cuotaDelMes() de
  // src/lib/esquemaPago.ts. Alquileres viejos sin esquema = canon fijo.
  esquemaPago?: import('@/lib/esquemaPago').EsquemaPago | null
  anticipo?: number | null // meses de adelanto / garantía
  diaCobro: number // 1-31
  fechaInicio: string // YYYY-MM-DD
  fechaFin?: string | null // vencimiento del contrato
  // Quién de la familia administra ESTE alquiler puntual.
  administradorUid: string
  administradorNombre: string
  // Contrato firmado escaneado — opcional al registrar, se puede
  // subir después.
  contratoUrl?: string | null
  contratoSubidoEn?: string | null
  estado: EstadoAlquiler
  creadoEn: string
  creadoPor: string
}

// Compara el precio acordado contra el canon estándar de la unidad.
// Devuelve null si coinciden, o el detalle de la diferencia para
// mostrarla como aviso (no bloquea: a veces se alquila más barato a
// propósito, pero la familia tiene que verlo y decidirlo, no que pase
// sin que nadie se entere).
export function detectarVariacion(montoAcordado: number, canonEstandar: number) {
  if (!canonEstandar || montoAcordado === canonEstandar) return null
  const diferencia = montoAcordado - canonEstandar
  const porcentaje = Math.round((diferencia / canonEstandar) * 100)
  return {
    diferencia,
    porcentaje,
    esMenor: diferencia < 0,
    texto:
      diferencia < 0
        ? `Bs ${Math.abs(diferencia)} por debajo del canon estándar (${Math.abs(porcentaje)}% menos)`
        : `Bs ${diferencia} por encima del canon estándar (${porcentaje}% más)`,
  }
}

// ---------- Fee de administración ----------

// El incentivo que propuso Marcelo: 5% sobre el total administrado, a
// favor de quien gestiona directamente cada inmueble. Se calcula y se
// liquida UNA VEZ AL AÑO, en la reunión familiar de evaluación — no se
// descuenta mes a mes, por eso el cálculo es siempre sobre un período
// cerrado y queda registrado como una liquidación aparte.
export const FEE_ADMINISTRACION = 0.05

export type LiquidacionFee = {
  id: string
  anio: number
  administradorUid: string
  administradorNombre: string
  totalAdministrado: number // suma de alquileres cobrados que administró
  fee: number // totalAdministrado * FEE_ADMINISTRACION
  pagada: boolean
  pagadaEn?: string | null
  notas?: string
  calculadaEn: string
}

export function calcularFee(totalAdministrado: number) {
  return Math.round(totalAdministrado * FEE_ADMINISTRACION)
}
