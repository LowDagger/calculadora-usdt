# CalcuFlow — Banco → USDT

PWA estática para calcular compra de USD en banco venezolano, comisiones y retorno estimado vendiendo USDT en el mercado paralelo.

## Fuente de tasas

Las tasas se obtienen del endpoint público de **TasaVE** — sin API key, sin autenticación:

```
GET https://tasave.sudelca.com/v1/rates
```

Campos usados:

| Campo | Uso |
|---|---|
| `bcv_usd` | Tasa BCV (oficial) |
| `parallel_usdt` | Tasa paralela / P2P (mid USDT) |
| `parallel_buy` / `parallel_sell` | Respaldo si `parallel_usdt` no está presente |

Si TasaVE no está disponible, el app conserva las tasas guardadas en localStorage.

---

## Probar localmente

```bash
# Con Python
python -m http.server 5500

# O con npx serve (Windows sin Python)
cmd /c "npx --yes serve -p 5500 ."
```

Abre: <http://localhost:5500>

No se necesita ninguna variable de entorno. No hay funciones serverless.

---

## Desplegar en Vercel

El proyecto es 100% estático. No requiere configuración especial en Vercel:

1. Conecta el repositorio
2. Vercel detecta automáticamente que es un sitio estático
3. No agregar variables de entorno (no se necesitan)

Producción: https://calcu-flow.vercel.app

---

## Estructura

```
calculadora-usdt/
├── assets/
│   └── icon.svg
├── css/
│   └── style.css
├── js/
│   ├── api.js          # fetchRates() → TasaVE público
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
- [ ] Tasas cargan automáticamente desde TasaVE
- [ ] Estado muestra "Tasas actualizadas desde TasaVE."
- [ ] BCV mostrado coincide con `bcv_usd` de la respuesta
- [ ] P2P mostrado coincide con `parallel_usdt`
- [ ] Chips rápidos: 100 / 500 / 1000
- [ ] Cálculos actualizan al cambiar el monto
- [ ] Sin referencias a DolarApi en código fuente ni en consola
