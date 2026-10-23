# GAME_DESIGN.md — Puzzle infinito de lagartos (nombre provisional: **Slink**)

> Documento maestro del juego. Pensado para uso personal (autoconsumo), jugable en móvil y con niveles que se van añadiendo con el tiempo.
> Inspiración: la mecánica de "arrastrar bichos de colores hasta su agujero". Tema, nombre, arte y niveles son propios (no reutilizar assets ni nombre del juego original).

---

## 1. Visión

- Puzzle de lógica espacial en rejilla. Cada nivel tiene varios lagartos de distintos colores y longitudes y un tablero con agujeros.
- Objetivo: meter **todos** los lagartos en el agujero de su color antes de que se acabe el tiempo.
- **Infinito**: no hay "último nivel". La dificultad crece mediante una lista de **herramientas (mecánicas)** que se van desbloqueando por tramos de niveles, y luego mediante combinaciones y escalado de parámetros.
- **Vivo**: los niveles son datos (JSON). Cada vez que se generan o diseñan nuevos y se publica la web, aparecen en el juego sin tocar código.
- **Móvil primero**: PWA instalable en la pantalla de inicio, vertical, controles táctiles.

### Principios de diseño
1. Reglas simples, consecuencias complejas.
2. Cada mecánica nueva se enseña con un nivel tutorial (sin tiempo agobiante) antes de mezclarse.
3. Todo nivel debe ser **resoluble** (verificado por solver, no "por fe").
4. Fallar cuesta poco: reiniciar es instantáneo.
5. Sensación al arrastrar (feel) > cantidad de contenido.

---

## 2. Reglas base

### 2.1 Tablero
- Rejilla `W x H` (rango típico 5x5 → 12x12; en móvil vertical prima la altura).
- Cada celda puede ser: `vacía`, `muro`, `agujero(color)` o contener parte de un lagarto.
- Movimiento solo en 4 direcciones (arriba, abajo, izquierda, derecha).

### 2.2 Lagartos
- Un lagarto es una secuencia ordenada de celdas contiguas: `cells[0]` = un extremo, `cells[n-1]` = el otro. **Ambos extremos son equivalentes** (se puede arrastrar de cualquiera).
- Tiene `color` y `longitud` (2 a 6 celdas, según progresión).
- Longitud constante: no crece ni encoge.

### 2.3 Movimiento (arrastre)
1. El jugador pulsa sobre un **extremo** de un lagarto y arrastra.
2. El extremo agarrado avanza a una celda adyacente **libre**; el extremo opuesto se retira una celda (el cuerpo sigue el rastro, tipo *Snake*).
3. Una celda es libre si: está dentro del tablero, no es muro, no está ocupada por otro lagarto y no es parte del propio cuerpo (excepción: la celda que la cola está dejando libre en ese mismo paso). El "cuello" (celda contigua al extremo agarrado) nunca es enterable: en un lagarto de 2 celdas equivaldría a darle la vuelta en el sitio.
4. Si el dedo se mueve a una celda no adyacente, se calcula el camino (BFS por celdas libres) y se avanza paso a paso; si no hay camino, el lagarto se queda donde está (con pequeño "rebote" visual).
5. Los movimientos son reversibles: arrastrar de vuelta deshace el camino.

### 2.4 Agujeros
- Un agujero tiene un `color` y una celda.
- Un lagarto solo puede entrar en un agujero de **su mismo color**. Para el resto de colores el agujero actúa como muro.
- Cuando el extremo agarrado entra en el agujero correcto, el lagarto **se "mete" solo** (el cuerpo termina de entrar por animación) y cuenta como **salvado**. El agujero queda consumido (capacidad 1 por defecto). Un agujero lleno **desaparece**: su celda pasa a ser suelo normal y cualquier lagarto puede transitar por ella (decisión del dueño del juego tras probar la Fase 2).
- Al salvarse, sus celdas quedan libres de inmediato (la animación de "tragado" es solo visual).

### 2.5 Tiempo
- Cada nivel tiene `timeLimit` (segundos). El reloj arranca en el **primer toque**.
- Si llega a 0 → derrota (mostrar "casi", cuántos faltaban) y botón de reintento inmediato.
- Tiempo restante al ganar → estrellas.

### 2.6 Victoria y puntuación
- Victoria: todos los lagartos salvados.
- Estrellas: ★ completar · ★★ con >= 30% de tiempo restante · ★★★ con >= 60% de tiempo restante (umbrales ajustables por nivel).

### 2.7 Controles auxiliares
- **Reiniciar** nivel (siempre disponible, sin penalización).
- **Deshacer** último movimiento completo (arrastre) — ilimitado al inicio; puede convertirse en recurso limitado más adelante.
- Pausa (detiene reloj).

