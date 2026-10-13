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
