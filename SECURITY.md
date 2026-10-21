# Seguridad de Mis Gastos — revisión 21/10/2026

## Cambios publicados en v154–155
- Perfil accesible desde el ícono de usuario: nombre, apellido, nombre visible, correo, fecha de alta y teléfono opcional. Solo datos personales en `user_metadata`; nunca permisos o roles.
- Cierre local con confirmación, espera de sincronizaciones en curso, respaldo completo SHA-256 releído y verificado, y bloqueo previo al arranque de datos. Conserva gastos, tarjetas, papelera, Reventa, campos desconocidos y la identidad vinculada.
- Reingreso exige contraseña y cuenta original verificada. Cuenta distinta, contraseña incorrecta o error de verificación mantienen el bloqueo. La contraseña no se guarda en el perfil.
- Las pestañas del mismo navegador se bloquean al cerrar sesión. El cierre usa `scope: local` y no revoca sesiones del otro dispositivo.
- CSP limita scripts a este sitio y bloquea eval, scripts en línea, objetos y marcos. Cotización y autenticación conservan sus conexiones específicas. No se transmiten referencias de navegación.
- Lector Excel oficial 0.20.3 conservado localmente, versión y SHA-256 fijados. No se ejecutan scripts desde CDNs. Fuente: https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- Service worker limitado a archivos estáticos dentro de esta app. No intercepta ni almacena respuestas de Auth, API, servicios externos u otros sitios. Navegaciones se guardan sin consultas sensibles. La limpieza retira cachés anteriores de esta app; no toca los datos financieros o IndexedDB.
- Se escaparon textos adicionales de moneda y detalle de informes antes de generar HTML. La impresión PDF ya no requiere scripts en línea.

## Verificación realizada
- 344 pruebas automáticas: pasan. Incluyen conservación y recuperación del respaldo antes del cierre, fallos de almacenamiento y sesión, cuenta equivocada, rechazo de contraseña, actualización y relectura de perfil, aislamiento del arranque, caché y Excel real con fechas, importes decimales, acentos y estados Vendida/Uso personal.
- Comprobación visual del perfil publicado, sin iniciar sesión ni editar gastos.
- Auditoría de solo lectura de Supabase: RLS activo en todas las tablas públicas; políticas de sync_heads/sync_backups limitadas al auth.uid del propietario, con WITH CHECK en escrituras; sin permisos anónimos de lectura o ejecución de commit_sync; respaldos sin UPDATE/DELETE para authenticated; API antigua por token revocada; disparador de historial habilitado. Las 11 comprobaciones de permisos y ausencia de fixtures dieron true.
- La revisión automática rechazó pruebas con fixtures transaccionales en producción por riesgo de efectos persistentes. No se ejecutaron; se usaron inspecciones de solo lectura y pruebas aisladas. No se modificaron gastos ni usuarios reales para comprobar seguridad.

## Límites y tareas pendientes antes de compartir
- La protección de contraseñas filtradas de Supabase está desactivada. El proveedor la ofrece en Pro o superior; no se cambió el plan. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Perfil y cierre de sesión todavía deben comprobarse con la cuenta del usuario en PC e iPhone. La sincronización entre ambos requiere copias completas externas y una reconciliación inicial; no se afirma que ya estén sincronizados.
- La versión para amigos sigue pendiente: autorización de altas por SMS, administración restringida en servidor, cuentas desde cero y exclusión de Reventa/admin. Ocultar botones o usar `shared=1` no constituye autorización.
- Los respaldos locales no cubren borrado del navegador o pérdida del equipo. Guardar copias externas y comprobar la recuperación es necesario, además del historial remoto.
- La sesión cerrada oculta y bloquea los datos mediante la app, pero no cifra el almacenamiento físico del navegador. No se migró a cifrado sin una estrategia verificada de recuperación de claves.
- La CSP en meta no permite imponer frame-ancestors; cabeceras adicionales requieren alojamiento configurable. No se declara inmunidad a ataques ni garantía de pérdida cero.

## Corrección v156 — decisiones de sincronización
Al cambiar entre el chat y la app, el guardado de una fecha interna se interpretaba como edición pendiente. La sincronización ahora distingue datos ya guardados de formularios activos: conserva los bloqueos por gastos pendientes, diálogos de edición y falta de guardado verificado. Guardar decisiones libera el foco de los selectores de iOS, persiste las decisiones por cuenta y permite reintentar tras una interrupción. Cada decisión se revalida contra los dos valores originales; un cambio real exige nueva revisión. Las diferencias de cada fiesta pueden seleccionarse juntas sin incluir otras fiestas o gastos personales. Un aviso junto al botón informa el resultado. Pasan 350 pruebas locales, incluidas conservación de gastos y ventas ante cambios concurrentes y rechazo de decisiones obsoletas. La sincronización real del teléfono del usuario sigue pendiente de confirmación.