---

## 3. Mecánicas

El catálogo es **abierto**: se añaden mecánicas a medida que se diseñan, sin número de nivel fijado de antemano. Cada una entra en el juego cuando se termina (ver 4.1.b).

| ID | Mecánica | Comportamiento | Estado | Debut |
|----|----------|----------------|--------|-------|
| `base` | Arrastre + agujeros de color | Reglas de la sección 2 | Implementada | Nivel 1 |
| `walls` | Muros | Celdas infranqueables que crean pasillos (básica) | Implementada | Nivel 6 |
| `lengths` | Longitudes variables | Lagartos de 2 a 6 celdas (básica) | Implementada | Nivel 12 |
| `fragile` | Hojas frágiles | Se cruzan una sola vez; luego son muro | Implementada | Nivel 20 |
| `locked-holes` | Candados | El agujero se abre cuando N geckos ya han entrado en otros | Implementada | Nivel 51 |

El banco completo de ideas, con su estado, está en [`docs/mechanics/IDEAS.md`](docs/mechanics/IDEAS.md). La fuente de verdad del debut es `manifest.timeline`.

- **Básicas** (`basic: true`): vocabulario del tablero. Una vez presentadas están en todos los niveles y no gastan presupuesto de complejidad.
- **Giros** (el resto): entran y salen de los niveles según el currículo.

> Regla de oro: **una mecánica nueva aparece primero sola** en sus niveles de adaptación, luego en niveles de profundización con intensidad creciente, y después entra en el pool de combinaciones.

---

## 4. El "infinito"

Un nivel se describe por **datos**, no por código. Hay dos fuentes de niveles que conviven:

1. **Handcrafted**: niveles diseñados a mano (tutoriales, hitos, "jefes" cada 25 niveles).
2. **Generados**: producidos por un generador con semilla y validados por un solver.

### 4.1 Curva de dificultad
- Dificultad objetivo `D(n)` crece con el nivel `n`, pero en **dientes de sierra**: cada pack de 10 niveles sube, y el nivel 10 es un pico; el siguiente pack baja un poco y vuelve a subir. Evita la fatiga.
- Parámetros que escalan: nº de lagartos, tamaño de tablero, longitud media, nº de muros/obstáculos, nº de herramientas activas, tiempo disponible (baja), distancia solución mínima.

```
n -> {
  mechanics:   según el currículo (4.1.b),
  gridSize:    min(12, 5 + floor(n / 20)),
  geckos:      min(12, 2 + floor(n / 8)),      // v1: más denso que el /12 original; con poca densidad no hay cruces
  timeFactor:  max(0.5, 1.0 - n / 600),   // multiplica el tiempo base de la solución
  saw:         0.9 + 0.25 * ((n - 1) % 10) / 9   // rampa: sube en el pack, pico en el nivel 10, baja en el 11
  dependency:  min(1, min(0.85, 0.25 + n / 150) * saw)   // fracción objetivo de lagartos "dependientes" (ver 4.4)
}
```

### 4.1.b Progresión de mecánicas (currículo) — `src/generator/curriculum.ts`
- **Línea de tiempo** (`manifest.timeline: [{ id, debut }]`): se añade una entrada al terminar una mecánica (`npm run mechanic:release -- <id>`). Su debut es el primer nivel **no publicado**, y nunca a menos de 10 niveles del debut anterior, para no enseñar dos a la vez.
- **Niveles congelados** (`manifest.frozenThrough` + `frozenHash`): antes de publicar se ejecuta `npm run levels:freeze`. `gen:levels` se niega a regenerar niveles congelados (salvo `--unfreeze`) y `validate:levels` falla si su contenido cambia. **El juego solo crece por el final**: el progreso guardado nunca ve un nivel cambiar.
- **Ciclo de cada mecánica**, sea cual sea su debut:
  1. **Adaptación** (2 niveles): la mecánica sola + las básicas, dificultad fácil siempre, intensidad 0.25. El primero es tutorial (`tutorial: true` + `tutorialHint` de la mecánica).
  2. **Profundización** (8 niveles): siempre presente, intensidad de 0.35 a 1. Con un 50 % de probabilidad vuelve una mecánica anterior. Rige el patrón de dificultad del pack.
  3. **Pool**: cada nivel elige entre 1 y 4 giros conocidos al azar (con semilla), dentro del presupuesto `4 + floor(n / 25)` de complejidad, sin conflictos y favoreciendo sinergias. Cada 25 niveles (jefe) intenta empezar por una pareja con sinergia. Intensidad `min(1, 0.5 + (n - debut) / 200)`.
