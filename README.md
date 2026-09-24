# Mis Gastos

PWA móvil para registrar gastos en pesos y dólares, manualmente o mediante voz. No requiere instalar dependencias ni configurar una base de datos: los datos de prueba quedan guardados localmente en el navegador.

## Verla funcionando en la computadora

### Requisitos

- Python 3.
- Un navegador moderno. Chrome o Safari permiten probar más funciones de voz y PWA.

### Inicio rápido

Desde la raíz del proyecto ejecutá:

```bash
npm start
```

Después abrí esta dirección en el navegador:

**<http://localhost:4173>**

No hay que ejecutar `npm install`: la aplicación no tiene dependencias externas. Para detener el servidor presioná `Ctrl+C` en la terminal.

> Es importante abrirla mediante `http://localhost:4173` y no haciendo doble clic sobre `index.html`. El servidor es necesario para que funcionen correctamente los módulos JavaScript, el service worker y la instalación como PWA.

## Recorrido de prueba sugerido

1. Abrí **Tarjetas** y seleccioná **Agregar**.
2. Creá una tarjeta con un alias inventado para la prueba, por ejemplo `Mi tarjeta`, y configurá sus días de cierre y vencimiento.
3. Volvé a **Inicio** y tocá **Agregar manual** para cargar un gasto en pesos o dólares.
4. Elegí crédito, seleccioná la tarjeta creada y cargá `12` cuotas. La aplicación distribuirá el importe entre los meses correspondientes.
5. Tocá el botón amarillo del micrófono y decí solamente un gasto, por ejemplo: `Pagué 2500 pesos en efectivo en supermercado`. La escucha se corta automáticamente cuando termina la frase.
6. Confirmá cada tarjeta detectada con la tilde verde. También podés corregirla o deslizarla hacia arriba para descartarla; el aviso inferior permite deshacer.
7. Entrá en **Informes** para revisar los totales separados en ARS y USD por mes, año o rango personalizado.

Si el navegador no ofrece reconocimiento de voz, la aplicación muestra un campo de texto de respaldo. Escribí allí la misma frase para probar el intérprete sin micrófono.

## Probarla desde un teléfono en la misma red

1. Con la computadora y el teléfono conectados a la misma red Wi-Fi, iniciá el servidor con `npm start`.
2. Obtené la IP local de la computadora:

   ```bash
   hostname -I
   ```

3. En el teléfono abrí `http://IP_DE_TU_COMPUTADORA:4173`; por ejemplo, `http://192.168.1.25:4173`.

La interfaz y la carga manual se pueden revisar así. Sin embargo, los navegadores normalmente exigen un contexto seguro HTTPS para habilitar micrófono, service workers, instalación PWA y biometría. `localhost` es una excepción únicamente en el mismo dispositivo.

## Instalarla en un iPhone

Para probar todas las capacidades en un iPhone, publicá estos archivos estáticos en cualquier hosting con HTTPS. No hace falta un proceso de compilación: se publica el contenido completo del repositorio.

Una vez disponible mediante una URL `https://`:

1. Abrí la URL en **Safari**.
2. Tocá **Compartir**.
3. Elegí **Agregar a inicio**.
4. Confirmá con **Agregar**.
5. Abrí **Mis Gastos** desde el icono nuevo y aceptá el permiso de micrófono cuando Safari lo solicite.

Los datos permanecen en el navegador del dispositivo y no se sincronizan con otros equipos en esta primera versión. Para empezar de cero, eliminá los datos del sitio desde la configuración de Safari o las herramientas del navegador.

## Ejecutar las pruebas automáticas

```bash
npm test
```

Las pruebas validan el reconocimiento de moneda, medio de pago, tarjetas configuradas, cuotas y múltiples gastos en una frase.

## Solución de problemas

- **La página no abre:** comprobá que la terminal muestre `Serving HTTP on 0.0.0.0 port 4173` y que ningún otro programa esté usando ese puerto.
- **El teléfono no conecta:** revisá que ambos dispositivos estén en la misma Wi-Fi y que el firewall permita conexiones al puerto 4173.
- **El micrófono no aparece o no responde:** usá Chrome/Safari y una URL HTTPS. Mientras tanto, usá el ingreso de texto de respaldo del botón de micrófono.
- **No veo cambios recientes:** recargá la página; si la versión anterior quedó en caché, eliminá los datos del sitio y volvé a abrirla.
