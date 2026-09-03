# Nexbyte — Landing ecommerce tecnológico

Landing page completa con **dark/light mode**, animaciones con **[Motion](https://motion.dev)**,
carrito funcional, buscador en vivo y diseños móviles.

## Archivos

| Archivo | Qué es |
|---|---|
| **`index.html`** | La landing. Archivo único autocontenido — **doble clic y funciona**, sin servidor ni `npm install`. |
| **`mobile.html`** | Las 6 pantallas móviles en carcasas de iPhone + especificación técnica (breakpoints, targets, movimiento). |
| `src/index.template.html` | Plantilla HTML (fuente editable). |
| `src/styles.css` | Sistema de diseño: tokens, temas, componentes, responsive. |
| `src/app.js` | Lógica: Motion, carrito, buscador, tema, render del catálogo. |
| `build.py` | Inyecta `src/` dentro de `index.html`. |

> `index.html` es **generado**. Edita los archivos de `src/` y ejecuta `python build.py`.

```bash
python build.py      # regenera index.html
```

Para desarrollar con recarga cómoda (opcional):

```bash
python -m http.server 8787
# http://127.0.0.1:8787/index.html
```

## Secciones

`Barra de avisos` · `Header sticky` · **Hero** · `Marquee de marcas` · **Ofertas** (cuenta atrás
real hasta medianoche + barra de stock) · **Categorías** · **Catálogo** (filtros + 10 productos)
· `Ventajas` · `Newsletter` · `Footer` — más 3 overlays: **buscador**, **carrito** y **menú móvil**.

## Funcionalidad

- **Carrito**: añadir/quitar, cantidades, subtotal, barra de envío gratis (59 €), persistencia en `localStorage`.
- **Buscador**: `⌘K` / `Ctrl+K`, búsqueda en vivo sobre nombre, categoría y etiquetas (insensible a tildes),
  navegación con ↑↓ y Enter, y salto al producto en el catálogo.
- **Tema**: respeta `prefers-color-scheme`, se puede forzar y se recuerda entre visitas.
- **Animaciones**: reveal por scroll, stagger en grids, contadores, parallax de orbes, marquee infinito,
  hover magnético, tilt 3D, drawer y overlays.

## Sistema de diseño

Tokens en tres capas (primitivas → semánticas → componente) sobre variables CSS.
Cambiar de tema solo reasigna la capa semántica.

| | Light | Dark |
|---|---|---|
| Fondo | `#FAFAFC` | `#0A0A0F` |
| Superficie | `#FFFFFF` | `#131320` |
| Texto | `#0B0B12` | `#F5F5FA` |
| Acento | `#6D5EF8` | `#8B7EFF` |
| Acento 2 | `#0E9EBC` | `#22D3EE` |

Tipografía: **Space Grotesk** (titulares) + **Inter** (texto).
Breakpoints: `420` · `720` · `960` · `1120` px.

## Notas de implementación

- **Motion se carga por CDN con degradación elegante**: si el import falla (sin red, CDN caído),
  se registra un aviso en consola y la web funciona igual, con todo el contenido visible.
- **`prefers-reduced-motion` se respeta**: con la opción activa no se ejecuta ninguna animación
  y el contenido se muestra directamente en su estado final.
- Los productos usan **SVG inline** que heredan los tokens del tema — sin imágenes externas,
  así que la página se ve idéntica offline.
- Parámetros de depuración usados por `mobile.html`: `?theme=dark|light`, `?screen=cart|search|menu`,
  `?q=…`, `?seed=cart` (este último no escribe en `localStorage`).

## Próximos pasos sugeridos

1. Sustituir los SVG de producto por fotografía real (`<picture>` con AVIF/WebP y `loading="lazy"`).
2. Conectar `PRODUCTS` a la API real y mover el carrito a servidor para stock y precios en vivo.
3. Portar a componentes (React/Astro) usando `src/styles.css` tal cual como capa de tokens.
