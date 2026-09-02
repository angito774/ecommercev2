# CLAUDE.md — E-commerce Tech

Proyecto de e-commerce de tecnología en Next.js 16, con módulos de **cliente**
(storefront) y **administración**. Este archivo es el contrato de trabajo: se lee
en cada sesión y gobierna cómo se procesa cada prompt.

---

## 1. Regla de entrada — obligatoria

**Ante CUALQUIER petición del usuario, el primer paso es clasificarla con el
agente `orchestrator`.** No se escribe código, no se crean archivos y no se
instalan dependencias antes de esa clasificación.

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

Excepción única: si el usuario indica explícitamente el modo, se respeta sin
volver a clasificar.

---

## 2. Agentes

Definidos en `.claude/agents/`. Se invocan con la herramienta Agent.

| Agente | Archivo | Responsabilidad | Entregable |
|---|---|---|---|
| **orchestrator** | [.claude/agents/orchestrator.md](.claude/agents/orchestrator.md) | Clasifica el prompt: SDD o modo build por defecto | Bloque de decisión |
| **spec** | [.claude/agents/spec.md](.claude/agents/spec.md) | Entiende el requerimiento y produce el spec con tareas atómicas. **Se detiene y espera aprobación humana** | `docs/specs/NNN-slug.md` |
| **developer** | [.claude/agents/developer.md](.claude/agents/developer.md) | Ejecuta las tareas del spec aprobado bajo la arquitectura Next.js, SOLID y DRY | Código + tareas marcadas |
| **reviewer** | [.claude/agents/reviewer.md](.claude/agents/reviewer.md) | Audita la implementación contra spec y arquitectura; devuelve hallazgos al developer en bucle | Veredicto + hallazgos |

La cadena la conduce la sesión principal: cada agente termina su turno con un
handoff explícito y la sesión invoca al siguiente. Los agentes no se invocan
entre sí.

---

## 3. Puerta de aprobación humana

**Ningún código se escribe sobre un spec en `status: draft`.**

Cuando `spec` termina, se muestra la ruta del archivo y la sesión **se detiene**.
El usuario responde `aprobado` (o pide cambios). Solo entonces el spec pasa a
`status: approved` y se invoca a `developer`.

Ciclo de vida del spec:

```
draft ──(aprobación humana)──► approved ──► in-progress ──► in-review ──► done
                                                  ▲              │
                                                  └── RECHAZADO ─┘  máx. 3 vueltas
```

Si el bucle developer ⇄ reviewer llega a 3 iteraciones sin converger, se detiene
y se escala al usuario. No se sigue girando.

---

## 4. Arquitectura

La estructura de carpetas, el stack completo y el flujo de datos están en
**[docs/SETUP.md](docs/SETUP.md)**. Es de lectura obligatoria para `spec`,
`developer` y `reviewer`, y no se improvisan rutas fuera de ella.

Resumen del flujo:

```
Componente → hook (TanStack Query) → service (axios) → Route Handler
           → repositorio → Drizzle → Neon Postgres
```

Reglas duras (la violación es bloqueante en review):

1. Un componente nunca importa `db`, Drizzle ni un repositorio.
2. Un componente nunca llama `axios`/`fetch` directo: va en `services/`, se consume vía hook.
3. Toda consulta a BD vive en `src/server/repositories/`.
4. Todo Route Handler valida su entrada con Zod antes de tocar datos.
5. Los tipos se infieren del schema Drizzle; no se duplican a mano.
6. Datos de servidor → TanStack Query. Estado de UI → Zustand. Sin mezclar.
7. `"use client"` lo más abajo posible en el árbol.
8. La autorización vive en el **recurso**, no en el borde. Toda page, layout, Route Handler y Server Function que lea o mute datos protegidos se verifica a sí misma: `await auth()` para la sesión y el código de permiso para la autorización. Las pages usan `requirePagePermission()` (devuelve `403` con `src/app/forbidden.tsx`); los Route Handlers usan `authorize()` (devuelve `403` con `{ message }`). Un handler bajo `/api/admin/` sin esa verificación es hallazgo bloqueante aunque `proxy.ts` cubra la ruta. La tabla de formas exactas está en §6 de [docs/SETUP.md](docs/SETUP.md).
9. `src/proxy.ts` (Next 16 renombró `middleware.ts` → `proxy.ts`) no lleva lógica de auth: solo `clerkMiddleware()` y su `matcher`. Las rutas son públicas por defecto y el proxy no cuenta como capa de seguridad. La forma exacta de verificar según el tipo de recurso está en §6 de [docs/SETUP.md](docs/SETUP.md).
10. Comparar nombres de rol en el código (`role === 'admin'`) es hallazgo bloqueante. La verificación es siempre por código de permiso.
11. `audit_logs` es append-only y se escribe en la misma transacción que la mutación auditada. Sin PII sensible ni secretos en el log.

