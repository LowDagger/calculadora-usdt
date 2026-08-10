# CalcuFlow — Banco → USDT

PWA estática para calcular compra de USD en banco venezolano, comisiones y retorno estimado vendiendo USDT en el mercado paralelo.

## Fuente de tasas

La tasa BCV se selecciona desde el historial público de **BCV Today**. La tasa
P2P usa la mediana de 20 anuncios **SELL USDT/VES** consultados en el servidor a
Binance P2P. Ninguna requiere API key:

```
GET https://bcv.today/api/v1/history.json
GET https://bcv.today/api/v1/rate.json
GET https://ve.dolarapi.com/v1/dolares
POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
```

El endpoint de anuncios de Binance no aparece como una interfaz soportada en su
documentación pública. Por eso el navegador nunca lo consulta directamente:
`/api/rates` lo aísla en una Vercel Function same-origin, con timeout,
validación estricta y caché CDN corta de 45 segundos (más 75 segundos de
revalidación). Las respuestas parciales o con fallback no se almacenan en CDN.

BCV Today permite distinguir la fecha de publicación de la fecha efectiva. La
aplicación elige el mayor `effective_date` válido cuyo `updated_at` ya ocurrió,
aunque la vigencia sea el próximo día hábil. Los registros de fin de semana se
deduplican por `effective_date`. El registro seleccionado se conserva durante
cinco minutos para no descargar el historial en cada recarga móvil.

| Entrada / campo | Uso |
|---|---|
| BCV Today → `USD` | Tasa BCV con precisión completa |
| BCV Today → `effective_date` | Vigencia oficial mostrada en la tarjeta BCV |
| BCV Today → `updated_at` | Momento de publicación del registro |
| Binance `tradeType: "SELL"` | Anuncios para una persona que vende USDT y recibe VES |
| Binance `adv.price` | Mediana de hasta 20 precios válidos, con mínimo de 5 |
| `fuente: "paralelo"` → `promedio` | Respaldo explícito; nunca se rotula como Binance P2P |

Para BCV, el orden es historial de BCV Today, `rate.json`, DolarAPI oficial,
registro BCV guardado y valor manual. Para P2P, el orden es Binance, DolarAPI
paralelo identificado como respaldo, registro P2P guardado y valor manual. Los
dos proveedores se resuelven de forma independiente: el éxito de uno se aplica
aunque el otro falle, y cada registro conserva su propia fecha y fuente.

---

## Notificaciones Web Push (Fase 1)

Esta fase implementa únicamente el alta y la baja anónimas de Web Push. No crea
alertas por tasa, umbrales, horarios ni resúmenes. El navegador nunca solicita
permiso al cargar la página: la solicitud comienza únicamente cuando la persona
pulsa **Activar notificaciones** en Configuración.

Flujo:

1. La interfaz detecta `ServiceWorker`, `PushManager` y `Notification`.
2. Después de la acción explícita, `GET /api/push/config` entrega solo la clave
   VAPID pública.
3. El navegador crea una suscripción con `userVisibleOnly: true`.
4. `POST /api/push/subscribe` valida y guarda `endpoint`, `p256dh` y `auth` en
   Supabase mediante una Function same-origin.
5. `DELETE /api/push/unsubscribe` elimina el registro antes de desactivar la
   suscripción local.

Los endpoints y las claves de cifrado se consideran datos privados. No se
guardan nombres, correos, identidades, montos, cálculos, saldos ni tasas. La
clave `SUPABASE_SERVICE_ROLE_KEY` existe solo en las Functions; el frontend no
recibe credenciales de Supabase. La tabla tiene RLS activo y no concede acceso a
los roles `anon` o `authenticated`.

### Preparar Supabase y Vercel

1. Crea o selecciona un proyecto de Supabase.
2. Ejecuta
   `supabase/migrations/20260810000000_create_push_subscriptions.sql` en el SQL
   Editor. La migración crea `public.push_subscriptions`, el índice de registros
   activos, la restricción única de `endpoint` y las restricciones de formato.
