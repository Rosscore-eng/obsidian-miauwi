# Motor de la mascota

El dibujo negro de ojos verdes es una creación original del proyecto, disponible en `assets/cat.svg` y construido también desde `src/pet/art.ts`. No utiliza imágenes remotas ni recursos de otra mascota. La licencia del dibujo es MIT, igual que el código.

## Interacción

La mascota es un botón accesible con nombre actualizado. Un clic o la activación por teclado abre el chat y muestra una caricia; si duerme, primero se despierta. El clic derecho abre las opciones. Se puede arrastrar con ratón, lápiz o pantalla táctil. El arrastre usa captura del puntero y no abre el chat al soltar. Los mensajes tienen cierre accesible y se muestran como texto literal.

El overlay no captura eventos fuera del gato y su burbuja. Los mensajes se colocan debajo del gato cuando está cerca del borde superior, para mantenerlos visibles. El código toma `ownerDocument` y `defaultView` del contenedor, para funcionar cuando se monta en una ventana emergente.

## Estados y movimiento

La máquina incluye `idle`, `walk`, `run`, `jump`, `climb`, `sit`, `stretch`, `yawn`, `sleep`, `wake`, `hide`, `fall`, `look`, `chase`, `peek`, `hang`, `celebrate` y `drag`. Los estados tienen poses o animaciones CSS distintas. Caminar, correr, perseguir, saltar, escalar y caer también cambian la posición. Se interrumpen al interactuar, arrastrar, dormir, ocultar o entrar en concentración.

El motor observa títulos visibles de carpetas y archivos, cabeceras de pestañas y paneles del espacio de trabajo. Lee su geometría sin modificar los nodos de Obsidian. Sus selectores internos se consideran una aproximación visual: si el tema cambia la estructura, utiliza el suelo seguro de la ventana. Cuando desaparece o se desplaza una superficie, el gato cae a otra superficie válida o al suelo. No hay colisiones físicas con el contenido de las notas ni escalada real por cada borde de un panel.

Los cambios de geometría se agrupan. Los observadores de tamaño conservan las suscripciones existentes para evitar ciclos. El dibujo por JavaScript se limita a 30 actualizaciones por segundo durante desplazamientos; fuera de ellos no se mantiene un bucle de `requestAnimationFrame`. Los movimientos de ojos siguen al puntero. En concentración permanece sentado y los recordatorios siguen disponibles. Tras el tiempo de inactividad configurado, duerme hasta que vuelve la actividad o se le despierta explícitamente. Dormir con el comando requiere un despertar explícito o tocar al gato.

Las opciones de movimiento reducido y las preferencias del sistema eliminan las animaciones y los desplazamientos autónomos. Ocultar la mascota cancela sus temporizadores; ocultar el documento pausa el motor y las animaciones. Al destruirlo se cancelan los temporizadores y fotogramas pendientes, se desconectan los observadores y se eliminan todos los listeners registrados por el controlador.

## Personalidades editables

`examples/personalities/profiles.json` contiene los cinco perfiles originales: `travieso`, `cientifico`, `adorable`, `caotico` y `academico`. El comando para crear recursos locales los copia al vault mediante una acción explícita. Selecciona después ese JSON en el ajuste de personalidades; conserva los identificadores de los perfiles para elegirlos en la lista de ajustes.

Cada perfil contiene nombre visible, descripción, estilo lingüístico, frecuencia de bromas, curiosidad, sociabilidad, tendencia al sueño, reacciones, animaciones preferidas, frases y un `prompt` opcional. `weights` controla la selección de estados; `activity` y `speed` modifican el movimiento. Los campos narrativos están disponibles para la interfaz y los adaptadores; el motor visual utiliza principalmente `weights`, `activity`, `speed` y la reacción `note`. El tiempo hasta dormir lo establece el ajuste global de inactividad. La validación rechaza JSON inválido, números fuera de rango y estados desconocidos; completa los campos descriptivos omitidos.

Al abrir una nota, tocar una carpeta o acariciar al gato, el motor puede elegir una de sus `phrases` sin consultar a una IA. `sociability` y `jokeFrequency` regulan la probabilidad de que hable. Deja al menos 45 segundos entre frases y excluye la frase anterior: con una única frase disponible, no la repite de forma consecutiva. No comenta cada animación ni sustituye un mensaje o recordatorio ya abierto. Guarda silencio espontáneo en concentración y durante las horas de silencio que comunica el controlador principal. El movimiento reducido conserva este diálogo local. Los mensajes explícitos y recordatorios enviados con `say()` siguen disponibles aunque el diálogo espontáneo esté silenciado.

Consulta [`examples/skins/README.md`](../examples/skins/README.md) para hojas de sprites locales. No se ejecuta código de los manifiestos ni del texto de personalidades.

## Verificación y límites

Las pruebas automatizadas de `tests/pet.test.ts` cubren límites, superficies, sueño, concentración, perfiles, interacción, arrastre, sprites, ventanas pequeñas y limpieza de recursos. Una prueba reproduce el desplazamiento horizontal de una carpeta después de que el gato se pose sobre ella. Las pruebas de diálogo verifican eventos reales de nota, carpeta y caricia, el intervalo mínimo, la ausencia de repetición consecutiva y el silencio por concentración u horario.

La apariencia final y la captura de puntero deben verificarse manualmente en Obsidian, con temas claro y oscuro, paneles flotantes y pantallas táctiles. La documentación no afirma una verificación física en Android. La vista previa HTML local quedó bloqueada por la política del navegador de esta sesión y no se utilizó una ruta alternativa para eludirla.
