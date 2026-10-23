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

## Protección de acceso — regla del usuario (13/10/2026)
Intentar Face ID al abrir y al regresar a la app si la protección está activada. Mostrar el PIN de seis dígitos como respaldo cuando la autenticación no se completa; no presentar una elección inicial de métodos dentro de la app. Una sola solicitud biométrica a la vez. El interruptor de Configuración debe permitir activar/desactivar conservando PIN y credencial; ante fallos de guardado, recuperar la configuración anterior. Las credenciales permanecen por dispositivo y no se sincronizan. La hoja de llave de acceso de iOS/Safari pertenece al sistema: no prometer su eliminación desde la PWA. Para Face ID directo sin esa hoja hace falta una implementación nativa. Verificar el flujo con mocks de éxito/fallo/cancelación y realizar la prueba real en el iPhone del usuario.

## Requisito permanente — edición personal y distribución autorizada (21/10/2026)
- Reventa de Entradas es exclusiva de la cuenta propietaria de Mauro. Ninguna cuenta compartida puede acceder a la función ni a sus datos. Identificar la cuenta por su UID verificado y permisos administrados en servidor; nunca por parámetros de URL, correo escrito por el cliente, botones ocultos o user_metadata editable.
- La edición para compartir debe excluir Reventa y la administración de usuarios. Aislar sus datos también en consultas, respuestas, sincronización, exportaciones y respaldos descargables; revisar y separar el estado remoto antes de habilitar cuentas compartidas.
- Cada persona necesita autorización de Mauro para usar la app. La decisión posterior del usuario es aprobar dentro de la app, sin SMS. Conservar el listado de usuarios activos en la tarjeta “Usuarios de Mis Gastos”, disponible exclusivamente para Mauro.
- Cada usuario nuevo comienza sin gastos, pagos, tarjetas personales ni datos del propietario; se pueden ofrecer categorías/subcategorías base editables. No distribuir gastos de recuperación, Reventa ni respaldos de Mauro como datos iniciales.
- La app debe poder instalarse/descargarse y mantenerse actualizable por sus usuarios. Las mejoras de Mauro actualizan el programa conservando todas las cargas de gastos y demás datos de cada cuenta, sin reinstalar ni borrar almacenamiento.
- Actualizar versión, caché o interfaz nunca equivale a reiniciar datos. Antes de migraciones, crear y releer respaldos íntegros; migrar sobre una copia, preservar campos desconocidos y detenerse ante fallos. Probar actualización de una versión anterior con datos reales anonimizados, recuperación, trabajo sin conexión, cambios pendientes y ausencia de duplicados o pérdidas.
- Cerrar sesión conserva los datos de la misma cuenta y bloquea su acceso por la app hasta volver a autenticarse. No mezclar identidades al reingresar.
- Los usuarios compartidos pueden administrar sus propios gastos y categorías según las funciones previstas. No tienen permisos administrativos para modificar código publicado, permisos, funcionamiento global u otras cuentas.
- No entregar la edición para amigos como lista hasta comprobar estas restricciones del lado del servidor y el flujo completo de alta, autorización, ingreso, cierre, recuperación y actualización sin pérdidas. No prometer inmunidad absoluta a ataques o pérdida cero.


## Separación del negocio — trabajo en curso 22/10/2026
- Reventa se traslada a una app independiente en `negocio/`; no retirar la original ni sus datos hasta verificar la migración y el acceso real del propietario.
- La app independiente no debe importar `resale.js`: su arranque heredado introduce datos en el almacenamiento de Mis Gastos. Utilizar métricas puras.
- `scripts/build-business.py` genera index.html, app.js y metrics.js del negocio. Modificar el generador para no perder correcciones al regenerar.
- Vendedores con porcentajes individuales sobre ganancia neta; cada entrada asignada conserva el porcentaje histórico. Cambiar el catálogo no recalcula ventas anteriores.
- Requisito corregido por Mauro: la exportación debe partir del Excel importado y conservar sus hojas, formato, funcionamiento y fórmulas. No sustituirlo por un libro reconstruido de valores ni agregar hojas por decisión propia. La exportación tabular anterior NO satisface este requisito y no debe publicarse como definitiva. Conservar el original íntegro por cuenta; actualizar entradas sobre una copia, extender fórmulas y referencias cuando corresponda y verificar formato, resultados y recálculo. Si una estructura no está soportada, explicar el límite y bloquear la exportación antes de entregar un archivo degradado. El respaldo JSON completo sigue siendo independiente.
- Las diferencias se resuelven individualmente; seleccionar todo sólo agrega entradas nuevas. Nunca interpretar ausencias como eliminaciones automáticas.
- Prueba de regresión: escritura y lectura XLSX real, importación repetida, parcial, conflictiva, comisiones históricas y fallos de almacenamiento. Ejecutar la suite con TZ=America/Argentina/Buenos_Aires (las pruebas existentes del mes dependen de esa zona).
- Pendientes antes de publicar negocio: prueba integral de navegador, preparar y verificar copia remota del negocio, verificación PC/iPhone. La aprobación de usuarios y la retirada del módulo personal siguen pendientes. No declarar distribución lista.