- Si pasan muchos niveles sin mecánicas nuevas, no pasa nada: la dificultad base sigue creciendo con `n` y el pool sigue combinando.
- `validate:levels` comprueba: debut como tutorial en su nivel, ninguna mecánica antes de su debut y niveles generados idénticos al currículo.

### 4.2 Generador v1 (base + muros + longitudes) — implementado en `src/generator`
**Generación inversa** (solución garantizada por construcción):
1. Crear tablero con muros aleatorios (se descarta cualquier muro que parta el área libre en dos).
2. Colocar cada agujero y su lagarto con la cabeza **justo al lado** (a un paso de estar resuelto).
3. Desordenar con `K` pasos legales del propio motor (`step`), sin dejar nunca que un lagarto caiga en un agujero. Como cada paso es reversible (el otro extremo puede volver a la celda que se acaba de liberar), deshacer el desorden siempre resuelve el nivel.
4. El desorden no es aleatorio puro: puntúa cada estado por *encierro* (lagartos sin ruta libre a su agujero), *bloqueos* (cuerpos/agujeros ajenos en el rectángulo hacia su agujero) y distancia, y se queda con **la mejor instantánea**, no con la última.
5. Se construyen 16 candidatos por nivel desde la misma semilla; el solver los mide y gana el más cercano a la dependencia objetivo de `D(n)`.

### 4.2.b Generador v2 (actual): dificultad por "aparcamientos"
- **Métrica principal: aparcamientos mínimos** (`src/solver/parking.ts`). Mandar un lagarto a casa nunca perjudica (libera celdas y su agujero pasa a ser suelo), así que se aplica gratis; lo que cuesta es cada arrastre que mueve un lagarto a un sitio que **no** es su agujero solo para hacer hueco. Búsqueda en anchura sobre esos arrastres con presupuesto de trabajo determinista. Si encuentra solución, también prueba que el nivel es resoluble.
- **Etiquetas** (`meta.tier`, se muestran en el menú): 0 aparcamientos = fácil (sin etiqueta), 1 = **Medio**, 2 = **Difícil**, 3+ o 2 con ≥ 8 lagartos = **Muy difícil**. Las etiquetas son siempre lo **medido**, nunca lo pretendido.
- **Reparto por pack de 10:** `0 0 1 0 0 0 2 0 1 3` (6 fáciles, 2 medios, 1 difícil, el 10º muy difícil). Tope: pack 1 hasta Medio, pack 2 hasta Difícil.
- **Hallazgo:** con las reglas base, por debajo de ~60 % de ocupación casi ningún nivel necesita aparcar (siempre hay sitio para rodear). Por eso:
  - Fácil → generación inversa (4.2).
  - Medio o más → tablero **denso** aleatorio (60 % / 68 % / 75 % de ocupación) + búsqueda local (*hill climbing*) sobre arrastres si no llega al objetivo. Si no sale ninguno válido, se vuelve a la generación inversa.
- Los niveles a mano conservan su contenido; `gen:levels` solo les mide la etiqueta.
- Límite conocido: el "Muy difícil" no siempre se alcanza en el 10º nivel (el generador lo etiqueta con lo que consiga). La dificultad de verdad grande llegará con mecánicas **irreversibles** (Fase 3), que crean callejones sin salida.

### 4.3 Generador v2 (herramientas avanzadas)
Para portales, hielo, frágiles, etc. la inversión exacta es complicada → **generate-and-test**:
1. Generar candidato aleatorio con las herramientas activas.
2. Pasarlo por el **solver** (BFS/A* con límite de estados).
3. Aceptar solo si: es resoluble, su solución mínima está dentro del rango de `D(n)` y no es trivial (no se gana en < X movimientos).

### 4.4 Solver y métricas
- Solver BFS sobre estados serializados (posiciones de lagartos + estado de herramientas).
- Implementado como **A*** (heurística: distancia Manhattan del extremo más cercano de cada lagarto a su agujero, admisible y consistente). Con `weight > 1` es A* ponderado: mucho más rápido, pero `minMoves` pasa a ser cota superior (`meta.optimal = false`, se muestra con `~` en `gen:levels`).
- Salidas: `solvable`, `minMoves`, `statesExplored`, `exhausted`, `solution`.
- **Hallazgo de la Fase 2:** como todos los movimientos son reversibles, casi no existen callejones sin salida y apartar a un lagarto cuesta pocos pasos extra (los niveles a mano dan `minMoves / ideal ≈ 1`). La dificultad real es **de orden**: la métrica principal es la *dependencia* = fracción de lagartos que no pueden llegar a su agujero mientras los demás están quietos. `meta.difficulty` combina trabajo, dependencia y rodeos en un solo número.
- Se usa para: validar, calcular dificultad real, fijar `timeLimit` (ej. `timeLimit = minMoves * secPerMove * timeFactor`) y descartar duplicados.