---

## 5. Stack

Next.js 16 · React 19 · TypeScript strict · Tailwind 4 · shadcn/ui ·
Neon Postgres · Drizzle ORM · Clerk · TanStack Query v5 · TanStack Table v8 ·
Axios · Zustand · Recharts · Zod · React Hook Form.

Gestor de paquetes: **npm**. Detalle de versiones e instalación en
[docs/SETUP.md](docs/SETUP.md).

---

## 6. Estándares de código

- TypeScript estricto. Cero `any`, cero `@ts-ignore`.
- SOLID: un archivo, una responsabilidad. Extender por composición, no por `if` creciente.
- DRY con criterio: se extrae a la tercera repetición, no antes. Nada de abstracciones con un solo consumidor.
- Estados de carga y error obligatorios en toda vista que consuma datos.
- Errores propagados, nunca tragados con `catch {}`.
- Precios en enteros (centavos). Nunca `float`.
- Componentes shadcn vía `npx shadcn@latest add`, no escritos a mano.
- Comentarios solo para el *porqué* no obvio, nunca para el *qué*.

Verificación antes de dar por cerrada cualquier tarea:

```bash
npm run typecheck && npm run lint && npm run build
```

---

## 7. Comandos

```bash
npm run dev          # servidor de desarrollo (Turbopack)
npm run build        # build de producción
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:generate  # generar migración Drizzle
npm run db:migrate   # aplicar migraciones a Neon
npm run db:studio    # explorador de datos
npm run db:seed      # datos de prueba
```

---

## 8. Skills

Los cuatro agentes tienen la herramienta `Skill` habilitada. **Antes de resolver
una tarea con conocimiento de memoria, revisa si existe una skill instalada que
la cubra y úsala.** Las skills traen la documentación vigente del stack; la
memoria del modelo se desactualiza.

### Regla de uso

1. Consulta el listado de skills disponibles en tu sesión. **No inventes nombres**:
   si la skill del mapa no aparece instalada, sigue sin ella y dilo.
2. Invoca la skill **antes** de escribir código o el spec, no después de fallar.
3. Anuncia qué skill usas y para qué en una línea: `Usando <skill> para <fin>`.
4. Una skill de proceso (brainstorming, systematic-debugging) fija el enfoque;
   luego entran las de implementación (nextjs, shadcn, dataviz).
5. Las skills complementan este documento, no lo sustituyen. Si una skill sugiere
   una estructura distinta a `docs/SETUP.md`, gana `docs/SETUP.md`.

### Mapa tarea → skill

| Cuando la tarea toca | Skill |
|---|---|
| App Router, Server Components, Route Handlers, caché, PPR | `vercel:nextjs`, `vercel:next-cache-components` |
| Rendimiento React/Next, re-renders, bundle | `vercel:react-best-practices`, `vercel-react-best-practices` |
| Componentes shadcn/ui | `vercel:shadcn` |
| Neon Postgres, conexión serverless, storage | `vercel:vercel-storage` |
| Variables de entorno, `.env`, claves | `vercel:env-vars` |
| Clerk — instalación inicial | `clerk-setup` |
| Clerk — proxy, Server Actions, caché en Next | `clerk-nextjs-patterns` |
| Clerk — webhooks de sincronización de `users` | `clerk-webhooks` |
| Clerk — UI de auth a medida, theming | `clerk-custom-ui` |
| Clerk — operaciones sobre usuarios/orgs desde CLI o API | `clerk-cli`, `clerk-backend-api` |
| Gráficos del dashboard (Recharts), paletas, ejes, leyendas | `dataviz` |
| Diseño visual de UI nueva, jerarquía, tipografía | `frontend-design`, `ui-ux-pro-max:ui-ux-pro-max` |
| Accesibilidad y guidelines de interfaz | `web-design-guidelines` |
| Exploración del requerimiento antes de especificar | `superpowers:brainstorming` |
| Redacción de un plan multi-paso | `superpowers:writing-plans` |
| Bug, test rojo o comportamiento inesperado | `superpowers:systematic-debugging`, `investigate` |
| Cierre de tarea: comprobar antes de declarar hecho | `superpowers:verification-before-completion` |
| Revisión de diff | `code-review`, `superpowers:requesting-code-review` |
| Auth, permisos, datos sensibles, superficie de ataque | `security-review` |
| Deploy y CI en Vercel | `vercel:deployments-cicd`, `vercel:deploy` |

Skills de estilo de comunicación (`caveman`, `ponytail`) afectan la prosa, no las
decisiones técnicas del proyecto.

---

## 9. Documentación

`docs/specs/` es la documentación viva del proyecto: cada feature construida
deja su spec con contexto, decisiones técnicas, contratos de API y tareas
ejecutadas. Antes de proponer una feature, revisa si ya existe un spec que la
cubra.
