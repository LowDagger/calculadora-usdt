# CalcuFlow — Banco → USDT

PWA estática para calcular compra de USD en banco venezolano, comisiones y retorno estimado vendiendo USDT en el mercado paralelo.

## Fuente de tasas

Las tasas se obtienen del endpoint combinado público de **DolarAPI Venezuela** — sin API key ni autenticación:

```
GET https://ve.dolarapi.com/v1/dolares
```

La aplicación busca por `fuente` (sin depender del orden del arreglo) y exige
entradas en USD completas antes de reemplazar las tasas mostradas:

| Entrada / campo | Uso |
|---|---|
| `fuente: "oficial"` → `promedio` | Tasa BCV |
| `fuente: "paralelo"` → `promedio` | Tasa P2P / paralelo (referencia paralela; fuente documentada por DolarAPI: Yadio) |
| Oficial → `fechaActualizacion` | Fecha efectiva mostrada como “Vigente…” |
| Paralelo → `fechaActualizacion` | Frescura mostrada como “Actualizado hace…” |

Si DolarAPI falla, tarda demasiado o devuelve datos incompletos/no válidos, la
actualización se descarta por completo. La app conserva las tasas manuales o las
guardadas en `localStorage`, sin alterar su marca de tiempo visible.

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
│   ├── api.js          # fetchRates() → DolarAPI Venezuela
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
- [ ] Tasas cargan automáticamente desde DolarAPI
- [ ] Estado muestra "Tasas actualizadas desde DolarAPI."
- [ ] BCV coincide con `promedio` de la entrada USD `oficial`
- [ ] P2P coincide con `promedio` de la entrada USD `paralelo`
- [ ] Chips rápidos: 100 / 500 / 1000
- [ ] Cálculos actualizan al cambiar el monto
- [ ] Sin referencias al proveedor anterior en código fuente ni en consola
