# CalcuFlow — Calculadora de USDT en Venezuela

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

## Probar localmente

```bash
# Emula las rutas y Functions de Vercel
npx.cmd --yes vercel@latest dev --listen 5500
```

Abre: <http://localhost:5500>

El calculador principal no necesita secretos. `python -m http.server 5500` o
`npx.cmd serve -p 5500 .` siguen siendo útiles para revisar la interfaz/offline,
pero no ejecutan las rutas bajo `/api/`.

---

## Desplegar en Vercel

La interfaz es estática y Vercel detecta automáticamente las Functions bajo
`api/`:

1. Conecta el repositorio
2. Vercel detecta automáticamente que es un sitio estático
3. El calculador funciona normalmente sin variables secretas

### Bot de Telegram opcional

El bot y su webhook requieren configurar en Vercel las variables que
correspondan al entorno:

- `TELEGRAM_BOT_TOKEN`: credencial privada del bot.
- `TELEGRAM_BOT_USERNAME`: `calcuflowbot`, usado para enlaces privados y comandos dirigidos. Los comandos dirigidos a otro bot se ignoran.
- `TELEGRAM_ALLOWED_CHAT_ID`: IDs adicionales de grupos autorizados, separados por comas. El grupo oficial `-1003824051698` siempre está autorizado; los chats privados también. Una variable vacía **no** abre el bot a otros grupos. Para operar exclusivamente en el grupo oficial, dejar únicamente ese ID o quitar la variable.
- `TELEGRAM_ALLOWED_THREAD_ID` y `TELEGRAM_ALLOWED_THREADS`: obsoletas e ignoradas. Quitarlas de Vercel para evitar confusión. No pueden reactivar el requisito del tema eliminado 555.
- `TELEGRAM_BOT_API_TEST_MODE`: omitir o desactivar en producción. El modo de prueba requiere un bot/token del entorno de prueba de Telegram.

El bot funciona en todo el grupo autorizado, sin temas o en General. Los temas
existentes mantienen su contexto; no se adjunta el tema eliminado 555 del grupo
oficial. Los mensajes/paneles que Telegram declara inexistentes se recuperan
con una respuesta sin referencia o un panel nuevo. Las referencias de monto
incluyen banco, panel y propietario: otra invocación puede continuar el cálculo
sin conservarlo en memoria de proceso. Las respuestas entre temas distintos o
de otro propietario se ignoran.

### Flujo público del grupo

- `/calc` o `/calcular`: banco → monto → resultado en el mismo panel propio.
- `/calc 500 bdv`: resultado público directo. En Privacy Mode también se puede usar `/calc@calcuflowbot 500 bdv`.
- `/tasas`: referencias públicas con fuente y fecha; `/ayuda` explica los comandos y las respuestas de monto.
- «Nuevo cálculo» es una entrada compartida que crea otro panel para quien la pulsa. Los controles para cambiar banco/monto pertenecen al iniciador; otros miembros reciben una indicación para abrir el suyo.
- Los textos ordinarios, palabras sueltas y números en el grupo se ignoran. Un monto sin comando solo se procesa como respuesta a una solicitud de este bot, con banco/panel/propietario válidos. En privado se mantiene la entrada directa y la navegación por botones.
- «Otro monto» usa ForceReply selectivo y explica que hay que responder a ese mensaje. Si la solicitud desapareció y no queda referencia, abrir `/calc` otra vez. Un update pendiente que conserva la referencia puede continuar; un panel eliminado se reemplaza.
- No se borran comandos, montos, solicitudes ni mensajes del usuario. El flujo principal no usa mensajes efímeros ni requiere permisos de administrador.
- El resultado incluye banco, monto, bolívares, BPay, USDT, ganancia, ROI y tasas con sus fuentes y fechas. El respaldo DolarAPI se identifica como tal. Stars permanece en privado, fuera de los botones principales del grupo.

[Ejemplos antes/después y comprobaciones de cliente pendientes](docs/telegram-public-flow.md).

### Entrega, reintentos y diagnóstico

