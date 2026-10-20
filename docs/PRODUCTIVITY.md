# Productividad local: contratos y límites

## Compatibilidad

Miauwi se desarrolló y probó con Obsidian 1.14.4. Puede convivir con Copilot, Smart Connections, TaskNotes, Full Calendar Remastered o Dataview, pero ninguno es obligatorio, y tampoco necesita el complemento Tasks.

## API pública de Obsidian

Fuente primaria: [declaraciones oficiales de la API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts).

Las lecturas para mostrar datos usan `Vault.cachedRead(file)`. Una escritura autorizada usa `Vault.process(file, fn)`, que vuelve a leer y guarda atómicamente; `fn` debe ser síncrona. El escritor de tareas verifica dentro de esa función tanto la línea original como el estado. Si cambió la nota, se pide al usuario actualizar la selección en lugar de reemplazar otra coincidencia.

Eventos públicos pertinentes: `vault.on('create'|'modify'|'delete'|'rename', ...)`, `metadataCache.on('changed'|'deleted'|'resolve'|'resolved', ...)`, `workspace.on('editor-change'|'file-open'|'active-leaf-change'|'layout-change'|'resize', ...)`. Registrar con `Plugin.registerEvent` y temporizadores con `registerInterval` permite limpiar al desactivar. Iniciar el escaneo con `workspace.onLayoutReady` evita tratar los eventos iniciales de creación como trabajo nuevo. `editor-change` también incluye cambios programáticos: no demuestra por sí solo que una persona escribió.

## Recordatorios

El parser requiere zona IANA válida y fecha y hora explícitas, excepto duraciones relativas y horarios diarios/semanales. Admite mañana, pasado mañana, próximo día de semana, todos los lunes, diario, mensual con día o fecha explícitos, fechas ISO o españolas y números habituales en español. Un horario de doce horas requiere mañana/tarde/noche o a.m./p.m.; `07:00` y `19:00` son explícitos. Si faltan datos, hay una fecha imposible o la hora inicial cae en un salto o una repetición del horario de verano, devuelve una pregunta; nunca consulta notas para adivinar la fecha de un examen.

`ReminderManager` copia los datos que recibe y devuelve. Todas las mutaciones se serializan; primero persiste una copia de la próxima versión y después publica el nuevo estado. `tick(now)` marca una ocurrencia como consumida antes de devolver una alerta. Una escritura fallida conserva el estado anterior y permite reintentar. `catchUp(now)` es una consulta de los vencidos aún pendientes: mostrar esa lista no consume alertas; `tick` sí. La recuperación agrupa el tiempo ausente en una alerta por recordatorio y salta directamente al siguiente horario futuro.

La recurrencia mensual conserva el día de la fecha original: 31 de enero → último día de febrero → 31 de marzo. Las recurrencias siguen el reloj de su zona; Luxon resuelve los futuros saltos de horario de verano al siguiente horario válido de ese día. Posponer cambia `nextRun`, conservando `dueAt` como ancla de recurrencia. Editar la fecha cambia el ancla.

El núcleo no es un servicio del sistema: los temporizadores necesitan Obsidian y el complemento activos. Tras cerrar la aplicación o suspender el equipo no promete alertas puntuales; al reabrir se consultan los vencidos. La interfaz actual usa avisos de Obsidian, no alarmas del sistema programadas con la aplicación cerrada. Esta versión es de escritorio y no ofrece avisos en segundo plano de Android.

## Tareas Markdown

Los números de línea son **base cero**. Se omiten frontmatter inicial y bloques de código cercados. Se reconocen fechas válidas `📅`, `⏳`, `✅`, recurrencia `🔁` y prioridades Tasks `🔺`/`⏫`/`🔼`/normal/`🔽`/`⏬` (0 a 5). `urgent` selecciona prioridades 0 y 1. `week` significa desde hoy hasta el domingo de la semana ISO; los filtros usan la fecha local de la zona suministrada.

