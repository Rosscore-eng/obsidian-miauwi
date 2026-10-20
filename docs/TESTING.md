# Pruebas y alcance de validación

## Qué se ha comprobado

El proyecto usa TypeScript estricto y Vitest. Las pruebas ejercitan lógica real de fechas, persistencia, parsing, geometría, clasificación de intenciones y validación de respuestas. Las pruebas de integración del complemento usan `jsdom` y un host de Obsidian simulado; no ejecutan una instalación física de Obsidian.

| Área | Comprobaciones automáticas |
| --- | --- |
| Configuración | Nombre personalizable, normalización, límites, horarios silenciosos y datos con esquema |
| Mascota | Estados y personalidades, superficies, movimiento, interacción, arrastre, reducción de movimiento y limpieza de recursos |
| Recordatorios | Español, aclaraciones, zonas, DST, fechas imposibles, recurrencias, posposición, cancelación y recuperación |
| Persistencia | Mutaciones serializadas, guardado antes de alertar, ausencia de doble consumo y recuperación después de un fallo al guardar |
| Tareas | Frontmatter y código cercado, fechas y prioridades, filtros locales, duplicados, CRLF y edición exacta |
| Vínculos | Selección de tarea, avisos asociados, cambios de contenido y cancelación del recordatorio al completar |
| Agentes | Contexto permitido, salida JSON, argumentos, límites, cancelación, timeout y errores mediante procesos o respuestas controlados |
| Host simulado | Carga y descarga, comandos, diálogos, confirmaciones, acciones locales, memoria e interacción con adaptadores |

Los dobles de prueba aíslan las fronteras con Obsidian y los proveedores. Una prueba que pasa con ese host no confirma que cada detalle de Electron, un tema o un dispositivo se comporte igual.

## Ejecutar comprobaciones

Desde la carpeta del repositorio:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

O ejecuta el conjunto:

```sh
npm run check
```

Para concentrarte en un área:

```sh
npm test -- tests/productivity.test.ts
npm test -- tests/plugin.test.ts
npm test -- tests/task-links.test.ts
```

Para preparar la distribución:

```sh
npm run package
```

Comprueba que `dist/miauwi/` incluye `main.js`, `manifest.json` y `styles.css`. Verifica también que el ZIP entregado contiene esos archivos en una estructura que puedas copiar a la carpeta del complemento. No publiques `data.json`, carpetas de prueba, credenciales, historiales ni `node_modules/`.

Los números de pruebas cambian conforme se amplía la suite; consulta la salida del comando ejecutado y la revisión concreta. Esta documentación no sustituye ese resultado ni afirma una cobertura porcentual no medida.

## Validación manual pendiente

Se debe realizar primero en un vault aislado, sin notas personales y sin claves incluidas en sus archivos:

1. Instalar los tres archivos y comprobar carga, icono, comandos y ajustes.
2. Cambiar el nombre y la personalidad; probar arrastre, clic, menú, sueño y concentración en distintos paneles.
3. Redimensionar la ventana, desplazar carpetas y notas y verificar que el gato no bloquea controles ni queda fuera del área visible.
4. Crear un aviso a un minuto, posponerlo, cancelarlo y comprobar la recuperación tras cerrar y abrir Obsidian.
5. Probar una aclaración de fecha y revisar la confirmación final en la zona elegida.
6. Completar una tarea entre duplicados y revisar el diff de la nota. Repetir tras una edición concurrente: debe detenerse sin cambiar otra línea.
7. Vincular un aviso a una tarea, completar la tarea y comprobar su cancelación. Revisar también qué ocurre al renombrar o editar la tarea.
8. Desactivar el complemento y comprobar que desaparecen mascota, listeners y temporizadores; volver a activarlo sin duplicación.
9. Solo si se autoriza una prueba de IA: usar contexto ficticio, verificar autenticación y versión de CLI, ejecutar una consulta y cancelar otra.

## Qué no se ha probado

- Obsidian físico de escritorio, experiencia visual completa o compatibilidad con todos los temas y otros complementos.
- Android o iOS; esta versión es deliberadamente de escritorio.
- Entrega de avisos con la aplicación cerrada o en segundo plano móvil.
- Consultas reales autenticadas a Codex o Claude, sus cuotas o costes.
- Un puente real hacia conversaciones de Copilot, Miyo, Smart Connections o la API de TaskNotes.

Las pruebas de desarrollo usan datos ficticios y un vault de prueba aislado, ignorado por Git. No se instaló el complemento ni se modificaron notas en el vault personal como parte de estas comprobaciones. Consulta [LIMITATIONS.md](LIMITATIONS.md) para interpretar el alcance de los resultados.
