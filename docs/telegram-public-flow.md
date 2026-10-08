> Historical previous release. Current single-chat implementation, configuration and pending live acceptance: [telegram-single-chat.md](telegram-single-chat.md). The current webhook requires Redis REST and a webhook secret; old deduplication/failure statements below describe the prior release.

# Flujo público de Telegram: revisión de mensajes

Ejemplos reproducibles de presentación, no tasas observadas en producción.
Se usó el mismo motor compartido, Banco de Venezuela, entrada 500 USD,
BCV 68,50 Bs/USD, P2P 75,20 Bs/USDT y margen bancario 0,5%.
Las comisiones y todos los valores proceden del motor actual. «Antes» corresponde
al formateador de origin/main usado al iniciar esta rama; «Después» al nuevo flujo.
Las fechas son datos de prueba fijos y el usuario 101 es un identificador ficticio.

## Resultado antes

```text
📊 *CalcuFlow*

🏦 *Banco de Venezuela · 2,5%*
Compra: 500,00 USD

🇻🇪 *Bolívares necesarios*
34.421,25 Bs

💳 *Monto en BPay*
487,73 USD

🟢 *USDT finales*
467,73 USDT

💰 *Ganancia estimada*
+10,00 USD · +2,18%

📈 BCV: 68,50 Bs
🏦 Tasa banco (+0,5%): 68,84 Bs
🔄 P2P: 75,20 Bs

_Actualizado: 02/09/2026, 08:00 a. m._
```

## Resultado después

```text
*CalcuFlow*
*Banco de Venezuela* · comisión 2,5%
Compra: 500,00 USD

Bolívares necesarios: *34.421,25 Bs*
Monto en BPay: *487,73 USD*
USDT finales: *467,73 USDT*

Ganancia estimada: *+10,00 USD*
ROI: *+2,18%*

BCV: 68,50 Bs/USD
BCV Today · vigencia 2026-09-02 · publicada 2026-09-02T03:00:00.000Z
Tasa banco (+0,5%): 68,84 Bs/USD

P2P: 75,20 Bs/USDT
Binance P2P (SELL USDT/VES) · consulta 2026-09-02T12:00:00.000Z

Calculado: 02/09/2026, 08:00 a. m.
```

Botones después: Cambiar monto · Nuevo cálculo · Abrir CalcuFlow · Bot en privado.
«Cambiar monto» pertenece al usuario 101; «Nuevo cálculo» sirve a cualquier miembro
y envía otro panel, sin editar este resultado. Las cifras son las mismas.

## Otro monto: antes y después

Antes:

```text
✏️ *Escribe el monto en USD*

Ejemplo: 375

Referencia: CF-MONTO:bdv:77:101
```

Después:

```text
*Escribe el monto en USD*
[Tu solicitud](tg://user?id=101)
Responde a este mensaje con 375,50 o 375.50.
Banco: Banco de Venezuela.

Referencia: CF-MONTO:bdv:77:101
```

El enlace «Tu solicitud» menciona al iniciador para
[ForceReply selectivo](https://core.telegram.org/bots/api#forcereply), mediante
la [mención por ID](https://core.telegram.org/bots/api#formatting-options).
Se valida la autoría del bot, el banco, el panel y el propietario de la referencia.
La coma y el punto son separadores decimales válidos. No se depende de memoria de
proceso entre mensajes. Si desapareció el panel, se envía uno nuevo; si ya no se
puede responder a la solicitud, el usuario abre /calc otra vez.

## Ayuda después

```text
*CalcuFlow — Banco → USDT*

• `/calc` o `/calcular`: elige banco y monto.
• `/calc 500 bdv`: cálculo completo en un mensaje.
• `/tasas`: tasas de referencia, fuentes y fechas.

En el grupo puedes usar `/calc@calcuflowbot 500 bdv` o `/calcular@calcuflowbot`, y `/tasas@calcuflowbot`.

Para «Otro monto», responde a la solicitud del bot con `375,50` o `375.50`. Los números sueltos en el grupo se ignoran. Si ya no ves la solicitud, abre `/calc@calcuflowbot` otra vez.

Solo quien inicia un cálculo puede cambiarlo. «Nuevo cálculo» abre un panel propio sin reemplazar resultados anteriores.

En privado también puedes enviar `500 bdv`. Usa /privado para abrir el bot; /apoyar mantiene el apoyo por Stars en privado.
```

Antes se recomendaba enviar números sueltos en el grupo y se describían las tasas
como «en tiempo real» sin fuente. Ahora esos números se ignoran; los resultados
identifican BCV Today, Binance P2P SELL o DolarAPI (respaldo) según el registro real.
No se cambia la selección de proveedores ni se añaden consultas por presentación.

## Comprobaciones Telegram pendientes

Las pruebas locales simulan dos usuarios intercalados, callbacks antiguos,
propietario incorrecto, respuestas a otro bot, paneles/referencias eliminados,
General y chats privados. La suite de fiabilidad sigue cubriendo 429, errores,
timeouts y entregas ambiguas/parciales. No sustituyen una prueba del cliente real.

Después de un despliegue autorizado, comprobar en móvil:

- Bot como miembro sin permisos de administrador, Privacy Mode activo, en el grupo oficial sin temas y en General si queda modo foro.
- /calc@calcuflowbot 500 bdv, /calcular@calcuflowbot, /tasas@calcuflowbot y /ayuda@calcuflowbot.
- Dos miembros iniciando cálculos intercalados; «Nuevo cálculo» preserva el resultado previo y los botones de edición rechazan al otro usuario.
- Visibilidad pública de valores, fuentes, fechas y enlaces; formato y ancho de botones en Android/iOS.
- ForceReply y mención selectiva del iniciador; respuesta manual si sus ajustes de privacidad impiden mostrar la mención. El recordatorio de responder al mensaje sigue visible.
- Solicitud borrada, panel borrado y botones antiguos; ninguna acción borra mensajes del usuario.
- Entrada directa, navegación y Stars en privado; el grupo principal no muestra botones de pago.

No se ejecutó setWebhook, no se modificó configuración de producción y no se
utilizó una sesión real de Telegram para estas comprobaciones.