### 4.5 Reproducibilidad
- Todo nivel generado guarda su `seed` (`hashSeed(id, generatorVersion)`) y `generatorVersion`. Mismo seed + misma versión = mismo nivel (`npm run validate:levels -- --deep` lo comprueba). Cambiar el algoritmo del generador implica subir `GENERATOR_VERSION`.

---

## 5. Formato de datos

### 5.1 Nivel (`level`)
```json
{
  "id": 42,
  "seed": 918273,
  "generatorVersion": 1,
  "source": "generated",
  "grid": { "w": 7, "h": 9 },
  "holes": [ { "color": "green", "cell": [6,0], "capacity": 1 } ],
  "geckos": [
    { "id": "g1", "color": "green", "cells": [[2,4],[2,5],[2,6]] }
  ],
  "mechanics": ["base", "walls", "lengths"],
  "mechanicData": { "walls": [[0,3],[1,3],[5,6]] },
  "timeLimit": 45,
  "stars": { "two": 0.3, "three": 0.6 },
  "meta": { "minMoves": 14, "difficulty": 3.2 }
}
```

### 5.2 Pack y manifest
- Niveles agrupados en packs de 10: `public/levels/pack-0001.json` ... 
- `public/levels/manifest.json`:
```json
{
  "version": 12,
  "generatedAt": "2026-10-22T14:00:00Z",
  "packs": [
    { "file": "pack-0001.json", "from": 1, "to": 10 },
    { "file": "pack-0002.json", "from": 11, "to": 20 }
  ],
  "timeline": [ { "id": "walls", "debut": 6 }, { "id": "lengths", "debut": 12 } ],
  "frozenThrough": 12,
  "frozenHash": "…"
}
```
- La app lee el manifest al arrancar; si hay packs nuevos, aparecen. **Añadir contenido = añadir ficheros + subir.**

### 5.3 Progreso del jugador (local)
`localStorage` (o IndexedDB): `{ currentLevel, stars: {levelId: n}, bestTimes: {...}, settings }`. Sin backend.

---

## 6. Stack técnico

| Capa | Elección | Motivo |
|------|----------|--------|
| Lenguaje | TypeScript | Tu stack |
| UI / app | React + Vite | Rápido, conocido |
| Render del tablero | Canvas 2D (o SVG si el tablero es pequeño) | Control del arrastre y animaciones a 60fps |
| Estado | Zustand o `useReducer` | Lógica del juego como funciones puras |
| Lógica de juego | Módulo TS **sin dependencias de React** (`/engine`) | Testeable y reutilizable por generador y solver |
| Tests | Vitest | Reglas, solver y generador |
| PWA | `vite-plugin-pwa` | Instalable en móvil, offline |
| Hosting | Netlify / Cloudflare Pages / GitHub Pages | Gratis, deploy en cada push |
| Scripts de contenido | Node + TS (`tsx`) | `gen:levels`, `validate:levels` |

### Estructura de carpetas
```
/src
  /engine        # núcleo: pipeline del turno, registro de mecánicas, eventos, victoria
  /mechanics     # una mecánica por fichero (walls.ts, portals.ts...) + index.ts (REGISTRY)
  /solver        # BFS/A*, métricas de dificultad
  /generator     # generación inversa + generate-and-test
  /ui            # componentes React, canvas, HUD
  /state         # store, progreso
/scripts
  gen-levels.ts      # npm run gen:levels -- --from 101 --count 50
  validate-levels.ts # npm run validate:levels
/public
  /levels        # manifest.json + pack-XXXX.json
  /icons         # iconos PWA
/tests
GAME_DESIGN.md
```

---

## 7. Pipeline de contenido ("verlo crecer")

1. `npm run gen:levels -- --from 101 --count 50` → genera, valida con solver y escribe packs nuevos.
2. `npm run validate:levels` → revalida TODO el catálogo (resoluble, ids únicos, formato).
3. Actualiza `manifest.json` (incrementa `version`).
4. `git push` → el hosting redeploya automáticamente.
5. En el móvil, el service worker detecta versión nueva y ofrece "Hay niveles nuevos".

**Fase extra (opcional):** GitHub Action programada (cron semanal) que ejecuta los pasos 1-3 y hace commit sola → los niveles crecen aunque no toques nada.

### Modo "Infinito puro" (opcional)
Además de los niveles publicados, un modo que genera niveles **en el dispositivo** con semilla creciente (mismo generador en el cliente). Útil como fallback cuando se acaban los publicados.

---

## 8. Móvil

