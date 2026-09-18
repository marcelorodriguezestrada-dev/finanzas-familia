export const CATEGORIAS_GASTO = [
  'Comida',
  'Servicios (luz, agua, gas, internet)',
  'Salud',
  'Educación',
  'Transporte',
  'Mantenimiento de propiedades',
  'Impuestos',
  'Entretenimiento',
  'Otro',
]

export const CATEGORIAS_INGRESO = ['Alquiler', 'Sueldo', 'Venta', 'Otro']

export const TIPOS_PATRIMONIO = [
  { id: 'inmueble', label: 'Inmueble', esDeuda: false },
  { id: 'vehiculo', label: 'Vehículo', esDeuda: false },
  { id: 'inversion', label: 'Inversión / ahorro', esDeuda: false },
  { id: 'otro_activo', label: 'Otro activo', esDeuda: false },
  { id: 'deuda', label: 'Deuda / préstamo pendiente', esDeuda: true },
]

export function nombreMes(clave: string) {
  // clave: 'YYYY-MM'
  const [anio, mes] = clave.split('-').map(Number)
  const fecha = new Date(anio, mes - 1, 1)
  return fecha.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
}

export function mesActual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
