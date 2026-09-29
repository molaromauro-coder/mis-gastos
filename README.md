# Mis Gastos

PWA móvil para registrar y analizar gastos personales en pesos argentinos y dólares. Incluye carga manual, carga por voz en español argentino, tarjetas de débito y crédito, cuotas, informes, presupuesto, ahorro, stock, recuperos, papelera, exportación y un módulo privado de reventa de entradas.

Los datos se guardan localmente en el navegador del dispositivo. La sincronización automática entre iPhone y computadora todavía no forma parte de esta versión.

## Probarla en computadora

Desde la raíz del proyecto:

```bash
npm start
```

Abrí **http://localhost:4173**. No hace falta ejecutar `npm install`: la aplicación no tiene dependencias externas.

## Recorrido de prueba recomendado

1. Entrá en **Tarjetas** y cargá tus tarjetas de débito y crédito. Para las de crédito indicá día de cierre y día de vencimiento.
2. En **Inicio**, usá **Carga manual** y verificá Efectivo, Débito y Crédito. Al elegir Débito o Crédito aparecen solamente las tarjetas de ese tipo.
3. Para Crédito, elegí la cantidad de cuotas. La primera cuota se calcula a partir del cierre de la tarjeta y luego se distribuye por vencimiento mensual.
4. Probá la voz manteniendo presionado el micrófono, hablando y soltándolo al terminar. Ejemplos:
   - `Gasté cincuenta mil pesos en el kiosco`.
   - `Gasté diez mil en kiosco y veinte mil en supermercado`.
   - `Gasté un millón en una heladera con crédito Mi Visa en doce cuotas`.
5. Antes de guardar un gasto reconocido por voz, revisá importe, medio de pago, tarjeta, cantidad de cuotas, valor de cada cuota y fecha de la primera cuota.
6. Entrá en **Informes** y verificá total ARS, total USD, equivalente, comparación con período anterior, gráfico por categoría, categorías, medios de pago y mayores gastos.
7. Probá **Presupuesto**, **Ahorro**, **Stock**, **Gastos recuperados**, **Papelera** y **Consultas**.
8. En **Reventa de entradas**, comprobá Balance general, reparto Mauro/vendedor, fiestas plegadas por nombre, detalle individual y nuevas fiestas.

## iPhone / PWA

La aplicación debe servirse mediante HTTPS para usar correctamente instalación PWA, micrófono y biometría.

1. Abrí la URL publicada en **Safari**.
2. Tocá **Compartir**.
3. Elegí **Agregar a pantalla de inicio**.
4. Abrí Mis Gastos desde el nuevo icono.

La pantalla de Inicio está diseñada para entrar completa en el viewport del iPhone sin necesidad de reducir el zoom. Las demás secciones tienen desplazamiento vertical cuando el contenido supera la pantalla.

## Persistencia

Cada modificación relevante se guarda inmediatamente en `localStorage`, y se vuelve a persistir al ocultar o cerrar la aplicación. Una actualización del código no cambia la clave de almacenamiento, por lo que no debería borrar los datos del mismo origen/navegador.

Importante: Safari y una PWA instalada pueden comportarse como contextos de almacenamiento distintos según la versión/configuración de iOS. Para datos reales conviene elegir el acceso que se va a usar habitualmente y continuar allí hasta incorporar sincronización en la nube.

## Exportación

En **Consultas**:
- **Exportar para Excel (CSV)** genera un CSV UTF-8 compatible con Excel.
- **Guardar / imprimir PDF** abre la vista de impresión del navegador para guardarla como PDF.

En **Reventa** se puede exportar el detalle en CSV.

## Versión compartida

Con `?shared=1`, Reventa no aparece y su módulo no se descarga ni se ejecuta. La versión personal mantiene Reventa disponible.

## Pruebas automáticas

```bash
npm test
```

Las pruebas cubren números e importes en español, múltiples gastos en una frase, tarjetas y cuotas, cálculo de cierre/vencimiento, presupuesto, stock, recuperos, informes y matemática de Reventa.

## Solución de problemas

- Si el micrófono no responde, comprobá permiso de micrófono y que la URL use HTTPS.
- Si ves una versión anterior, recargá Safari; el service worker utiliza una caché versionada y elimina las versiones previas.
- Si no aparece una tarjeta al cargar un gasto, verificá que esté configurada con el mismo tipo de medio de pago: Débito o Crédito.