- **PWA**: `manifest` con `display: standalone`, `orientation: portrait`, iconos 192/512 y service worker (cache de assets + niveles).
- **Input**: `Pointer Events` (un solo código para ratón y táctil), `touch-action: none` en el canvas para evitar scroll/zoom.
- **Layout**: tablero escalado al ancho disponible, celdas mínimo ~40px, respetar `safe-area-inset-*`.
- **Feedback**: `navigator.vibrate` (donde exista) al encajar un lagarto, sonido tras el primer gesto del usuario.
- **Rendimiento**: `requestAnimationFrame`, evitar re-render de React en cada frame (el canvas se dibuja fuera del ciclo de React).
- **Siguiente paso opcional**: empaquetar con **Capacitor** si quieres APK/tienda; no es necesario para uso propio.

---

## 9. Roadmap por fases

### Fase 0 — Prototipo del feel (finde 1, parte 1)
- [x] Núcleo con arquitectura de mecánicas (contrato, registro, pipeline y eventos de la sección 13); `walls` como primera mecánica "de verdad" para validar el sistema
- [x] Tablero + render canvas
- [x] Lagarto con arrastre desde ambos extremos (seguir el rastro)
- [x] Colisiones con muros y otros lagartos
- [x] Agujeros de color + entrada automática + victoria
- [x] 5 niveles a mano en JSON (+ nivel 6 tutorial de muros)
- [x] Extra adelantado de Fase 2: solver A* básico (`src/solver`) que valida en tests que todos los niveles publicados son resolubles

### Fase 1 — Juego completo básico (finde 1, parte 2)
- [x] Timer (arranca al primer toque, pausa automática al cambiar de app), estrellas, reiniciar, deshacer ilimitado
- [x] Pantalla de lista de niveles por packs con etiqueta de dificultad + progreso en `localStorage` (desbloqueo al superar el anterior)
- [x] Herramientas `walls` y `lengths`
- [ ] 20 niveles a mano + tutoriales (hay 7 a mano + tutoriales de `walls` y `lengths`; el resto lo cubre el generador)

### Fase 2 — Infinito (finde 2)
- [x] Solver (A* en lugar de BFS; ver 4.4)
- [x] Generador v1 (generación inversa) + `gen:levels` / `validate:levels`
- [x] Curva de dificultad `D(n)`
- [x] Manifest + packs + carga dinámica

> Pendiente de la Fase 2: el generador tarda 10-25 s por nivel a partir del ~40 (7+ lagartos) y la dependencia conseguida se queda por debajo del objetivo desde el ~50. Hará falta optimizarlo antes de generar cientos de niveles.

### Fase 3 — Herramientas avanzadas
- [ ] `portals`, `ice`, `fragile` (con generate-and-test)
- [ ] `switches`, `capacity`, `conveyor`, `sleepers`
- [ ] Tutoriales de cada una + niveles "jefe"

### Fase 4 — Móvil y publicación
- [ ] PWA (manifest, iconos, offline)
- [ ] Ajuste táctil, safe areas, vibración, sonido
- [x] Config de deploy en Netlify (`netlify.toml`); falta conectar el repo
- [ ] Aviso de "niveles nuevos"

### Fase 5 — Pulido y crecimiento
- [ ] "Juice": animaciones, partículas, transiciones
- [ ] Tema visual propio y sonidos
- [ ] GitHub Action cron para generar niveles solo
- [ ] Modo infinito puro on-device

---

## 10. Criterios de calidad ("definition of done" de un nivel)
- Resoluble según solver.
- No resoluble en menos de X movimientos (no trivial).
- `timeLimit` alcanzable con margen razonable (1.3x-2x del tiempo de solución mínima en niveles normales).
- Sin duplicados (hash de estado inicial).
- Si introduce herramienta nueva: nivel de introducción previo marcado como `tutorial`.

---

## 11. Decisiones abiertas
- [ ] Nombre y tema definitivo (lagartos / salamandras / serpientes / gusanos…).
- [ ] ¿Canvas o SVG para el render?
- [ ] ¿Deshacer ilimitado o recurso limitado a partir de cierto nivel?
- [ ] ¿Tiempo siempre presente o solo desde el nivel N?
- [ ] ¿Packs de 10 o de 20 niveles?
- [ ] Hosting definitivo (Netlify / Cloudflare Pages / GitHub Pages).

---

## 12. Nota para trabajar con Claude Code
- Empezar siempre por `/engine` y sus tests: si las reglas están bien y aisladas, UI, solver y generador se construyen encima sin dolor.
- Una fase por sesión, cerrando cada una con tests pasando y el juego jugable.
- Cualquier cambio de reglas se refleja primero en este documento.
- Para añadir mecánicas nuevas, seguir **siempre** las secciones 13 a 17.

---

## 13. Sistema de mecánicas (arquitectura de plugins)

