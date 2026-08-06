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

## Probar localmente

```bash
# Emula las rutas y Functions de Vercel
npx.cmd --yes vercel@latest dev --listen 5500
```

Abre: <http://localhost:5500>

No se necesita ninguna variable de entorno. `python -m http.server 5500` o
`npx.cmd serve -p 5500 .` siguen siendo útiles para revisar la interfaz/offline,
pero no ejecutan `/api/rates`.

---

## Desplegar en Vercel

La interfaz es estática y Vercel detecta automáticamente la Function bajo
`api/`; no requiere configuración adicional:

1. Conecta el repositorio
2. Vercel detecta automáticamente que es un sitio estático
3. No agregar variables de entorno (no se necesitan)

Producción: https://calcu-flow.vercel.app

---

## Estructura

```
calculadora-usdt/
├── api/
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
- [ ] Chips rápidos: 100 / 500 / 1000
- [ ] Cálculos actualizan al cambiar el monto
- [ ] Un fallo parcial conserva solo la tasa que no pudo actualizarse
- [ ] `/api/` no aparece en el caché estático del service worker
