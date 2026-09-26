# Finanzas de la Familia

App privada para llevar las finanzas de la familia entre varias personas: registro e inventario de inmuebles, alquileres, contratos, gastos, ingresos y patrimonio, con dashboard y balance mensual.

## Cómo funciona

- **Acceso**: cualquiera que se registre y complete su perfil tiene acceso completo — es una app familiar chica, pensada para transparencia total entre todos (todos ven todos los movimientos).
- **Propiedades y unidades** (`/propiedades`): cada casa familiar se carga una vez y se desglosa en departamentos o habitaciones independientes (unidades). Cada unidad tiene su propia ficha: tipo de ambiente, comodidades (cocina, baño privado, amoblado, etc.), canon de alquiler estándar recomendado, y su propio historial de reparaciones pendientes/resueltas. Las reparaciones de la casa entera (techo, portón) se cargan a nivel propiedad, sin unidad asociada.
- **Alquileres** (`/alquileres`): se asigna un inquilino a una unidad puntual, con sus datos (nombre, C.I., teléfono), el monto acordado y quién de la familia administra ese espacio. Si el monto difiere del canon estándar de la unidad, el sistema lo marca como variación (a favor o en contra) y queda guardado en el registro. El contrato firmado (imagen o PDF) se puede adjuntar al registrar o más adelante. El botón "Marcar cobrado este mes" carga el ingreso automáticamente.
- **Plan de pago (canon fijo o escalonado)**: al asignar el alquiler se carga el canon por tramos (ej. Bs 2.300 durante 3 meses y después Bs 2.500 hasta el final), con cobro proporcional de los días sueltos del primer y último mes (base 30 días). El formulario muestra en vivo el resumen (pago a la firma, total del contrato, cantidad de pagos) y el cronograma mes a mes. "Marcar cobrado este mes" registra el monto que corresponde a ESE mes, y el calendario de moras usa el vencimiento real. Los alquileres ya cargados se corrigen con "Editar plan de pago". Toda la lógica está en `src/lib/esquemaPago.ts`.
- **Generador de contratos**: arma un PDF a color (formato del contrato de Fortunato Gumiel v8): cláusula de canon escalonado con montos en letras, recuadro "Resumen del pago", firmas en grilla y Anexo I con el cronograma. Cada firmante puede llevar su **firma en foto**: el navegador le quita el fondo del papel y la recorta (`src/components/SubirFirma.tsx`); la firma y C.I. propias se pueden guardar en el perfil. Texto legal en `src/lib/plantillaContrato.ts`, maquetado en `src/lib/pdfContrato.ts`. Usa la fuente Liberation Sans embebida (`src/lib/fuentes`, licencia SIL OFL) para que se vea igual en cualquier visor. Subir el contrato firmado es opcional al registrar: se puede subir después desde la tarjeta del alquiler.
- **Dashboard** (`/dashboard`): balance por propiedad y por persona, evolución mensual de ingresos/gastos, y el **Fondo de Inversión** — el acumulado histórico disponible para reinvertir, graficado mes a mes.
- **Calendario y alertas** (`/calendario`): quién está en mora este mes, próximos cobros de los siguientes 7 días, contratos por vencer en 60 días, y el listado de reparaciones pendientes (las notas/pedidos de los inquilinos durante el arrendamiento).
- **Fee de administración** (`/administracion`): una vez al año (en la reunión familiar), se calcula el 5% sobre el total administrado por cada persona (según los alquileres que gestiona), y queda como liquidación marcable como pagada.
- **Balance mensual** (`/balance`): elegís el mes y ves ingresos/gastos por categoría — los gastos de mantenimiento cargados al resolver una reparación quedan reflejados acá, descontados del análisis. Incluye una nota de texto libre para comentarios del mes.

## Servicios externos que usa

- **Firebase** (Auth + Firestore): login y base de datos.
- **ImgBB**: aloja fotos (comprobantes, contratos escaneados como imagen).
- **Supabase Storage**: aloja PDFs (contratos firmados que ya son PDF, comprobantes en PDF). Hace falta crear un bucket público llamado `contratos` desde el dashboard de Supabase.
- El generador de contratos arma el PDF en el propio servidor (con `pdf-lib`), no depende de ningún servicio externo.

## Puesta en marcha

1. `npm install`
2. Crear un proyecto en [Firebase Console](https://console.firebase.google.com) (gratis, plan Spark alcanza):
   - Activar **Authentication** → método Email/Password
   - Activar **Firestore Database** (modo producción, cualquier región)
   - Generar una clave de cuenta de servicio: Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
3. Crear una cuenta en [ImgBB](https://api.imgbb.com/) y sacar una API key gratis, para las fotos.
4. Crear un proyecto en [Supabase](https://supabase.com) (gratis), y adentro: Storage → New bucket → nombre `contratos`, marcado como público. Sacar la `service_role key` de Configuración → API.
5. Copiar `.env.example` a `.env.local` y completar con los datos de Firebase, ImgBB y Supabase (ver comentarios en el archivo)
6. `npm run dev` y entrar a `http://localhost:3000/login` para crear la primera cuenta

## Deploy

Pensado para desplegar gratis en [Vercel](https://vercel.com): conectar el repo, cargar las mismas variables de entorno del `.env.local` en Project Settings → Environment Variables, y listo.
# finanzas-familia
