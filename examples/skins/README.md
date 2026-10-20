# Paquetes de sprites locales

Miauwi incluye un gato negro original en SVG y permite sustituirlo por una hoja de sprites PNG o WebP de tu autoría. El paquete se lee desde el vault y no necesita conexión ni agente de IA.

1. Guarda una imagen, por ejemplo `Miauwi/skins/mi-gato/cat.png`.
2. Guarda un manifiesto `Miauwi/skins/mi-gato/skin.json` junto a ella.
3. En **Ajustes → Miauwi → Paquete de sprites JSON**, indica la ruta del manifiesto.
4. Borra esa ruta para recuperar el dibujo original.

El campo `image` es una ruta relativa al manifiesto. Usa imágenes locales, sin URL, `..` ni rutas absolutas. El cargador admite PNG y WebP; no inyecta SVG personalizados.

```json
{
  "image": "cat.png",
  "frameWidth": 64,
  "frameHeight": 64,
  "columns": 4,
  "states": {
    "idle": { "row": 0, "frames": 4, "fps": 4 },
    "walk": { "row": 1, "frames": 4, "fps": 8 },
    "sleep": { "row": 2, "frames": 2, "fps": 2 },
    "celebrate": { "row": 3, "frames": 4, "fps": 8 }
  }
}
```

Para este ejemplo, dibuja una imagen de **256 × 256 px**, con cuatro columnas y cuatro filas de cuadros de 64 × 64 px, sobre fondo transparente. El ejemplo describe el formato; no incluye una imagen de terceros.

- Las filas empiezan en `0`; cada animación usa los primeros `frames` cuadros de su fila.
- Cada cuadro debe ocupar la misma celda. Para conservar proporciones, usa celdas cuadradas. El tamaño del personaje se adapta al ajuste de tamaño de Miauwi.
- `columns`: entero entre 1 y 128. `frameWidth` y `frameHeight`: enteros entre 1 y 4096.
- `row`: entero entre 0 y 255. `frames`: entero entre 1 y `columns`. `fps`: número mayor que 0 y hasta 30.
- La altura de la hoja debe corresponder a la última fila declarada más una. No dejes filas adicionales sin declarar al final.
- Define `idle` como alternativa: cuando falta una animación se usa `idle`; si tampoco existe una alternativa válida, aparece el gato SVG original.
- Los estados admitidos son `idle`, `walk`, `run`, `jump`, `climb`, `sit`, `stretch`, `yawn`, `sleep`, `wake`, `hide`, `fall`, `look`, `chase`, `peek`, `hang`, `celebrate` y `drag`.
- El movimiento del personaje sigue a cargo del motor: los cuadros ilustran el estado. La dirección se refleja automáticamente.
- Con movimiento reducido se muestra el primer cuadro, sin animación. Las animaciones se pausan cuando el documento queda oculto.

El original está en [`assets/cat.svg`](../../assets/cat.svg) y se publica bajo la licencia MIT del proyecto. Puedes partir de él para dibujar tus propias variantes. Conserva las atribuciones y licencias de cualquier recurso que incorpores.
