# Límites de la versión 1.0.0

Este documento distingue la implementación actual de las mejoras pendientes. La aplicación se ha ejercitado con pruebas automáticas y un host simulado de Obsidian. No se ha validado físicamente en Obsidian de escritorio, Android o iOS, ni mediante consultas reales autenticadas a proveedores de IA.

## Plataforma y avisos

El manifiesto declara `isDesktopOnly: true`. Las funciones de escritorio y la ejecución de CLI no convierten esta versión en un complemento móvil compatible.

Los recordatorios son locales. Necesitan que Obsidian y Miauwi estén activos; una aplicación cerrada o un equipo suspendido no ejecutan sus temporizadores. Al reabrir, el gestor consume los vencidos pendientes y entrega un resumen. No programa alarmas del sistema para cuando Obsidian esté cerrado. No hay avisos garantizados en segundo plano de Android.

El gestor guarda la ocurrencia consumida antes de publicar el aviso para evitar repeticiones. Un cierre entre ese guardado y la presentación visual puede impedir que llegue a mostrarse: la persistencia local no equivale a una entrega confirmada por el usuario. Los avisos actuales usan la interfaz de Obsidian; su visibilidad depende del estado de la aplicación.

Concentración y silencio reducen comentarios y consultas periódicas, pero los recordatorios siguen activos. La escena de sueño es visual; no suspende las tareas programadas.

## Fechas y recurrencia

El parser español tiene una gramática acotada. Reconoce expresiones frecuentes, números habituales y horarios explícitos. Si falta la fecha, la hora, el año necesario o hay alternativas contradictorias, pide aclaración. «Antes del examen» no permite adivinar cuándo ocurre el examen.

Las fechas imposibles y las horas iniciales ambiguas o inexistentes por horario de verano se rechazan. La recurrencia mensual conserva el día original: una fecha 31 puede pasar al último día de febrero y regresar al 31 en marzo. En futuros cambios de horario, Luxon puede ajustar una hora inexistente al siguiente horario válido de ese día. Revisa los horarios sensibles a estos cambios.

## Tareas Markdown

La integración local trabaja con líneas checkbox. Omite el frontmatter inicial y los bloques de código cercados; no sustituye un parser completo de todos los dialectos Markdown ni el modelo de tareas de otros complementos.

Al completar, comprueba la línea y el estado actuales dentro de `Vault.process`. Si la tarea cambió, se detiene y pide volver a elegir. Los estados personalizados y las tareas recurrentes necesitan la función compatible del complemento Tasks; sin ella se rechaza la modificación para no perder semántica ni la siguiente ocurrencia. No se instala Tasks automáticamente.

Las referencias de tareas consideran ruta, línea original y ordinal entre duplicados; un bloque `^id` existente es preferible para identificar una tarea. Las inserciones de líneas ajenas no deberían cambiar una referencia basada en ese contenido. Editar el título o sus metadatos, mover o renombrar la nota y reordenar duplicados puede invalidar el vínculo. La implementación es conservadora: no reasigna automáticamente un recordatorio a una coincidencia parecida. Revisa los avisos vinculados después de esos cambios.

TaskNotes utiliza notas y propiedades, un modelo distinto de las líneas checkbox. No se ha implementado ni verificado un puente hacia su API.

## IA y complementos externos

La IA está desactivada inicialmente. Codex CLI y Claude Code CLI son adaptadores opcionales que reutilizan la autenticación existente de sus ejecutables. No se han realizado llamadas reales autenticadas como parte de esta validación. Sus argumentos se comprobaron frente a las versiones instaladas durante el desarrollo; otra versión puede rechazarlos. Detectar la CLI no verifica conexión, permisos, saldo o cuota.

Los procesos se inician en una carpeta temporal separada, con herramientas restringidas y contexto limitado. Son medidas de aislamiento, no una certificación de seguridad de cada CLI o proveedor. Los errores, timeouts y respuestas mal formadas se presentan sin convertir texto parcial en una orden.

No hay una API interna de Copilot verificada para ejecutar estas conversaciones sin interfaz. No se importan sus chats ni credenciales. Tampoco se ha verificado un puente automático con Miyo, Smart Connections o sus índices. Tener esos complementos instalados no activa una integración silenciosa.

Las sugerencias del agente no modifican notas por sí mismas. Abrir una nota, elegir una tarea o posponer un aviso pasa por los controles locales correspondientes. Las correcciones ortográficas son sugerencias de IA: no existe un diccionario ortográfico local incluido ni corrección automática.

## Memoria, datos y recomendaciones

El archivo local `.obsidian/plugins/miauwi/data.json` usa esquema 1. Contiene ajustes, recordatorios, historial propio y memoria operativa. No está cifrado por Miauwi; su protección y sincronización dependen de cómo administres el vault.

El historial visible y el historial enviado al agente son propios del complemento. Cambiar proveedor o carpetas autorizadas limpia el segundo. Desactivar **Guardar conversación local** evita escribir ambos historiales en las siguientes persistencias; no borra por sí solo toda la memoria de aperturas, hallazgos o recordatorios, ni impide conservar conversación durante la sesión. Usa **Borrar conversación** para limpiar los historiales propios.

La recomendación de notas usa metadatos, enlaces y aperturas registradas mientras Miauwi participa. No incorpora un índice semántico nuevo ni conoce tu historial completo de lecturas. «Sin apertura registrada» no significa «nunca leída».

Las reglas de propiedades son configurables por carpeta y solo detectan los tipos admitidos. No garantizan que una nota sea correcta en términos académicos. Los perfiles y sprites locales se validan según su formato, pero no se promete compatibilidad con cualquier spritesheet externo.

## Trabajo futuro concreto

- Probar instalación, interacción visual, foco, reinicio y descarga en Obsidian real, con distintos temas y tamaños de ventana.
- Verificar consultas autenticadas y cancelación con versiones concretas de cada CLI antes de anunciarlas como integración validada.
- Evaluar compatibilidad móvil por separado y decidir si necesita un mecanismo propio de avisos; no basta con cambiar el manifiesto.
- Diseñar migraciones de referencias de tareas para renombres y edición, con confirmación cuando haya ambigüedad.
- Añadir un corrector local o puentes con otros complementos solo después de definir y probar sus contratos públicos.

Estas mejoras están pendientes; no forman parte de la funcionalidad validada de esta entrega.