## Estados y porcentajes — 22/10/2026
- Uso personal conserva datos originales pero no aporta costo de negocio, inversión activa, venta, recupero, ganancias, comisiones ni stock vendible. Al cambiar el estado se recalcula sin borrar los valores originales.
- Leer los porcentajes explícitos de fórmulas de cada fila del Excel antes de importar. No calcular porcentajes a partir de ganancias cacheadas ni asumir que el encabezado general prevalece sobre la fórmula. Fórmulas no interpretables bloquean el reparto en lugar de inventarlo.
- El simulador respeta las comisiones guardadas por entrada. Cambiar reparto predeterminado congela el reparto previo en las entradas existentes; las nuevas compras guardan su porcentaje al crearse.
- Verificación local de esta revisión: 378 pruebas aprobadas. No equivale a publicación ni a prueba de dispositivos reales. Exportación que preserve el libro original continúa pendiente.


## Exportación con plantilla original — avance 22/10/2026
- Nombre de la aplicación independiente: Reventa de Entradas.
- La importación XLSX revisada conserva el archivo íntegro en `resale.excelTemplate`, dentro del estado autenticado y sus respaldos. Límite actual 2 MB. No incluir archivos financieros privados como recursos públicos del repositorio.
- `negocio/template-export.js` actualiza sólo precio de venta y estado en el paquete OOXML original compatible. Conserva fórmulas, estilos y demás componentes; invalida resultados cacheados y pide recálculo a Excel.
- Aún NO soporta añadir compras/fiestas, cambiar costos/fechas o porcentajes en el Excel de salida. Bloquea esos casos explícitamente. No afirmar exportación completa ni publicar la app como terminada. Tampoco está verificado el recálculo real en Excel.
- Verificación privada sobre el archivo recibido: fórmulas y componentes no modificados comparados íntegramente; cambios de venta/estado comprobados. Suite del proyecto: 381 pruebas. El archivo de prueba real permanece fuera del repositorio.

## App independiente — revisión 23/10/2026
- Los avances posteriores sustituyen los límites de exportación descritos arriba: `template-layout.js` adapta Compras, Ventas y Balance a nuevas fiestas, lotes y porcentajes individuales, preservando estilos y componentes del paquete original. Tipos soportados: EARLY, GRAL 1/2/3 y VIP; otros tipos bloquean la exportación con explicación.
- Copia inicial remota verificada: business_heads revisión 1, 13 fiestas y 193 entradas, sin gastos personales. Respaldo idéntico comprobado; sync_heads original permanece en revisión 10. Tres fiestas duplicadas exactas archivadas en la copia nueva; se conservaron 34 diferencias de fecha de compra de la app y se completaron 105 fechas ausentes. No hubo diferencias de importes/ventas/estados.
- Exportación/importación privada comprobada dos veces: inventario original 193 entradas y escenario ampliado de 194 entradas con fiesta vacía, fiesta nueva y vendedor con porcentaje distinto; cero diferencias al volver a leer.
- Navegador local utiliza API simulada para probar sin alterar datos productivos. No equivale a verificar ingreso y sincronización real PC/iPhone. Mantener el módulo original hasta esa verificación.
- Sigue pendiente comprobar recálculo en Excel nativo y acceso desde los dispositivos del propietario. No afirmar funcionamiento perfecto ni que la distribución para amigos está lista.