Se valida tanto HTTP como `ok`, `error_code`, `description` y `retry_after` del
[Bot API](https://core.telegram.org/bots/api#making-requests). Una edición sin
cambios es un éxito sin operación. Solo los errores de formato activan el
respaldo de texto plano. Los callbacks se contestan antes de consultar tasas;
el fallo de esa respuesta no invalida una entrega. No se realizan borrados.

Cada operación permite como máximo tres intentos dentro de su mismo plazo.
Se espera `retry_after` solo si cabe en el plazo y es de hasta un segundo.
Ediciones y respuestas de callback pueden repetir fallos transitorios; envíos
de mensajes y facturas no se repiten después de 5xx, fallo de red o timeout,
porque podrían haber sido entregados. Las operaciones Telegram normales tienen
un plazo de cuatro segundos y los callbacks de un segundo. Los proveedores de
tasas mantienen su plazo de siete segundos por consulta, reducido únicamente si
queda menos tiempo de invocación. El presupuesto total de operaciones es de
25 segundos: verificar en Vercel que `/api/telegram` disponga de al menos
30 segundos de duración máxima. No se agregó configuración ni dependencia nueva.

| Resultado del webhook | HTTP | Entrega / acción |
|---|---|---|
| Estado normal `*_sent` | 200 | Operación requerida confirmada |
| `delivery_failed`, `ok:false` | 200 | Rechazo definitivo; revisar categoría y permisos/configuración |
| `delivery_unknown`, `ok:false` | 200 | Resultado ambiguo; no provocar otro envío automático |
| `partial_delivery`, `ok:false` | 200 | Alguna operación requerida se completó; no repetir toda la interacción |
| `delivery_failed`, `retry:true` | 503 | Solo 429 explícito, sin operación requerida previa; permite reentrega de Telegram |

HTTP 200 significa reconocimiento del update, no garantiza entrega. Una consulta
de tasas fallida puede devolver un error visible al usuario y un estado
`rates_unavailable` o `calc_failed`. No se calcula con valores inventados.
Los logs registran operación, resultado, duración, categoría y códigos de error;
no registran tokens, nombres, textos, descripciones completas ni montos.

No hay deduplicación distribuida: ni un `Map` ni el contexto temporal de una
invocación garantizan procesamiento único entre instancias. Los updates repetidos
por Telegram, clics repetidos, mensajes editados o una interrupción después de
enviar pero antes de reconocer pueden duplicar respuestas. Los reconocimientos
conservadores reducen ese riesgo a cambio de no recuperar automáticamente un
envío ambiguo. No se agregó base de datos.

### Verificación del bot

CI usa Node 20 y `node --test tests/*.test.mjs`; no hay instalación ni build.
Para la suite Telegram: `node --test tests/telegram*.test.mjs`. Incluye simulaciones
de permisos, formato, mensajes/temas inexistentes, 429, 5xx, red, timeouts,
entregas parciales y flujo de montos entre handlers nuevos.

Los defectos confirmados en el código anterior eran el requisito/fallback del
tema 555, comandos destinados a otros bots aceptados, errores ocultos por
helpers y respaldo de formato ante cualquier 400. No prueban la causa de todos
los reportes. Permanecen por verificar con evidencia de producción: permisos,
privacidad del bot, webhook pendiente/protegido, 429, fallos de red y proveedores.

Después de un despliegue autorizado, revisar `getWebhookInfo` (pendientes y último
error), logs sanitizados de Vercel, membresía/permisos del bot y duración máxima.
Probar privado, grupo sin temas/General, comandos `@calcuflowbot`, montos
100/500/1000, monto personalizado y callback antiguo; comprobar que otro grupo
y comandos `@otro_bot` no ejecuten funciones. La privacidad de BotFather puede
impedir recibir textos ordinarios del grupo: el flujo usa comandos explícitos,
callbacks y ForceReply y no requiere desactivarla. Revisar las fuentes y fallbacks de
tasas sin reemplazar proveedores. Estas comprobaciones requieren acceso real;
las simulaciones locales no acreditan disponibilidad en producción.

`scripts/setup-telegram-webhook.ps1` ya apunta a `calcuflow.live`, valida `getMe`
y salud sin redirecciones antes de `setWebhook`, y conserva updates pendientes.
Es una herramienta que cambia el webhook: no ejecutarla para pruebas locales ni
redirigir el bot de producción a Preview. El script de configuración y CI no se
modificaron para esta corrección.

Para diagnóstico sin mutaciones, usar `scripts/diagnose-telegram.ps1`; sin token
solo comprueba la salud pública. Con token de entorno o `-PromptForToken`, consulta
identidad, webhook y membresía/permisos propios, con salida sanitizada. No consulta
updates ni envía mensajes. [QA, despliegue, validación de dos usuarios y rollback](docs/telegram-release.md)
y [descripción del PR](docs/telegram-pr-description.md) separan pruebas simuladas
de las comprobaciones reales pendientes.

No son necesarias para usar el calculador principal. El webhook de producción
es <https://calcuflow.live/api/telegram>. No publiques valores reales en
el repositorio.

Producción: https://calcuflow.live

Dominios anteriores (redireccionan a producción): https://calcu-flow.vercel.app y https://calculadora-banco-usdt.vercel.app

---

## Estructura

```
calculadora-usdt/
├── api/
│   ├── config.mjs             # Configuración segura del bot
│   ├── rate-providers.mjs     # Proveedores, validación y mediana P2P
│   ├── rates.mjs              # Vercel Function same-origin
│   ├── telegram-app-handler.mjs
│   ├── telegram-formatter.mjs
│   ├── telegram-ui.mjs
│   └── telegram.mjs           # Webhook opcional de Telegram
├── assets/
│   └── icon.svg
├── css/
│   └── style.css
├── js/
│   ├── api.js          # Cliente validado de /api/rates
│   ├── bcv-rates.js    # Selección y fallbacks de BCV Today
│   ├── app.js          # Lógica principal
│   ├── calculator.js   # Fórmulas financieras
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