**Principio:** el motor (`/engine`) no conoce ninguna mecánica concreta. Solo conoce el *contrato* y un *registro*. Cada mecánica vive en su propio módulo (`/src/mechanics/<id>.ts`) y se engancha al turno mediante hooks. Así el motor, el solver y el generador comparten las mismas reglas y una mecánica nueva se valida sola.

### 13.1 Contrato

```ts
export interface Mechanic<TData = unknown, TState = unknown> {
  id: string;                       // 'portals', 'ice'...
  priority: number;                 // orden de ejecución de hooks (menor = antes)
  complexity: number;               // coste 1-10 para el presupuesto del generador
  conflictsWith?: string[];         // ids con los que NO se debe mezclar
  synergiesWith?: string[];         // ids que el generador debe favorecer en combos

  // --- Ciclo de vida ---
  initState?(level: Level, data: TData): TState;
  stateKey?(state: TState): string;        // serialización estable para el solver (obligatorio si hay estado)

  // --- Hooks del turno (todos opcionales) ---
  canGrab?(ctx: Ctx, gecko: Gecko, end: 'head' | 'tail'): boolean;   // ¿se puede agarrar? (dormidos, pegamento)
  canEnter?(ctx: Ctx, gecko: Gecko, cell: Cell): boolean;            // veto de movimiento (puertas, muros)
  redirect?(ctx: Ctx, gecko: Gecko, from: Cell, to: Cell): Cell;     // cambia destino (portales, hielo)
  onEnter?(ctx: Ctx, gecko: Gecko, cell: Cell): void;                // efecto al pisar (interruptor, frágil)
  onLeave?(ctx: Ctx, gecko: Gecko, cell: Cell): void;                // efecto al abandonar (frágil se rompe)
  afterMove?(ctx: Ctx): void;                                        // efectos del turno (cintas, hielo)
  onTick?(ctx: Ctx, dt: number): void;                               // efectos por tiempo real (opcional)
  onEvent?(ctx: Ctx, event: GameEvent): void;                        // reaccionar a eventos de otras mecánicas

  // --- Datos y nivel ---
  validateLevel?(level: Level, data: TData): string[];               // errores de diseño (portal sin pareja...)
  populate?(rng: Random, level: Level, intensity: number): TData | undefined; // la coloca sobre un tablero ya construido (0..1)
  withoutMechanic?(level: Level, data: TData): Level;                // el mismo nivel sin poder usarla (¿es decorativa?)

  // --- UI ---
  render?(g: Renderer, ctx: Ctx, data: TData, state: TState): void;
  tutorialHint?: string;                                             // texto corto para el nivel de introducción
}
```

### 13.2 Pipeline del turno (orden fijo y documentado)

Cada paso de un lagarto (una celda) sigue SIEMPRE este orden. Las mecánicas se ejecutan ordenadas por `priority` dentro de cada fase:

1. `canGrab` → ¿se puede empezar a mover?
2. Cálculo de celda destino + `redirect` (portales, hielo)
3. `canEnter` → si **cualquier** mecánica o regla base veta, el movimiento no ocurre
4. Se aplica el movimiento (cuerpo sigue el rastro) + `onLeave` de la celda dejada
5. `onEnter` de la celda nueva
6. Comprobación base de agujero (entrada y victoria)
7. `afterMove` en bucle hasta que el estado sea estable (máx. 50 iteraciones; si se excede → nivel inválido)
8. Emisión de eventos pendientes → `onEvent`

> El pipeline **no se cambia** al añadir mecánicas. Si una mecánica nueva necesita un hook nuevo, se añade al contrato y se documenta aquí (cambio de motor, no de mecánica).

### 13.3 Estado y determinismo
- Todo estado de mecánica vive en `ctx.mechState[id]`, nunca en variables globales.
- El estado debe ser **serializable** y `stateKey` debe ser **estable** (mismo estado = misma cadena). Sin esto, el solver se rompe.
- El estado es **inmutable**: los hooks sustituyen `ctx.state.mechState[id]`, nunca lo mutan. Así clonar un estado es una copia superficial (el solver clona millones) y "cambió el estado de una mecánica" se detecta por identidad.
- **Irreversibilidad:** un paso que cambia el estado de alguna mecánica es irreversible. El arrastre largo de la UI (`findPath` con `avoidIrreversible`) nunca da esos pasos, y el solver de aparcamientos no los aplica de forma voraz: los explora como ramas.
- Cero `Math.random` en el motor: cualquier aleatoriedad usa el `RNG` con semilla.
- El motor devuelve estados **nuevos** (inmutabilidad) o es perfectamente revertible; necesario para deshacer y para el solver.

### 13.4 Eventos (para sinergias sin acoplamiento)
Las mecánicas **nunca se importan entre sí**. Se comunican por eventos tipados:

