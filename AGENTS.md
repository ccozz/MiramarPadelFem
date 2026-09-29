# Directivas Permanentes de Arquitectura, UI/UX y Mobile-First

Este proyecto prioriza la experiencia en pantallas táctiles pequeñas (360px – 420px) antes de escalar a desktop.

---

## 1. Tipografía Oficial

### Familias Tipográficas
- **Titulares y Display**: `'Playfair Display', serif`
  - Utilizado en `h1`, `h2`, `h3`, números de fecha destacados y encabezados de torneos.
  - Pesos: 700, 800 (normal e itálica).
- **Cuerpo y UI**: `'DM Sans', sans-serif`
  - Utilizado en textos generales, tablas, botones, formularios, etiquetas y badges.
  - Pesos: 400 (regular), 500 (medium), 600 (semi-bold), 700 (bold).

### Reglas de Escala y Legibilidad Móvil
- **Inputs y Formularios**: Todos los `<input>`, `<select>` y `<textarea>` deben tener `font-size: 16px` como mínimo absoluto para evitar el zoom involuntario forzado por Safari en iOS.
- **Micro-copy y Badges**: Tamaño mínimo `11px` con `font-weight: 700` y `letter-spacing: .02em` a `.08em`.
- **Interlineado**: Mínimo `1.4` para texto de párrafo; títulos compactos entre `0.94` y `1.1`.

---

## 2. Paleta Oficial del Club (Light & Dark Tokens)

El sistema soporta modo claro y oscuro respetando los tokens CSS del club:

| Token | Modo Claro | Modo Oscuro | Uso Semántico |
|---|---|---|---|
| `--paper` | `#ffffff` | `#182627` | Superficie de tarjetas, modales y contenedores principales |
| `--cream` | `#f6f5f0` | `#101b1c` | Fondo base de página (body) |
| `--ink` | `#0d1b2a` | `#edf2ed` | Texto principal, contrastes y headers oscuros |
| `--muted` | `#64706a` | `#b5c2bb` | Texto secundario, subtítulos, placeholders y leyendas |
| `--line` | `#dfe5dd` | `#30423e` | Bordes estructurales, divisores y filetes |
| `--green` | `#19784a` | `#19784a` | Color identitario del club, estados activos y confirmación |
| `--green-light` | `#2ca968` | `#70df9f` | Hover de verde institucional y acento en modo oscuro |
| `--gold` | `#d4af37` | `#d4af37` | Acento premium del club, laureles, medallas y warnings |

### Regla Obligatoria de Paridad Dual (Light & Dark Mode)
- **Siempre ambos modos**: Absolutamente CADA componente, vista, pantalla, lista, tarjeta, modal, tabla, badge, botón o formulario que se cree o modifique DEBE diseñarse, implementarse y verificarse obligatoriamente con **paridad total tanto para Modo Claro como para Modo Oscuro** (`html[data-theme='dark']`).
- **Uso estricto de tokens semánticos**: Prohibido hardcodear colores fijos (`#fff`, `#000`, etc.) en fondos o textos sin su contraparte oscura. Se deben emplear siempre las variables CSS semánticas (`var(--paper)`, `var(--cream)`, `var(--ink)`, `var(--muted)`, `var(--line)`, etc.) o sobreescrituras explícitas en `html[data-theme='dark']` para asegurar contraste y legibilidad absoluta en ambos temas.

---

## 3. Código Semántico de Colores para Botones

Basado en las mejores prácticas de UI/UX (Material Design 3, Nielsen Norman Group y WCAG 2.2):

| Función | Clase CSS | Color Base | Color Hover / Dark | Acción / Contexto de Uso |
|---|---|---|---|---|
| **Primario / Éxito** | `.button--primary` | `#19784a` (`--green`) | `#2ca968` | Guardar torneo, confirmar cambios, avanzar de fase |
| **Inscripción / Alta** | `.button--blue`, `.button--blue-outline` | `#1976d2` | `#1565c0` / `#90caf9` | Inscribir nueva pareja, asociar pareja de otro torneo |
| **Transición de Fase** | `.button--purple` | `#6d28d9` | `#5b21b6` / `#7c3aed` | Cerrar inscripción y armar grupos / llaves (fase crítica) |
| **Edición / Ajuste** | `.button--edit` | `#d4af37` (`--gold`) | `#ffd768` | Modificar datos de torneo, ajustar cronograma o parejas |
| **Destructivo / Eliminar** | `.button--delete` | `#b94141` | `#d32f2f` / `#ff8a80` | Quitar pareja, eliminar torneo o resetear llaves |
| **Neutro / Cancelar** | `.button--cancel` | `#64706a` (`--muted`) | `#4b5563` | Descartar cambios sin guardar, cerrar diálogos |

---

## 4. Reglas Estrictas de UI/UX Mobile-First

### Áreas de Toque (Touch Targets)
- Todo elemento clickeable (botones, links de acción, botones de cierre de modal, tabs) debe medir como mínimo **48 × 48 px** (o tener padding suficiente para alcanzar ese área interactiva).
- Separación mínima de **8 px** entre botones adyacentes para prevenir toques accidentales.

### Formularios en Móviles
- En pantallas $\le 600\text{ px}$, los formularios deben estructurarse en **columna única** (`1fr`). Prohibido colocar campos en 2 columnas angostas en viewport móvil.
- Los `<label>` deben ubicarse siempre por encima del `<input>`, nunca depender únicamente de placeholders.
- Todos los inputs de texto, número, fecha y selects deben tener un tamaño de fuente de **al menos 16 px** para evitar que iOS Safari fuerce zoom automático.
- Usar atributos semánticos de teclado (`type="tel"`, `type="number"`, `inputmode="numeric"`, `autocomplete`).

### Modales y Diálogos
- Altura máxima restringida a `calc(100dvh - 24px)` con `overflow-y: auto` y `overscroll-behavior: contain`.
- Botón de cierre `×` táctil accesible en la esquina superior derecha ($\ge 44\times 44\text{ px}$).
- Las acciones de confirmación y guardado deben permanecer visibles o claramente alcanzables en la zona del pulgar (Thumb Zone).

### Prohibición Absoluta de Scroll Horizontal
- **Cero scroll horizontal**: NUNCA permitir desbordamiento ni scroll horizontal (`overflow-x: auto`, `scroll-snap-x` o scrollbars horizontales) en ninguna vista, pantalla, lista, tabla o modal. Si una estructura de datos excede el ancho en pantallas móviles ($\le 600\text{px}$), debe reestructurarse obligatoriamente en tarjetas o bloques apilados verticales al 100% de ancho.

### Límite Estricto en Vistas Compactas
- **Máximo 3 a 4 líneas**: Las vistas compactas (filas de torneos, parejas, partidos, padrón o resúmenes) no deben exceder **3 a 4 líneas** de altura total en pantallas móviles, condensando el contenido en datos clave y acciones directas.