Los identificadores usan el bloque `^id` cuando existe. En su ausencia combinan ruta, contenido de la línea normalizado para el estado y la fecha de finalización, y ordinal entre duplicados; insertar líneas ajenas no cambia esa identidad. Editar título o metadatos, mover o renombrar notas o reordenar duplicados puede invalidar vínculos. Se recomienda un bloque `^id` existente para tareas vinculadas. La línea original siempre se verifica al escribir. Se conserva CRLF/LF y contenido ajeno a la línea elegida. Una tarea completada no recibe otra fecha de finalización. La interfaz presenta coincidencias múltiples para elegir y ejecuta la modificación dentro de `Vault.process`.

## Integraciones opcionales

**Tasks:** su [documentación primaria](https://github.com/obsidian-tasks-group/obsidian-tasks/blob/main/docs/Advanced/Tasks%20Api.md) expone `app.plugins.plugins['obsidian-tasks-plugin'].apiV1`. Se comprueba su existencia y la función requerida antes de llamar. El acceso al registro de plugins no figura en las declaraciones públicas de Obsidian y se mantiene como adaptador opcional.

`executeToggleTaskDoneCommand(line, path): string` existe desde Tasks 7.2.0 y devuelve Markdown, sin escribir la nota. Puede devolver varias líneas por recurrencia o una cadena vacía por eliminación al completar. Hay que guardar íntegro ese resultado en la línea elegida. `createTaskLineModal(): Promise<string>` existe desde 2.0.0; `editTaskLineModal(line): Promise<string>` desde 7.21.0. La API no permite consultar tareas. Sin ese complemento, Miauwi puede completar tareas simples y rechaza modificar recurrentes para no perder su siguiente ocurrencia.

**TaskNotes:** tareas de una nota por archivo con propiedades no equivalen a líneas checkbox de Tasks. No se ha implementado ni probado un adaptador y no se activa su servidor API automáticamente. Las notas pueden abrirse mediante la navegación normal de Obsidian; el usuario conserva sus flujos nativos.

**Copilot:** 4.0.13 incluye `obsidian://copilot-chat?vault=<vault>&id=<chat-id>`, [incorporado en 4.0.12](https://github.com/logancyang/obsidian-copilot/issues/3271). Es una posibilidad de integración futura mediante enlaces explícitos, no un botón o puente implementado en Miauwi. No se ha verificado una API para sesiones sin interfaz ni se leen sus historiales. Véase [INTEGRATIONS.md](INTEGRATIONS.md).

**Smart Connections:** [la arquitectura actual](https://github.com/brianpetro/obsidian-smart-connections) comparte Smart Environment y usa embeddings locales de forma predeterminada. Ejemplos antiguos con `.api.search`/`.brain.smart_blocks` no son un contrato probado para 4.7.2. Miauwi no implementa un puente hacia su índice; su recomendador propio usa metadatos y memoria de aperturas. No se copian índices ni se recorren conversaciones.

**Miyo:** podría estudiarse una integración optativa y explícita mediante su CLI/MCP local, pero no se ha implementado ni verificado. No se extraen claves de Copilot ni se presupone que un servidor HTTP de Miyo esté disponible. No es necesario para recordatorios o tareas.

## Referencias de mascotas y licencias

- [Kitty](https://github.com/amilleah/obsidian-kitty-plugin): repositorio identificado como 0BSD; su README atribuye el gato a Elthen. La licencia del código no acredita automáticamente todos los derechos de arte externo. Miauwi no reutiliza esos sprites sin verificar sus condiciones.
- [Vault Pet](https://github.com/elliott-json-park/obsidian-vault-pet): MIT; la fuente Pretendard tiene SIL Open Font License 1.1. Es de escritorio. Se pueden estudiar sus ideas sin incorporar sus activos.
- [Moon](https://community.obsidian.md/plugins/moon): ficha oficial MIT, de escritorio, port de oneko. Atribuye comportamiento y sprite a `adryd325/oneko.js` (MIT). La ficha es la evidencia disponible; el archivo LICENSE del repositorio no pudo recuperarse durante la revisión.

La implementación de Miauwi es propia. Si se incorporan componentes externos posteriormente, deben conservarse sus avisos y comprobarse las licencias específicas de los activos.
