# Prompts editables

Estos nueve archivos reproducen las instrucciones incluidas en `src/resources.ts`. Sirven como punto de partida para personalizar el comportamiento del agente opcional; no activan IA ni autorizan el acceso a archivos por sí mismos.

El comando **Crear recursos** genera copias en `<carpeta-de-recursos>/prompts/` cuando faltan. La carpeta predeterminada es `Miauwi`. Si editas un archivo existente, el complemento lo lee en las consultas de esa categoría. Se aplican límites de longitud y las restricciones de contexto y respuesta del código siguen vigentes.

| Archivo | Propósito |
| --- | --- |
| [explorar-vault.md](explorar-vault.md) | Hallazgo con evidencia del contexto adjunto |
| [comentar-nota.md](comentar-nota.md) | Comentario breve sobre la nota autorizada |
| [conexiones-academicas.md](conexiones-academicas.md) | Relación entre conceptos aportados |
| [notas-olvidadas.md](notas-olvidadas.md) | Sugerencia de revisión sin inventar lecturas |
| [revisar-ortografia.md](revisar-ortografia.md) | Propuestas de corrección, sin edición automática |
| [revisar-propiedades.md](revisar-propiedades.md) | Revisión según reglas aportadas |
| [revisar-tareas.md](revisar-tareas.md) | Resumen y sugerencias sobre tareas adjuntas |
| [generar-dialogo.md](generar-dialogo.md) | Conversación breve según personalidad |
| [sorpresa.md](sorpresa.md) | Conexión interesante sin repetir hallazgos |

Tener un prompt disponible no implica que exista un botón o una consulta automática dedicada para cada categoría. La interfaz actual utiliza las categorías que invoca su código; las demás quedan como recursos de personalización y desarrollo. No añadas credenciales, instrucciones para ejecutar comandos ni rutas privadas a ejemplos que vayas a compartir.
