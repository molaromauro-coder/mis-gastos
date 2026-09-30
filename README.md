# Mis Gastos

PWA móvil para registrar y analizar gastos personales en pesos argentinos y dólares. Incluye carga manual, carga por voz en español argentino, tarjetas de débito y crédito, cuotas, informes, presupuesto, ahorro, stock, recuperos, papelera, exportación y un módulo privado de reventa de entradas.

Los datos se guardan localmente en el navegador del dispositivo. La sincronización automática entre iPhone y computadora todavía no forma parte de esta versión.

## Probarla en computadora

Desde la raíz del proyecto:

```bash
npm start
```

Abrí **http://localhost:4173**. No hace falta ejecutar `npm install`: el uso básico no requiere dependencias locales. Para **importar Excel (.xlsx) en Reventa** hace falta conexión a Internet la primera vez, ya que el lector se descarga al utilizar la función.

## Recorrido de prueba recomendado

1. Entrá en **Tarjetas** y cargá tus tarjetas de débito y crédito. Para las de crédito indicá día de cierre y día de vencimiento.
2. En **Inicio**, usá **Carga manual**: importe, concepto, moneda, categoría, subcategoría y medio de pago se encuentran en una sola pantalla. Verificá Efectivo, Débito y Crédito. Al elegir Débito o Crédito aparecen solamente las tarjetas de ese tipo.
3. Para Crédito, elegí la cantidad de cuotas. La primera cuota se calcula a partir del cierre de la tarjeta y luego se distribuye por vencimiento mensual.
4. Probá la voz manteniendo presionado el micrófono, hablando y soltándolo al terminar. Ejemplos:
   - `Gasté cincuenta mil pesos en el kiosco`.
   - `Gasté diez mil en kiosco y veinte mil en supermercado`.
   - `Gasté un millón en una heladera con crédito Mi Visa en doce cuotas`.
5. Antes de guardar un gasto reconocido por voz, revisá importe, medio de pago, tarjeta, cantidad de cuotas, valor de cada cuota y fecha de la primera cuota.
6. Entrá en **Informes** y verificá total ARS, total USD, equivalente, comparación con período anterior, gráficos de barras y de torta por categoría, categorías, medios de pago y mayores gastos.
7. Probá **Presupuesto**, **Ahorro**, **Stock**, **Gastos recuperados**, **Papelera** y **Consultas**.
8. En **Reventa de entradas**, comprobá Balance general, reparto Mauro/vendedor, fiestas plegadas por nombre, detalle individual y nuevas fiestas. Probá **Importar Excel** con tu hoja Ventas: las diferencias se enumeran y vos decidís entrada por entrada si conservás la app, usás el Excel o corregís manualmente. No se importan cambios sin confirmar.

## iPhone / PWA

La aplicación debe servirse mediante HTTPS para usar correctamente instalación PWA, micrófono y biometría.

1. Abrí la URL publicada en **Safari**.
2. Tocá **Compartir**.
3. Elegí **Agregar a pantalla de inicio**.
4. Abrí Mis Gastos desde el nuevo icono.

La pantalla de Inicio está diseñada para entrar completa en el viewport del iPhone sin necesidad de reducir el zoom. Las demás secciones tienen desplazamiento vertical cuando el contenido supera la pantalla.

## Categorías, gastos fijos y recuperos

Las categorías propias iniciales se incorporan **una sola vez** sin sobrescribir las que ya hayas cargado. Después las podés crear, renombrar, eliminar o reorganizar. Se utiliza una lista maestra para carga manual, clasificación por voz, stock, gastos fijos, consultas e informes. También se actualizan las categorías de los gastos guardados en la Papelera cuando se renombra una categoría.

Cuando existe una categoría principal **VINOS** y subcategorías con ese nombre en otras categorías (por ejemplo, SUPERMERCADO → VINOS), Informes permite ver el acumulado transversal y su desglose sin modificar dónde se guardó cada gasto. Los gráficos de torta muestran categorías de origen, sin sumar dos veces esos acumulados.

**Gastos fijos** está en **Menú → Funciones**. Se conserva el concepto y el importe se registra por separado cada mes, con opción de usar como referencia el pago del mes anterior. No se genera automáticamente un gasto de importe fijo.

Los **recuperos** cargados durante el mes al que corresponden reducen el gasto neto de ese mes. Los recuperos retroactivos quedan informados en su historial, sin alterar el gasto del mes anterior. El gasto original permanece registrado.

## Persistencia

Cada modificación relevante se guarda inmediatamente en `localStorage`, y se vuelve a persistir al ocultar o cerrar la aplicación. Una actualización del código no cambia la clave de almacenamiento, por lo que no debería borrar los datos del mismo origen/navegador.

Importante: Safari y una PWA instalada pueden comportarse como contextos de almacenamiento distintos según la versión/configuración de iOS. Para datos reales conviene elegir el acceso que se va a usar habitualmente y continuar allí hasta incorporar sincronización en la nube.

## Exportación

En **Consultas**:
- **Exportar para Excel (CSV)** genera un CSV UTF-8 compatible con Excel.
- **Guardar / imprimir PDF** abre la vista de impresión del navegador para guardarla como PDF.

En **Reventa** se puede exportar el detalle en CSV y **importar hojas Excel** (.xlsx, .xls o CSV) con comparación manual contra las entradas cargadas. Antes de confirmar la importación se pueden revisar costos, precios, estados y entradas faltantes. La Reventa está separada de los gastos personales.

## Versión compartida

Con `?shared=1`, Reventa no aparece y su módulo no se descarga ni se ejecuta. La versión personal mantiene Reventa disponible.

## Pruebas automáticas

```bash
npm test
```

Las pruebas cubren números e importes en español, múltiples gastos en una frase, tarjetas y cuotas, cálculo de cierre/vencimiento, presupuesto, stock, recuperos actuales e históricos, informes, matemática de Reventa, importación controlada y verificaciones de la estructura de la carga manual. Un flujo ya existente de GitHub Actions ejecuta el conjunto al actualizar una solicitud de cambios.

## Solución de problemas

- Si el micrófono no responde, comprobá permiso de micrófono y que la URL use HTTPS.
- Si ves una versión anterior, recargá Safari; el service worker utiliza una caché versionada y elimina las versiones previas.
- Si no aparece una tarjeta al cargar un gasto, verificá que esté configurada con el mismo tipo de medio de pago: Débito o Crédito.