| Evento | Cuándo se emite |
|--------|-----------------|
| `gecko:moved` | Tras cada paso |
| `gecko:entered` / `gecko:left` | Al entrar/salir de una celda (con la celda y el lagarto) |
| `cell:changed` | Una celda cambia de tipo/estado (frágil → muro, puerta abierta…) |
| `hole:filled` | Un lagarto entra en un agujero |
| `switch:toggled` | Un interruptor cambia |
| `gecko:woken` | Un lagarto dormido se despierta |
| `level:won` | Todos los lagartos salvados (lo emite el motor) |

Una mecánica puede **emitir** eventos propios nuevos (se documentan en su ficha).

### 13.5 Datos en el nivel (cambio respecto a 5.1)
- `mechanics: string[]` → ids activos en el nivel.
- `mechanicData: { [id]: TData }` → datos de cada mecánica (sustituye al antiguo `special`). Los muros también viven aquí (`mechanicData.walls`), no como campo raíz.
```json
"mechanics": ["base", "walls", "portals", "ice"],
"mechanicData": {
  "portals": [ { "a": [1,2], "b": [5,6], "color": "blue" } ],
  "ice": [ [3,3], [3,4] ]
}
```

### 13.6 Registro
```ts
// /src/mechanics/index.ts
export const REGISTRY: Record<string, Mechanic> = { walls, portals, ice, /* ... */ };
```
`manifest.timeline` define el debut de cada id; el currículo (4.1.b) decide qué mecánicas usa cada nivel.

---

## 14. Checklist para añadir una mecánica nueva

Orden obligatorio. No saltarse pasos.

1. **Ficha** (sección 16) en `/docs/mechanics/<id>.md`. Revisarla con el dueño del juego antes de programar.
2. **Análisis de interacciones** con TODAS las mecánicas ya registradas (tabla de la ficha). Decidir `conflictsWith` / `synergiesWith`.
3. **¿Necesita un hook nuevo?** Si sí → cambio de motor primero (13.1 y 13.2 actualizados, tests del motor).
4. **Implementar** `/src/mechanics/<id>.ts` cumpliendo el contrato (13.1) y registrarla.
5. **Tests unitarios** de cada hook + casos límite de la ficha.
6. **Render** (dibujo + animación) y feedback (sonido/vibración si aplica).
7. **`populate`** para el generador + `complexity`.
8. **Test de propiedad**: generar N=200 niveles con la mecánica; todos deben ser resolubles (solver), deterministas con la misma semilla y sin errores de `validateLevel`.
9. **Test de combinación** con cada mecánica NO conflictiva (mínimo 20 niveles por pareja).
10. **Nivel tutorial** a mano (introducción aislada) + 3-5 niveles de "mecánica + básicos".
11. **Lanzamiento**: `npm run mechanic:release -- <id>` (debut en el primer nivel no publicado) + `gen:levels` de los niveles nuevos. Nunca se mueve un debut ya publicado.
12. **Actualizar este documento**: tabla de la sección 3, `docs/mechanics/IDEAS.md` + matriz de sinergias (sección 15).
13. **Generar y validar**: `npm run gen:levels` + `npm run validate:levels`.

**Definition of done de una mecánica:** pasos 1-13 completos, tests verdes y al menos un "momento aha" documentado en la ficha.

---

## 15. Sinergias entre mecánicas

### 15.1 Reglas de convivencia
1. **Sin acoplamiento directo**: comunicación solo por eventos y por el estado de celda compartido.
2. **Orden determinista**: `priority` fija el orden; en empate, orden alfabético del id.
3. **Veto gana**: en `canEnter`, si alguien dice `false`, el movimiento no ocurre.
4. **Cada combinación declarada**: toda pareja de mecánicas está en la matriz como `✔ sinergia`, `○ neutra` o `✖ conflicto`.
5. **Presupuesto de complejidad**: el generador limita `sum(complexity) <= budget(n)` para que un nivel no mezcle demasiado.

### 15.2 Matriz de interacciones (rellenar al añadir cada mecánica)

| | walls | portals | ice | fragile | switches | capacity | conveyor | sleepers |
|---|---|---|---|---|---|---|---|---|
| **walls** | – | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **portals** | ○ | – | ✔ salir deslizando | ○ | ✔ portal con puerta | ○ | ✔ portal en cinta | ○ |
| **ice** | ○ | ✔ | – | definir (propuesta: deslizar cuenta como cruzar) | ○ | ○ | ✔ | ○ |
| **fragile** | ○ | ○ | definir | – | ○ | ○ | ✔ cinta rompe hoja | ○ |
| **switches** | ○ | ✔ | ○ | ○ | – | ○ | ○ | ✔ interruptor despierta |
| **capacity** | ○ | ○ | ○ | ○ | ○ | – | ○ | ○ |
| **conveyor** | ○ | ✔ | ✔ | ✔ | ○ | ○ | – | ○ |
| **sleepers** | ○ | ○ | ○ | ○ | ✔ | ○ | ○ | – |

