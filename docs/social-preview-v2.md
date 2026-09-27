# Especificación del próximo preview social de CalcuFlow

Esta especificación describe el reemplazo futuro de la imagen social actualmente
publicada. No debe activarse en la metadata de producción hasta que el archivo
final exista y haya sido validado.

## Entregable recomendado

- **Nombre futuro:** `social-preview-v2.png`
- **Tamaño exacto:** `1200 × 630 px`
- **Formato:** PNG optimizado para web
- **Uso previsto:** Open Graph, Twitter Cards y previews de Telegram y WhatsApp

## Composición

- Mantener la identidad visual actual de **CalcuFlow**, con fondo oscuro, detalles
  verdes y el tratamiento limpio de la interfaz vigente.
- Usar una jerarquía visual concisa y poco texto, legible incluso cuando Telegram
  o WhatsApp rendericen la imagen como una miniatura pequeña.
- Colocar el icono y branding de CalcuFlow en el lado izquierdo.
- Colocar una representación fiel de la interfaz actual de la calculadora en el
  lado derecho. No reutilizar capturas ni componentes de diseños anteriores.
- Reservar márgenes seguros amplios en los cuatro bordes para que ningún texto,
  icono o dato esencial se pierda por recortes automáticos.

## Copy exacto

- **Titular principal:** “Calcula tu compra de USDT”
- **Línea secundaria:** “BCV · Bancos · Binance P2P”
- **Dominio visible:** “calcuflow.live”

## Restricciones

- No incluir referencias a **TasaVE**.
- No usar el branding “Banco → USDT”.
- No mostrar una interfaz desactualizada.
- Evitar bloques largos de texto, listas extensas, valores demasiado pequeños o
  elementos decorativos que compitan con el titular.

## Activación futura

La imagen activa continúa siendo `/preview.png`. Cuando
`/social-preview-v2.png` exista en producción y se haya comprobado su tamaño,
legibilidad y respuesta HTTP, actualizar únicamente estas etiquetas de
`index.html`:

```html
<meta property="og:image" content="https://calcuflow.live/social-preview-v2.png" />
<meta property="twitter:image" content="https://calcuflow.live/social-preview-v2.png" />
```

Las etiquetas `og:image:width` y `og:image:height` deben mantenerse en `1200` y
`630`, respectivamente.
