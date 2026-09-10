# Demo gratuita: Render + Neon

## Plataforma elegida

- Render Free aloja Express y la interfaz React compilada en una sola URL HTTPS.
- Neon Free conserva PostgreSQL por separado. Crear un proyecto exclusivo de demo,
  con PostgreSQL 18, preferiblemente en una region cercana a Oregon.
- No se publica la base local ni se ejecuta el seed de desarrollo.
- Render suspende el servicio tras 15 minutos sin visitas; la siguiente visita puede
  tardar aproximadamente un minuto. Su plan incluye 750 horas mensuales por espacio.
- La base gratuita de Render caduca a los 30 dias; por eso se usa Neon.
- Neon aplica limites de almacenamiento y computo. Mantener ambos servicios en Free;
  no habilitar cambios automaticos a planes de pago.
- El disco de Render Free es temporal: no sirve para conservar archivos o respaldos.
  Las operaciones implementadas guardan sus datos en PostgreSQL.

Fuentes: https://render.com/docs/free, https://neon.com/pricing.

## Publicacion

1. Subir estos cambios al repositorio de GitHub `alaangc/warehouse_manager`.
2. Crear en Neon Free una base nueva y exclusiva para la demo. Copiar su cadena de
   conexion **directa**, con TLS (`sslmode=require`), desde Connect. No usar la base
   de produccion. Las migraciones requieren un rol propietario con permisos para
   crear roles y las extensiones `pgcrypto` y `btree_gist`.
3. En Render, crear un Blueprint desde el repositorio y seleccionar la revision que
   contiene `render.yaml`. Verificar que el unico servicio diga **Free / $0**.
4. Completar los secretos solicitados: `DATABASE_URL` de Neon y `DEMO_PASSWORD`
   (una clave exclusiva de esta demo, al menos 16 caracteres). No guardarlos en Git.
   `SESSION_SECRET` se genera automaticamente.
5. Publicar. El inicio ejecuta las migraciones, inicializa los ejemplos una sola vez
   y arranca el servidor. `RENDER_EXTERNAL_URL` configura el origen permitido de las
   solicitudes. No es necesario escribir una URL anticipadamente.
6. Verificar `/api/v1/health`, abrir la URL asignada y entrar con `demo-admin` o
   `demo-driver`, usando la clave de demo configurada.

Las actualizaciones automaticas estan desactivadas. Los reinicios y publicaciones
posteriores conservan los datos y las claves existentes. Cambiar `DEMO_PASSWORD`
despues del primer arranque no cambia las contraseñas ya almacenadas.

## Recorrido sugerido

Entrar como `demo-admin`: revisar los dos almacenes, tres productos, sus existencias,
dos clientes y una camioneta. Crear una ruta asignada a `demo-driver`, cargar producto
y despacharla. Entrar como `demo-driver` para registrar una venta. Volver como
administrador para consultar existencias y reportes.

La demo es compartida: los visitantes que tengan la clave modifican la misma base.
Usar solo datos ficticios. Los reportes de ventas comienzan vacios hasta registrar
operaciones; no se representan ventas ficticias como historial real.

## Validacion local

Ejecutar `pnpm build`, `pnpm lint` y `pnpm test:unit`.
La prueba `apps/api/tests/integration/demo-deployment.test.ts` utiliza PostgreSQL
descartable mediante Docker para comprobar migraciones, inicializacion y reinicios.
No utiliza la base de desarrollo.

Para iniciar manualmente con una base **dedicada y vacia**, configurar las variables
de `render.yaml`, agregar `APP_ORIGIN` con el origen local elegido y ejecutar
`pnpm demo:start`. Para HTTP local, usar `NODE_ENV=development`; en Render se conserva
`NODE_ENV=production` para que las cookies requieran HTTPS.
