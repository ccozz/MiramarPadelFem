---
name: mobile-first-ux
description: >-
  Audits, designs, and refactors web interfaces adhering to strict Mobile-First UI/UX principles,
  touch target standards (WCAG 2.2 / Material Design 3), ergonomic thumb-zone placements, and responsive vanilla CSS/HTML.
---

# Mobile-First UX/UI Skill & Protocol

Esta skill proporciona los protocolos de diseño e implementación móvil para Vanilla JS y CSS modular en Miramar Padel Fem.

## 1. Tipografía Oficial
- **Titulares y Display**: `'Playfair Display', serif` (700, 800).
- **Cuerpo y UI**: `'DM Sans', sans-serif` (400, 500, 600, 700).
- **Inputs**: $\ge 16\text{ px}$ en formularios móviles para evitar zoom en iOS.

## 2. Paleta del Club (Light / Dark)
- `--paper`: `#ffffff` / `#182627`
- `--cream`: `#f6f5f0` / `#101b1c`
- `--ink`: `#0d1b2a` / `#edf2ed`
- `--muted`: `#64706a` / `#b5c2bb`
- `--line`: `#dfe5dd` / `#30423e`
- `--green`: `#19784a` (acento: `#2ca968` / `#70df9f`)
- `--gold`: `#d4af37` (acento: `#ffd768` / `#f3c84b`)

## 3. Código Semántico de Botones
- **Verde (`.button--primary`)**: Confirmar, guardar, crear torneo.
- **Azul (`.button--blue`, `.button--blue-outline`)**: Inscribir o asociar parejas.
- **Púrpura (`.button--purple`)**: Cerrar inscripciones y armar llaves (transición de fase crítica).
- **Dorado (`.button--edit`)**: Modificar o editar entidades.
- **Rojo (`.button--delete`)**: Quitar pareja o eliminar torneo.
- **Gris (`.button--cancel`)**: Cancelar acción o cerrar modal sin guardar.

## 4. Checklist de Verificación para Cada Componente:

1. **Touch Target Checklist**:
   - [ ] ¿El control mide al menos 48 × 48 px en su bounding box interactivo?
   - [ ] ¿Hay al menos 8 px de margen con el elemento adyacente más cercano?

2. **Formularios Mobile**:
   - [ ] ¿El layout en pantallas de 360–600 px es estrictamente de 1 sola columna?
   - [ ] ¿Los campos de entrada usan fuente de $\ge 16\text{ px}$?
   - [ ] ¿Cada input cuenta con su `<label>` asociado visible por encima?

3. **Diálogos y Modales**:
   - [ ] ¿Tiene límite de altura `max-height: calc(100dvh - 24px)` con `overflow-y: auto`?
   - [ ] ¿Tiene botón de cierre táctil accesible ($\ge 44\times 44\text{ px}$)?
   - [ ] ¿Las acciones de confirmación y guardado están al pie de forma visible en la thumb zone?
