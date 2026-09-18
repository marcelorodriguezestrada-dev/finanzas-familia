import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/auth'
import './globals.css'

export const metadata: Metadata = {
  title: 'Finanzas de la Familia',
  description: 'Control de ingresos, gastos, alquileres y patrimonio familiar',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-body">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
