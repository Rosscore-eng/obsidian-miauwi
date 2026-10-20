# Instalación de Miauwi

## Requisitos

- Obsidian de escritorio con complementos de la comunidad habilitados.
- El manifiesto de esta versión declara Obsidian 1.6.0 como mínimo. Eso no equivale a una prueba real en todas las versiones posteriores.
- Un vault de prueba. Usa notas ficticias y evita empezar con archivos personales importantes.
- Node.js y npm únicamente si vas a compilar desde el código fuente.

Esta versión declara `isDesktopOnly: true`. No la instales como una solución de avisos para Android o iOS.

## Preparar los archivos

Si recibes `miauwi-1.0.0.zip`, descomprímelo y localiza `main.js`, `manifest.json` y `styles.css`. No basta con copiar el ZIP al vault. Si descargas el código fuente desde GitHub, sigue la sección de compilación para generar los archivos necesarios.

La estructura de instalación debe ser:

```text
<vault-de-prueba>/
└── .obsidian/
    └── plugins/
        └── miauwi/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

Los ejemplos son opcionales. El complemento no necesita que copies `src/`, `tests/`, `node_modules/` ni todo el repositorio dentro del vault.

## Activar en el vault de prueba

1. Abre el vault de prueba en Obsidian.
2. Copia los tres archivos a `.obsidian/plugins/miauwi/`.
3. Abre **Ajustes → Complementos de la comunidad** y habilita Miauwi. Puede ser necesario recargar Obsidian para que aparezca.
4. Abre sus ajustes, elige el nombre del gato y comprueba **Zona horaria**. Usa un identificador IANA, por ejemplo `America/Lima`.
5. Mantén el proveedor en **Sin IA** durante la primera prueba.
6. Abre la conversación desde el icono del gato o la paleta de comandos.

El nombre visible es personalizable; el identificador de instalación continúa siendo `miauwi`. No renombres su carpeta al cambiar el nombre del gato.

## Primera comprobación

Haz estas acciones solo en las notas de prueba:

1. Cambia el nombre y revisa las etiquetas de los comandos.
2. Prueba llamar al gato, dormirlo, ocultarlo y activar concentración.
3. Crea «Recuérdame probar el aviso dentro de un minuto». Revisa la confirmación y acepta. Mantén Obsidian abierto hasta recibirlo.
4. Pide «Recuérdame estudiar mañana». Responde a la pregunta de hora y comprueba la fecha final antes de confirmar.
5. Crea una nota con dos tareas de títulos iguales. Elige una mediante el selector y verifica que solo cambia esa línea.
6. Vincula un recordatorio a una tarea y complétala. Comprueba que su aviso deja de estar activo.
7. Desactiva y vuelve a activar el complemento. Comprueba la recuperación de recordatorios pendientes y que no quedan gatos duplicados.

La guía de [pruebas](TESTING.md) detalla lo comprobado automáticamente y lo que sigue pendiente en Obsidian real.

## Configurar IA opcional

1. Instala y autentica por separado una versión compatible de Codex CLI o Claude Code CLI.
2. En Miauwi, usa **Detectar agentes instalados** o proporciona la ruta absoluta al ejecutable. En Windows se espera un `.exe`, no un comando de shell.
3. Elige el proveedor y autoriza únicamente las carpetas de prueba que quieras aportar como contexto. La lista vacía no autoriza archivos.
4. Deja **Consultas periódicas → Solo manual** para comenzar. Configura el máximo por hora y el timeout.
5. Haz una consulta manual, comprueba la respuesta y prueba cancelarla cuando esté en curso.

La autenticación, disponibilidad de modelos, cuotas y cobros corresponden al proveedor. Detectar un ejecutable no demuestra que tenga sesión iniciada ni que acepte los argumentos de esta versión. Las CLI pueden cambiar; consulta [las limitaciones](LIMITATIONS.md) antes de usarlas con datos reales.

## Recursos editables

**Crear recursos** genera, en la carpeta configurada, subcarpetas para prompts, personalidades, recordatorios, memoria y skins. Inicializa los nueve prompts y el JSON de perfiles si todavía no existen; no sobrescribe archivos existentes. Los datos efectivos de recordatorios y memoria siguen en `data.json`: la existencia de esas subcarpetas no implica que haya un archivo por recordatorio.

Para aplicar un perfil editado, selecciona su ruta JSON en **Perfiles JSON personalizados**. Los sprites requieren un paquete JSON y una imagen PNG o WebP local compatible; consulta [el formato](../examples/skins/README.md).

## Compilar desde el repositorio

Desde la carpeta del proyecto:

```sh
npm ci
npm run check
npm run package
```

`check` incluye la comprobación de tipos, las pruebas y la compilación. `package` prepara el paquete de distribución. Copia los tres archivos de `dist/miauwi/` al vault de prueba. No ejecutes comandos de instalación apuntando al vault personal por defecto.

Para actualizar, cierra o deshabilita el complemento, conserva una copia de `data.json` y reemplaza solo los archivos de distribución. Para retirarlo, deshabilítalo; borrar su carpeta también borra sus ajustes e historial local. No elimines la carpeta de recursos del vault sin revisar antes los archivos que hayas personalizado.
