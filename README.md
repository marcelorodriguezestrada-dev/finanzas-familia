# Finanzas de la Familia

App privada para llevar las finanzas de la familia entre varias personas: alquileres que cobran, gastos, ingresos y patrimonio, con balance mensual.

## Cómo funciona

- **Roles**: la primera persona que se registra queda **admin** automático. Todos los que se registran después quedan **pendientes** hasta que un admin los aprueba desde la pestaña "Familia" (ahí también se puede asignar quién más es admin).
- **Admin** puede: cargar/editar/borrar propiedades, patrimonio, aprobar gente nueva, y editar o borrar cualquier movimiento.
- **Miembro** puede: cargar ingresos y gastos, ver todo (transparencia total entre la familia), y editar/borrar solo sus propios movimientos.
- **Propiedades**: cada una tiene un alquiler mensual configurado; el botón "Marcar alquiler de este mes como cobrado" carga el ingreso solo, sin tener que tipearlo a mano.
- **Balance mensual**: elegís el mes y ves ingresos/gastos por categoría, más una nota de texto libre para dejar comentarios (por ejemplo, por qué se gastó de más ese mes).

## Puesta en marcha

1. `npm install`
2. Crear un proyecto en [Firebase Console](https://console.firebase.google.com) (gratis, plan Spark alcanza):
   - Activar **Authentication** → método Email/Password
   - Activar **Firestore Database** (modo producción, cualquier región)
   - Generar una clave de cuenta de servicio: Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
3. Copiar `.env.example` a `.env.local` y completar con los datos de Firebase (ver comentarios en el archivo)
4. `npm run dev` y entrar a `http://localhost:3000/login` para crear la primera cuenta (queda admin automático)

## Deploy

Pensado para desplegar gratis en [Vercel](https://vercel.com): conectar el repo, cargar las mismas variables de entorno del `.env.local` en Project Settings → Environment Variables, y listo.
# finanzas-familia
