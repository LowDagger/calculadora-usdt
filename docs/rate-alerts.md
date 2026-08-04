# Alertas de tasas con Web Push

## Arquitectura

La interfaz estática crea una credencial anónima por dispositivo y una suscripción Web Push. Las funciones de Vercel autorizan cada operación con el UUID y el secreto aleatorio; Supabase solo conserva el SHA-256 del secreto. Supabase/Postgres almacena dispositivos, suscripciones y hasta cinco alertas activas por dispositivo. Un cron autenticado consulta DolarAPI una sola vez, usando exactamente las entradas USD `oficial` y `paralelo` y sus valores `promedio`, evalúa todas las alertas y entrega Web Push con `web-push`.

No se almacenan nombres, correos, wallets ni datos de operaciones. El service role y la clave VAPID privada existen únicamente en Vercel.

## Supabase y migración

1. Cree un proyecto de Supabase.
2. Ejecute `supabase/migrations/202608040001_rate_alerts.sql` en SQL Editor o con `supabase db push`.
3. Confirme que RLS está activo y que `anon`/`authenticated` no tienen privilegios. Solo las funciones de Vercel usan el service role.

La migración es repetible: crea las tres tablas, restricciones, índices, RLS y un trigger transaccional que impide superar cinco alertas activas por dispositivo.

## VAPID y variables

Genere las claves una vez y guárdelas en un gestor de secretos:

```sh
npx web-push generate-vapid-keys
```

Copie `.env.example` a `.env.local` solo para desarrollo. Configure en Vercel:

- `VAPID_PUBLIC_KEY`: clave pública que `/api/config` entrega al navegador.
- `VAPID_PRIVATE_KEY`: secreto de firma, solo servidor.
- `VAPID_SUBJECT`: URL HTTPS o `mailto:` de contacto.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: acceso servidor a Supabase.
- `CRON_SECRET`: valor aleatorio largo para el endpoint programado.
- `ALLOWED_ORIGIN`: origen exacto de producción, sin `*` (por ejemplo `https://calculadora-banco-usdt.vercel.app`).

## Cron de Supabase

Con Vault, `pg_cron` y `pg_net` habilitados, programe una llamada cada cinco minutos. Sustituya los valores y mantenga el secreto en Vault, no en SQL versionado:

```sql
select cron.schedule('check-rate-alerts', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://calculadora-banco-usdt.vercel.app/api/cron/check-rate-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type', 'application/json'
    ), body := '{}'::jsonb
  );
$$);
```

El endpoint acepta GET o POST, valida el secreto en tiempo constante, rechaza tasas inválidas/no frescas y consulta el proveedor solo una vez por ejecución. No incluya el secreto en la URL si puede usar el encabezado.

## Desarrollo y pruebas

```sh
npm install
npm test
npx vercel dev
```

Web Push requiere un contexto seguro; `localhost` es aceptado por los navegadores. Para probar: abra la campana, pulse **Activar notificaciones**, acepte el permiso y luego **Enviar notificación de prueba**. Pruebe además una alerta de cada dirección/medición, una recurrente, una única y la aplicación cerrada.

## Despliegue

1. Aplique primero la migración.
2. Configure las siete variables para Preview y Production en Vercel (orígenes apropiados por entorno).
3. Instale dependencias y despliegue la rama; valide `/api/config` sin publicar datos privados.
4. Pruebe una suscripción y una notificación de prueba.
5. Active el cron y revise respuestas `200`, sin registrar endpoints ni secretos.

## Rollback

Desactive primero el job con `cron.unschedule('check-rate-alerts')`. Revierta el despliegue de Vercel. Conserve las tablas durante el rollback para evitar pérdida de preferencias; tras confirmar que no se restaurará la función, elimínelas en orden `rate_alerts`, `push_subscriptions`, `devices`. Rote `CRON_SECRET` y las claves VAPID si pudieron quedar comprometidas. Cambiar VAPID invalida las suscripciones y obliga a suscribirse de nuevo.

## Compatibilidad y límites

Web Push depende del navegador, sistema operativo y políticas de ahorro de batería. Chrome/Edge de escritorio y Android modernos suelen admitirlo. En iPhone/iPad se requiere iOS/iPadOS 16.4 o posterior y abrir CalcuFlow como aplicación instalada desde Safari mediante **Compartir → Añadir a pantalla de inicio**. Ventanas privadas, permisos denegados, suspensión del sistema o restricciones corporativas pueden impedir la entrega. La entrega es eventual y no está garantizada por el servicio Push.

Las alertas recurrentes reinician su referencia tras una entrega correcta y tienen 15 minutos de enfriamiento. Una actualización de proveedor ya observada no vuelve a disparar la alerta. Las suscripciones con respuestas permanentes 404/410 se eliminan.
