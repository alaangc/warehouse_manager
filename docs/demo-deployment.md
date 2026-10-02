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
  Los registros de negocio se guardan en PostgreSQL, pero los PDF generados se
  guardan en `DOCUMENT_STORAGE_PATH` y pueden perderse al reiniciar o publicar.
  Una solicitud explicita de generacion puede reconstruirlos desde sus fuentes;
  una descarga directa de un archivo perdido devuelve `DOCUMENT_CONTENT_UNAVAILABLE`.
  Nunca repetir una venta, carga o cierre para recuperar un PDF. Para conservar los
  archivos, evaluar almacenamiento persistente antes de usar datos reales; este
  Blueprint no contrata discos ni servicios pagados.

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
   Configurar tambien `TRUST_PROXY` con las IP/CIDR verificadas del proxy de ingreso
   del servicio (separadas por comas). Confirmarlas con la topologia del servicio o
   soporte de Render; no usar IP de salida de Neon/Render como sustituto, `true`,
   numero de saltos, `0.0.0.0/0` ni rangos privados supuestos. Sin esta configuracion,
   el inicio de produccion se detiene antes de migrar. No desactivar HTTPS ni usar
   `NODE_ENV=development` como solucion. Consultar [seguridad HTTP](operations/security.md).
5. Publicar. El inicio ejecuta las migraciones, inicializa los ejemplos una sola vez
   y arranca el servidor. `RENDER_EXTERNAL_URL` configura el origen permitido de las
   solicitudes. No es necesario escribir una URL anticipadamente.
6. Verificar `/api/v1/health`, abrir la URL asignada y entrar con `demo-admin` o
   `demo-driver`, usando la clave de demo configurada.

Las actualizaciones automaticas estan desactivadas. Los reinicios y publicaciones
posteriores conservan los datos y las claves existentes. Cambiar `DEMO_PASSWORD`
despues del primer arranque no cambia las contraseñas ya almacenadas.

## Actualizar el servicio existente con cambios de main

La integracion local del 2026-10-01 todavia tiene verificaciones pendientes. Revisar
[resultados y bloqueos](demo-merge-validation.md) antes de publicar; una compilacion
correcta por si sola no autoriza el despliegue.

No crear otro servicio ni cambiar `DATABASE_URL` si se quiere conservar la URL y
la base de la demo actual. El servicio debe seguir conectado a `demo/render-neon`.

1. Integrar `main` en `demo/render-neon`, resolver conflictos y ejecutar las
   validaciones locales de abajo. Revisar especialmente `server.ts`, `demo-main.ts`
   y `start-demo.mjs`: conservar las rutas nuevas, seguridad y comprobacion de
   esquema antes de escuchar. No sustituir esos archivos por su version antigua.
2. Antes de publicar, registrar el commit actualmente desplegado y verificar una
   copia recuperable de Neon. Revisar `public.kysely_migration` mediante una consulta
   de solo lectura y comparar con `database/migrations/checksums.json` del artefacto.
   La demo original llegaba a 007; esta integracion incluye 008 (documentos),
   009 (impresion de reportes) y 010 (devoluciones de ruta y backfill de conciliaciones).
   El estado real de Neon debe comprobarse, no inferirse de la rama.
3. Reservar una ventana sin escrituras. Las migraciones pendientes se ejecutan
   automaticamente **al arrancar**, antes de aceptar trafico. El codigo nuevo exige
   el historial de migraciones completo. No ejecutar `down`, borrar tablas, usar
   `pnpm db:seed`, ni eliminar `demo_initialization`.
4. En Render > servicio existente > Settings, confirmar la rama `demo/render-neon`,
   el build `corepack pnpm install --frozen-lockfile --prod=false && corepack pnpm build`,
   el start `corepack pnpm demo:start` y el health check `/api/v1/health`.
   Mantener las variables existentes y agregar el `TRUST_PROXY` verificado. Conservar
   `SESSION_SECRET` y `DEMO_PASSWORD`; cambiar esta ultima variable no restablece
   contraseñas existentes. Para un dominio propio, usar `APP_ORIGIN` igual al origen
   HTTPS exacto, sin barra final; si no, se usa `RENDER_EXTERNAL_URL`.
5. Con autorizacion para publicar, subir la rama y usar Manual Deploy > Deploy latest
   commit. No asumir que subir cambios modifica la configuracion del servicio:
   comprobarla en Render. Las publicaciones automaticas siguen desactivadas.
6. Revisar que las migraciones y el inicio terminen sin errores. Comprobar health,
   acceso de ambos roles, rechazo de acceso administrativo del chofer, navegacion
   directa/recarga en `/inventory`, ventas y generacion/descarga de documentos.
   Comprobar que datos y contraseñas previos sigan presentes. Las pruebas locales
   no certifican el proxy real ni una impresora fisica.

Si falla, conservar registros sin secretos y revisar el estado de migraciones.
No volver ciegamente al binario anterior: 010 no admite rollback destructivo y
la compatibilidad del binario viejo con el esquema nuevo debe probarse. Preferir
una correccion hacia adelante; una restauracion necesita autorizacion y un destino
separado. Ver [procedimiento de recuperacion](operations/migrations.md).

La demo usa la conexion de propietario para migrar; no es una plantilla de
produccion con credenciales de migracion y runtime separadas. Usar solo datos ficticios.

## Recorrido sugerido

Entrar como `demo-admin`: revisar los dos almacenes, tres productos, sus existencias,
dos clientes y una camioneta. Crear una ruta asignada a `demo-driver`, cargar producto
y despacharla. Entrar como `demo-driver` para registrar una venta. Volver como
administrador para consultar existencias y reportes.

La demo es compartida: los visitantes que tengan la clave modifican la misma base.
Usar solo datos ficticios. Los reportes de ventas comienzan vacios hasta registrar
operaciones; no se representan ventas ficticias como historial real.

## Validacion local

Ejecutar desde la raiz:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm exec vitest run --config vitest.workspace.ts apps/api/tests/integration/demo-deployment.test.ts apps/api/tests/integration/database-readiness.test.ts
pnpm db:verify
```

La prueba `apps/api/tests/integration/demo-deployment.test.ts` utiliza PostgreSQL
descartable mediante Docker para comprobar la actualizacion desde 007, preservacion
de usuarios/contraseñas/existencias/movimientos, reinicializacion sin sobrescrituras,
SPA, autenticacion HTTPS, permisos y rechazo de proxies no confiables. Requiere
`pnpm build` primero. No utiliza Neon ni la base de desarrollo.

Para iniciar manualmente con una base **dedicada y vacia**, configurar las variables
de `render.yaml`, agregar `APP_ORIGIN` con el origen local elegido y ejecutar
`pnpm demo:start`. Para HTTP local, usar `NODE_ENV=development`; en Render se conserva
`NODE_ENV=production` para que las cookies requieran HTTPS.