> **locked-holes** (añadida tras la tabla): ✔ con `fragile` (aparcar al gecko que espera puede gastar hojas); `capacity` por definir; resto ○. Detalle en `docs/mechanics/locked-holes.md`.

> Las celdas "definir" son decisiones de diseño pendientes. Se resuelven al implementar la segunda mecánica de la pareja y se documentan en AMBAS fichas.

### 15.3 Cómo nacen las sinergias
- Una mecánica **expone** (emite eventos / marca celdas con *tags* como `slippery`, `breakable`, `teleports`).
- Otra mecánica **reacciona** a esos eventos/tags sin saber quién los generó.
- Ejemplo: la cinta mueve un lagarto → emite `gecko:entered` → la hoja frágil (que escucha ese evento) se rompe aunque el movimiento no lo haya hecho el jugador.
- El generador favorece pares con `synergiesWith` en niveles "jefe" (cada 25 niveles).

---

## 16. Plantilla de ficha de mecánica

Copiar a `/docs/mechanics/<id>.md` y rellenar **antes** de programar.

```markdown
# Mecánica: <Nombre> (`<id>`)

## 1. Concepto (1 frase)
## 2. Momento "aha" (qué sorprende al jugador y por qué engancha)
## 3. Reglas
- Regla 1…
- Regla 2…
## 4. Casos límite (obligatorio, mínimo 5)
- ¿Qué pasa si un lagarto de longitud 1/máxima la cruza?
- ¿Y si dos lagartos coinciden?
- ¿Y si el cuerpo queda a medias sobre la celda?
- ¿Deshacer? ¿Reiniciar?
- ...
## 5. Datos en el nivel (`mechanicData.<id>`)
(JSON de ejemplo + validaciones de `validateLevel`)
## 6. Estado interno (`TState`) y `stateKey`
## 7. Hooks usados y prioridad
## 8. Eventos que emite / escucha
## 9. Interacciones con otras mecánicas
| Con | Tipo (✔/○/✖) | Comportamiento acordado |
## 10. Generación (`populate`): cómo se coloca, intensidad, restricciones
## 11. Complejidad (1-10) y riesgo para el solver (nº de estados extra)
## 12. Desbloqueo, tutorial y niveles de introducción
## 13. Render, animación y feedback (sonido/vibración)
## 14. Tests requeridos
## 15. Notas y decisiones abiertas
```

---

## 17. Cómo pedirle una mecánica nueva al agente

### 17.1 Flujo de trabajo (acordado)
1. El dueño del juego describe la mecánica con sus palabras (puede ser vaga).
2. El agente **no programa todavía**: rellena la ficha (sección 16), propone casos límite e interacciones con las mecánicas existentes y marca dudas.
3. El dueño responde/ajusta. Se cierra la ficha.
4. El agente implementa siguiendo el checklist de la sección 14, paso a paso, con tests.
5. El agente actualiza este documento (tabla de la sección 3 y matriz de 15.2) y resume qué cambió.

### 17.2 Prompt tipo
```
Lee GAME_DESIGN.md (secciones 2, 3, 13, 14, 15, 16 y 17).

Quiero añadir una mecánica nueva: <NOMBRE / descripción libre>.

Pasos:
1. NO programes aún. Rellena la ficha (sección 16) en /docs/mechanics/<id>.md.
2. Analiza interacciones con TODAS las mecánicas ya registradas y rellena la
   matriz. Señala conflictos y decisiones de diseño que tenga que tomar yo.
3. Dime si requiere un hook nuevo en el motor.
4. Espera mi confirmación y entonces implementa siguiendo la sección 14.
```

### 17.3 Prompt tipo para sinergias
```
Lee GAME_DESIGN.md. Ya existen las mecánicas <A> y <B>.
Propón 3 sinergias interesantes entre ambas (momentos "aha"), indica qué
eventos/tags harían falta, el impacto en el solver y qué niveles tutorial/jefe
las aprovecharían. No implementes hasta que elija una.
```

### 17.4 Reglas para el agente
- Respetar el pipeline (13.2): no alterar el orden del turno sin avisar.
- Nada de acoplar mecánicas entre sí; todo por eventos o tags de celda.
- Sin `Math.random`; todo con RNG con semilla.
- Toda mecánica entrega: ficha + código + tests + `populate` + tutorial + doc actualizado.
- Si una decisión de diseño es ambigua, **preguntar** (lista corta) antes de asumir.
