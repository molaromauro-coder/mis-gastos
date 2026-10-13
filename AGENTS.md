# Mis Gastos: controles obligatorios de datos

## Actualizaciones de Reventa desde planillas
- Leer el archivo más reciente indicado por el usuario antes de realizar cambios. No dar por importada una planilla porque se recibió en el chat.
- Extraer todas las filas de entradas de Ventas y contrastarlas con Compras y Balance general. Excluir filas de totales y no duplicar compras por lotes.
- Preparar un control por fiesta: fecha, cantidad por tipo, costo, ventas, estados, inversión efectiva sin Uso personal y reparto vigente.
- Comparar contra la app: identificar fiestas y entradas faltantes, duplicadas o diferentes. Conservar las ventas y ediciones posteriores salvo instrucción expresa de reemplazarlas.
- No inventar fechas inválidas ni trasladar la fecha de compra a la fecha de fiesta. Solicitar el dato faltante y avanzar con las cantidades verificadas.
- Verificar la actualización guardada, no solo el archivo preparado ni el código publicado. Si no hay acceso al dispositivo del usuario, indicarlo y guiar su actualización sin afirmar que sus datos locales ya cambiaron.
- Probar carga repetida sin duplicación, conservación de ventas y ausencia de cambios en los gastos personales. La reventa es independiente.
- No mostrar actualización completada si falta una fiesta, una entrada seleccionada, falla el guardado o queda alguna diferencia sin importar. Comunicar las diferencias conservadas explícitamente.
- Las actualizaciones automáticas deben conservar un respaldo, ser idempotentes, y modificar exclusivamente los datos autorizados.
- Antes de entregar, verificar la versión publicada. Indicar actualización desde el mismo ícono, sin borrar los datos ni reemplazarlo.
- El resultado debe incluir las cantidades verificadas y las discrepancias pendientes. Una revisión del usuario no reemplaza estas comprobaciones.

## Alcance
No sustituir los datos actuales del usuario por respaldos anteriores completos para importar Reventa. Usar importación limitada a Reventa y conservar el resto de la app.

## Incidente registrado — 13/10/2026
Las capturas mostraban fiestas importadas ausentes y entradas VIP debajo de EARLY. No confundir publicación del código con actualización de los datos locales. Las importaciones futuras deben guardar y releer un respaldo independiente de Reventa antes de modificarla; conservar por defecto todas las entradas actuales y sus ventas; rechazar revisiones obsoletas; verificar cada entrada no autorizada a cambiar y registrar archivo, fecha, diferencias y decisiones. El botón de selección global solo agrega entradas nuevas: los reemplazos se deciden individualmente. Si Compras contiene entradas ausentes de Ventas, bloquear la importación y explicar el faltante. No prometer que nunca habrá errores: mantener pruebas de regresión y comprobación del guardado.

## Regla permanente del usuario — conservación de TODOS los datos (13/10/2026)
La conservación de la información es obligatoria en cada cambio del proyecto, aunque el usuario no vuelva a mencionarla. Se aplica a gastos, pagos, tarjetas, categorías, subcategorías, fechas, estados, compras, ventas, fiestas, entradas, recuperos, stock, configuraciones, funciones ocultas y papelera.

- Antes de cualquier migración, importación, restauración o modificación masiva, crear un respaldo completo y releerlo para verificar su integridad. Si falla la creación o la comprobación, bloquear la operación.
- Preparar los cambios en una copia; validar esquema, identidad de registros y diferencias antes de guardar. Conservar campos desconocidos y datos que no estén presentes en el archivo importado.
- Nunca interpretar una lista vacía, una columna ausente, un error de lectura o un archivo parcial como una orden de borrar. No reemplazar el estado completo para actualizar un módulo.
- Cada baja o reemplazo requiere una acción explícita del usuario y una copia recuperable previa. Conservar las funciones de eliminación autorizadas, sus confirmaciones y el período seleccionado.
- Mantener registros estables y evitar duplicados al repetir una importación. Conservar por defecto datos locales posteriores y pedir resolución individual de conflictos.
- Registrar origen del archivo, fecha, inventario antes/después, diferencias, decisiones, resultado y respaldo relacionado. Nunca registrar éxito si el guardado o la relectura no coinciden.
- Ante errores o falta de espacio, mostrar el fallo y preservar el último estado verificado; no continuar con un estado vacío ni sobrescribir respaldos válidos con datos incompletos.
- Antes de publicar cambios que afecten persistencia: probar importación parcial, repetida y conflictiva; fallos de almacenamiento; recuperación; conservación de campos; y separación entre gastos personales y Reventa.
- Comprobar recuperación real desde un respaldo íntegro y ofrecer exportación fuera del almacenamiento del navegador. Una copia en el mismo dispositivo no cubre borrado de datos, pérdida del dispositivo o fallos físicos.
- No afirmar protección absoluta, sincronización remota ni restauración del dispositivo del usuario sin verificarlas. Distinguir implementación, publicación y comprobación de los datos locales.

## Requisito permanente — sincronización PC / iPhone
La app debe sincronizar automáticamente todos los datos del usuario entre su PC y su iPhone mediante una misma identidad autenticada. Guardado local o cuenta de ChatGPT no equivalen a sincronización.
- Incorporar respaldo remoto y conservar funcionamiento sin conexión con una cola persistente de cambios pendientes.
- Sincronizar al reconectar y detectar revisiones concurrentes. Nunca reemplazar datos locales por un estado remoto vacío u obsoleto ni sobrescribir cambios del otro dispositivo.
- Antes de la primera vinculación, respaldar ambos dispositivos y reconciliar registros y conflictos; no usar el último estado completo como reemplazo silencioso.
- Mostrar estado verificable: sincronizado, cambios pendientes, sin conexión o error. Confirmar sincronización solo tras lectura de comprobación del servidor.
- Verificar PC→iPhone e iPhone→PC, desconexión/reconexión y ediciones simultáneas antes de declarar el requisito cumplido.
- Mantener los gastos personales y Reventa independientes también en la sincronización.
- Estado al 13/10/2026: servicio reactivado y conexión por cuenta integrada en versión 138, con control de revisión, bloqueo de cambios de cuenta, comparación de tres versiones, respaldos inmutables, cola local mediante estado persistido y revisión individual de conflictos. Pasaron 298 pruebas y verificaciones transaccionales de aislamiento, historial y revisiones. Versión publicada abierta y panel verificado. Sigue pendiente vincular las cuentas del usuario y comprobar PC→iPhone e iPhone→PC en sus dispositivos reales; no afirmar que ya están sincronizados.
