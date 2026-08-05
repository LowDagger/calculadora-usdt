# CalcuFlow — Banco → USDT

PWA estática para calcular compra de USD en banco venezolano, comisiones y retorno estimado vendiendo USDT en el mercado paralelo.

## Fuente de tasas

La tasa BCV se selecciona desde el historial público de **BCV Today** y la tasa
P2P / paralelo se obtiene de **DolarAPI Venezuela**. Ninguna requiere API key:

```
GET https://bcv.today/api/v1/history.json
GET https://bcv.today/api/v1/rate.json
GET https://ve.dolarapi.com/v1/dolares
```

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
| `fuente: "paralelo"` → `promedio` | Tasa P2P / paralelo (referencia paralela; fuente documentada por DolarAPI: Yadio) |
| Paralelo → `fechaActualizacion` | Frescura mostrada como “Actualizado hace…” |

Para BCV, el orden de fallback es historial de BCV Today, `rate.json`, registro
BCV guardado y finalmente la entrada oficial de DolarAPI. Un fallback anterior
nunca reemplaza un registro guardado con una fecha efectiva posterior. Si la
tasa P2P falla, la actualización completa se descarta y se conservan los valores
mostrados, respetando el comportamiento atómico existente.

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
│   ├── api.js          # Orquestación atómica BCV + P2P
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
- [ ] P2P coincide con `promedio` de la entrada USD `paralelo`
- [ ] Chips rápidos: 100 / 500 / 1000
- [ ] Cálculos actualizan al cambiar el monto
- [ ] Sin referencias al proveedor anterior en código fuente ni en consola
