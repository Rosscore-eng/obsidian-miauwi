# Miauwi

Un gato académico para Obsidian que te acompaña mientras estudias, organiza recordatorios y ayuda con tareas. Funciona de forma útil sin IA. Puedes cambiar su nombre, personalidad, tamaño y actividad desde los ajustes.

**Versión 1.0.0 · Escritorio · En fase de validación.** El manifiesto declara Obsidian 1.6.0 como mínimo. Hay pruebas automáticas y un host simulado de Obsidian; todavía falta validar la experiencia en una instalación real. Esta versión no está habilitada para Android ni iOS.

Repositorio: [Rosscore-eng/obsidian-miauwi](https://github.com/Rosscore-eng/obsidian-miauwi).

## Qué puedes hacer

- **Convivir con el gato.** Camina, corre, salta, trepa, persigue el cursor y duerme. Puedes arrastrarlo, llamarlo, ocultarlo o activar concentración. Tiene movimiento reducido, bajo consumo y horario silencioso.
- **Crear recordatorios en español.** Por ejemplo: «Recuérdame estudiar mañana a las 7 p. m.» o «Descansar dentro de 45 minutos». Si falta una fecha u hora, pregunta y permite continuar la solicitud. Presenta fecha, zona y recurrencia antes de guardarla.
- **Administrar avisos.** Recordatorios únicos, diarios, semanales y mensuales; edición, cancelación y posposición. Al volver a abrir Obsidian, recupera los vencidos que no se habían consumido.
- **Consultar tareas Markdown.** Pendientes, mañana, semana, atrasadas, urgentes o completadas hoy. Abre la nota de origen, crea tareas con confirmación y completa la coincidencia elegida mediante una escritura atómica.
- **Vincular tareas y recordatorios.** El selector permite crear un aviso para una tarea o anticiparlo a su vencimiento indicando días y hora exacta. Al completar la misma tarea, cancela su recordatorio vinculado.
- **Revisar propiedades.** Detecta problemas de YAML, claves repetidas, propiedades faltantes o de tipo incorrecto según reglas por carpeta y enlaces sin resolver. Presenta hallazgos sin corregir las notas automáticamente.
- **Volver a notas útiles.** Recomienda notas con datos de enlaces, modificación y aperturas registradas por Miauwi. Explica la evidencia y no confunde una fecha de modificación con una lectura.
- **Personalizar recursos.** Perfiles JSON y paquetes de sprites locales. El comando para crear recursos genera prompts y perfiles editables sin sobrescribir archivos existentes.

El nombre predeterminado es **Miauwi**. Al cambiarlo, se actualizan las etiquetas de sus comandos. El identificador del complemento sigue siendo `miauwi`.

## Instalación y primera prueba

Empieza en **un vault de prueba**, con unas pocas notas ficticias. Copia `main.js`, `manifest.json` y `styles.css` en:

```text
<vault-de-prueba>/.obsidian/plugins/miauwi/
```

Después habilita Miauwi en **Ajustes → Complementos de la comunidad**. Configura la zona horaria y prueba un recordatorio cercano con Obsidian abierto. La carpeta del complemento debe llamarse `miauwi`, aunque cambies el nombre del gato.

La [guía de instalación](docs/INSTALLATION.md) explica la compilación, el paquete y una secuencia de comprobación. El desarrollo y las pruebas automatizadas de este proyecto no requieren instalarlo en tu vault personal.

## IA opcional

En los ajustes puedes elegir **Sin IA**, **Codex CLI** o **Claude Code CLI**. La opción inicial es Sin IA. La IA añade comentarios sobre contexto autorizado, conexiones académicas y sugerencias de ortografía; no existe un corrector ortográfico local incluido.

Los agentes se ejecutan en un directorio temporal separado, con herramientas y acceso de trabajo restringidos. Reciben instantáneas limitadas de notas de las carpetas que autorizas y un historial propio de intercambios con agentes externos; no se adjunta por defecto el diálogo local de tareas y recordatorios. No se importan conversaciones de Copilot u otros chats. Cambiar de proveedor o de carpetas autorizadas limpia el historial enviado al agente. Las consultas pueden ser manuales o periódicas cuando activas un intervalo.

Puedes aprovechar la autenticación existente de una CLI compatible. Miauwi no exige una suscripción API nueva para sus funciones locales; las condiciones, cuotas y posibles costes del proveedor elegido siguen aplicándose. Los adaptadores se han probado con procesos controlados y respuestas simuladas, sin consultas reales autenticadas a proveedores.

## Datos y límites

Los ajustes, recordatorios y memoria propia se guardan en `.obsidian/plugins/miauwi/data.json`, con esquema 1. Si desactivas **Guardar conversación local**, los historiales no se escriben en disco en las siguientes persistencias; la conversación de la sesión puede seguir en memoria hasta borrarla o cerrar la aplicación. La opción para borrar conversación limpia el historial propio.

Los avisos necesitan Obsidian y Miauwi activos. Con la aplicación cerrada o el equipo suspendido no se garantiza la hora de entrega. No hay un servicio de notificaciones en segundo plano para Android.

Consulta [los límites actuales](docs/LIMITATIONS.md), [las pruebas](docs/TESTING.md), los [ejemplos de personalidades](examples/personalities/profiles.json), los [sprites personalizados](examples/skins/README.md) y los [nueve prompts editables](examples/prompts/README.md).

## Desarrollo

```sh
npm ci
npm run check
npm run package
```

`check` ejecuta TypeScript, pruebas y compilación. El paquete instalable contiene los tres archivos de Obsidian y ejemplos; la salida de carpeta está en `dist/miauwi/`.

Licencia [MIT](LICENSE).