3. Genera un par VAPID con una herramienta Web Push confiable y conserva la
   clave privada fuera del repositorio.
4. Configura en Vercel, como mínimo para esta fase:

   - `SUPABASE_URL`: URL HTTPS del proyecto.
   - `SUPABASE_SERVICE_ROLE_KEY`: credencial secreta disponible solo para las
     Functions.
   - `VAPID_PUBLIC_KEY`: clave pública VAPID P-256 en Base64URL.

5. Para pruebas locales con `vercel dev`, copia `.env.example` a `.env.local` y
   completa las tres variables anteriores. `.env.local` está ignorado por Git.

`VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` aparecen reservadas en `.env.example` para
la futura Function de envío. No se leen ni son necesarias en esta Fase 1.

Después de configurar el entorno, prueba manualmente activar y desactivar desde
un origen seguro (`https://` o `localhost`) y confirma que la fila se crea y se
elimina en Supabase. El envío real de una notificación requiere todavía un
emisor server-side de una fase posterior.

---

## Probar localmente

```bash
# Emula las rutas y Functions de Vercel
npx.cmd --yes vercel@latest dev --listen 5500
```

Abre: <http://localhost:5500>

Las tasas no necesitan variables de entorno. La suscripción Web Push sí necesita
las tres variables de Fase 1 descritas arriba. `python -m http.server 5500` o
`npx.cmd serve -p 5500 .` siguen siendo útiles para revisar la interfaz/offline,
pero no ejecutan `/api/rates` ni `/api/push/*`.

---

## Desplegar en Vercel

La interfaz es estática y Vercel detecta automáticamente las Functions bajo
`api/`:

1. Conecta el repositorio
2. Vercel detecta automáticamente que es un sitio estático
3. Agrega las tres variables de entorno requeridas para Web Push

Producción: https://calcu-flow.vercel.app

---

## Estructura

```
calculadora-usdt/
├── api/
│   ├── push/             # Configuración pública y persistencia Web Push
│   ├── rate-providers.mjs # Proveedores, validación y mediana P2P
│   └── rates.mjs          # Vercel Function same-origin
├── assets/
│   └── icon.svg
├── css/
│   └── style.css
├── js/
│   ├── api.js          # Cliente validado de /api/rates
│   ├── bcv-rates.js    # Selección y fallbacks de BCV Today
│   ├── app.js          # Lógica principal
│   ├── calculator.js   # Fórmulas financieras
│   ├── notifications.js # Capacidad y suscripción Web Push
│   ├── storage.js      # localStorage
│   ├── ui.js           # Renderizado DOM
│   └── utils.js        # Helpers (n, money, $)
├── index.html
├── manifest.json
└── service-worker.js
```

---

## Checklist de prueba manual

- [ ] App carga sin errores de consola
- [ ] BCV usa el último anuncio válido de `history.json`
- [ ] Una tasa anunciada para el próximo día hábil se aplica inmediatamente
- [ ] La tarjeta distingue “BCV vigente hoy” de “Tasa anunciada”
- [ ] P2P coincide con la mediana SELL de Binance o indica el respaldo usado
- [ ] Chips rápidos: 100 / 200 / 500 / 1000
- [ ] Cálculos actualizan al cambiar el monto
- [ ] Un fallo parcial conserva solo la tasa que no pudo actualizarse
- [ ] `/api/` no aparece en el caché estático del service worker
- [ ] Configuración muestra No compatibles / Desactivadas / Bloqueadas / Activadas
- [ ] La carga inicial no solicita permiso de notificaciones
- [ ] Activar crea una fila anónima en `push_subscriptions`
- [ ] Desactivar elimina la fila y la suscripción del navegador
- [ ] Un clic en una notificación abre o enfoca solo CalcuFlow
