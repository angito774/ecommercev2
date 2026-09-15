# E-commerce Tech

Proyecto de e-commerce de tecnología en Next.js 16, con módulos de **cliente**
(storefront) y **administración**. Stack completo, arquitectura y comandos en
[docs/SETUP.md](docs/SETUP.md).

## Getting Started

```bash
npm install
npm run dev          # servidor de desarrollo (Turbopack)
```

Abre [http://localhost:3000](http://localhost:3000).

Otros comandos:

```bash
npm run build        # build de producción
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest
npm run db:generate  # generar migración Drizzle
npm run db:migrate   # aplicar migraciones a Neon
npm run db:studio    # explorador de datos
npm run db:seed      # datos de prueba
```

## Cómo se construye este proyecto: SDD (Spec-Driven Development)

Este repo no se desarrolla escribiendo código directamente a partir de un
prompt. Cada petición pasa primero por un agente `orchestrator` que decide
el modo de trabajo:

```
Prompt del usuario
        │
        ▼
  ┌──────────────┐
  │ orchestrator │  clasifica: ¿SDD o BUILD?
  └──────┬───────┘
         │
   ┌─────┴──────────────────────────────┐
   │                                    │
 MODO: SDD                          MODO: BUILD
   │                                    │
   ▼                                    ▼
 spec ──► ⏸ APROBACIÓN HUMANA ──► developer ⇄ reviewer ──► done
                                                 (bucle, máx. 3)
```

- **MODO: SDD** se activa para features nuevas, cambios de arquitectura,
  modelo de datos o superficie de negocio. El agente `spec` produce un
  documento en `docs/specs/NNN-slug.md` con contexto, alcance, modelo de
  datos, contratos de API y una lista de tareas atómicas, y **se detiene**
  a esperar aprobación humana explícita. Ningún código se escribe sobre un
  spec en `status: draft`.
- **MODO: BUILD** cubre tareas mecánicas (correr comandos, diagnósticos,
  documentación de proceso) que no requieren pasar por spec.
- Una vez el spec está `approved`, el agente `developer` ejecuta sus tareas
  y el agente `reviewer` audita el resultado contra el spec y la
  arquitectura de `docs/SETUP.md`. Si hay hallazgos bloqueantes, el trabajo
  vuelve al developer en bucle (máx. 3 vueltas; si no converge, se escala
  al humano).

Cada feature construida deja su spec en `docs/specs/` como documentación
viva: contexto, decisiones técnicas y contratos. Antes de proponer una
feature nueva, se revisa si ya existe un spec que la cubra.

El detalle completo de agentes, puerta de aprobación y ciclo de vida del
spec está en [CLAUDE.md](CLAUDE.md).

## Reglas al usar IA como fuente de verdad del código

La IA (vía Claude Code) es quien escribe la mayor parte del código de este
proyecto, así que el código generado se rige por reglas duras y verificables,
no por buen criterio caso a caso:

1. **Ningún código sin spec aprobado.** El humano aprueba explícitamente
   (`aprobado`) antes de que `developer` toque el spec. La IA no interpreta
   silencio o ambigüedad como aprobación.
2. **La arquitectura es fija, no se improvisa.** `docs/SETUP.md` define la
   estructura de carpetas y el flujo de datos
   (`Componente → hook (TanStack Query) → service (axios) → Route Handler → repositorio → Drizzle → Neon`).
   Un componente nunca importa `db`/Drizzle/repositorio directo, ni llama
   `axios`/`fetch` fuera de `services/`.
3. **La autorización vive en el recurso, no en el borde.** Toda page, layout,
   Route Handler o Server Function que toque datos protegidos se verifica a
   sí misma (`requirePagePermission()` / `authorize()`). `src/proxy.ts` no
   contiene lógica de auth y no cuenta como capa de seguridad. Comparar
   `role === 'admin'` en código es hallazgo bloqueante — la verificación es
   siempre por código de permiso.
4. **Tipos derivados, no duplicados.** Los tipos salen del schema Drizzle;
   toda entrada a un Route Handler se valida con Zod antes de tocar datos.
5. **TypeScript estricto.** Cero `any`, cero `@ts-ignore`. Errores propagados,
   nunca tragados con `catch {}`. Precios en enteros (centavos), nunca `float`.
6. **`audit_logs` es append-only** y se escribe en la misma transacción que
   la mutación auditada, sin PII sensible ni secretos.
7. **Revisión obligatoria antes de cerrar cualquier tarea:**
   ```bash
   npm run typecheck && npm run lint && npm run build
   ```
8. **Las skills traen la documentación vigente del stack** (Next.js, shadcn,
   Clerk, dataviz, etc.); se consultan antes de resolver de memoria, porque
   el conocimiento del modelo se desactualiza.

El contrato completo de estas reglas, con el detalle bloqueante por regla,
está en [CLAUDE.md §4 y §6](CLAUDE.md#4-arquitectura).

## Stack

Next.js 16 · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui ·
Neon Postgres · Drizzle ORM · Clerk · TanStack Query v5 · TanStack Table v8 ·
Axios · Zustand · Recharts · Zod · React Hook Form.

Detalle de versiones e instalación en [docs/SETUP.md](docs/SETUP.md).
