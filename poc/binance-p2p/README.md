# Binance P2P rates proof of concept

PoC local y aislado para consultar anuncios públicos de Binance P2P y calcular
estadísticas de la muestra devuelta. No modifica la fuente de tasas, las
fórmulas ni la interfaz de producción de CalcuFlow.

Binance es la primera fuente porque el endpoint no exige API key ni servicio
pagado. El endpoint es público, pero no forma parte de una API con estabilidad
formal documentada; su esquema, disponibilidad o controles pueden cambiar sin
aviso. Este código debe ejecutarse en Node (servidor/local), no desde el
navegador.

## Requisitos y ejecución

- Node.js 20 o posterior con `fetch` nativo (validado localmente con Node 22).
- Sin instalación y sin variables de entorno.

PowerShell 7 / Windows 11:

```powershell
node .\poc\binance-p2p\scripts\test-binance-p2p.mjs --fiat VES --asset USDT --direction user-buys-usdt --rows 10
node .\poc\binance-p2p\scripts\test-binance-p2p.mjs --fiat VES --asset USDT --direction user-sells-usdt --rows 10
node --test .\poc\binance-p2p\tests\*.test.mjs
```

Bash/zsh:

```bash
node poc/binance-p2p/scripts/test-binance-p2p.mjs --fiat VES --asset USDT --direction user-buys-usdt --rows 10
node poc/binance-p2p/scripts/test-binance-p2p.mjs --fiat VES --asset USDT --direction user-sells-usdt --rows 10
node --test 'poc/binance-p2p/tests/*.test.mjs'
```

## Semántica de dirección

El argumento del CLI evita el ambiguo `BUY`/`SELL`:

| Intención | `tradeType` enviado | Anunciante |
|---|---:|---|
| `user-buys-usdt` | `BUY` | vende USDT; el usuario paga fiat |
| `user-sells-usdt` | `SELL` | compra USDT; el usuario recibe fiat |

Esta interpretación coincide con las pestañas Buy/Sell de Binance P2P y debe
revalidarse mediante el smoke test si Binance cambia el endpoint. Para quien
compra USDT, el precio menor es más favorable; para quien vende USDT, el mayor
es más favorable.

## Estadísticas y filtros

`rateStatistics.mjs` es independiente de Binance. Calcula mejor precio válido,
medianas top 3/top 5/global, medias top 3/top 5, mínimo, máximo, conteo y fecha.
Son estadísticas de los anuncios devueltos, no una cotización universal ni una
garantía de ejecución. La mediana ordena numéricamente y promedia los dos
valores centrales cuando la muestra es par.

Filtros opcionales del CLI:

- `--amount 100`: pide anuncios compatibles y vuelve a comprobar límites.
- `--payment-method NAME`: exige al menos ese método; puede repetirse.
- `--min-completion-rate 0.95`: usa `monthFinishRate` cuando está presente.
- `--min-completed-orders 100`: usa `monthOrderCount` cuando está presente.
- `--merchant-only`: conserva tipos identificados explícitamente como merchant/professional.

Los campos ausentes no se interpretan como calidad. Cuantos más filtros se
apliquen, más probable es obtener una muestra pequeña o vacía.

## Fiabilidad, errores y caché

El proveedor valida códigos, páginas, filas (máximo 20), métodos, dirección y
montos antes de llamar a Binance. Usa timeout de 8 segundos, hasta dos reintentos
para timeout/red/429/5xx, backoff exponencial con jitter y respeta `Retry-After`.
No reintenta 403, otros 4xx, JSON malformado ni esquemas inesperados. Los errores
incluyen `code`, `message`, `retryable`, `status` y `retryAfterMs`.

Una caché en memoria de 15 segundos reduce consultas idénticas. Nunca se usa una
entrada expirada ni se devuelve una tasa fabricada como si fuera actual. La
caché desaparece al terminar el proceso y sus valores son configurables al
crear el proveedor.

## Extensión y límites

`providers/binanceP2PProvider.mjs` traduce la respuesta cruda al objeto
normalizado; `services/rateStatistics.mjs` solo consume esos objetos. Otro
proveedor gratuito puede implementar la misma salida sin cambiar las
estadísticas. No hay implementaciones falsas para `usdt.com.ve`, Cotizave o P2P
Army.

Limitaciones actuales: endpoint no documentado formalmente, sin SLA; posibles
bloqueos geográficos/403/429; campos del anunciante pueden faltar o cambiar; la
caché no es compartida; y este PoC no es un backend desplegado ni está conectado
a la PWA.
