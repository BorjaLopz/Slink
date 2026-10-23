# Banco de mecánicas

Catálogo abierto. Cualquier idea entra aquí primero; cuando se decide hacerla, pasa por la ficha (`docs/mechanics/<id>.md`, GAME_DESIGN.md §16-17) y, al terminarla, por `npm run mechanic:release -- <id>`.

Estados: **idea** → **ficha** (en diseño) → **ficha cerrada** → **implementada** → **lanzada** (en `manifest.timeline`).

## Lanzadas

| ID | Mecánica | Debut |
|----|----------|-------|
| `walls` | Muros (básica) | 6 |
| `lengths` | Longitudes 2-6 (básica) | 12 |
| `fragile` | Hojas frágiles: se cruzan una vez y pasan a muro | 20 |
| `locked-holes` | Candados: el agujero se abre tras N geckos salvados | 51 |

## En curso

| ID | Mecánica | Estado | Notas |
|----|----------|--------|-------|
| – | – | – | Nada en curso. |

## Ideas

| ID provisional | Mecánica | Notas de diseño |
|----------------|----------|-----------------|
| `ice` | Hielo: deslizas hasta chocar | Interacción con `fragile` pendiente (propuesta en su ficha). |
| `portals` | Portales emparejados | Sinergias con hielo, puertas y cintas. |
| `capacity` | Agujeros dobles (admiten N) o comodín (cualquier color) | Barata. |
| `stacked` | Lagarto con N capas: al meterlo aparece otro "debajo", hasta N veces | Añade lagartos en mitad de la partida: hay que tocar estado y solver. |
| `keyed` | Lagarto bloqueado hasta que pasen N cosas (llave, N lagartos salvados…) | Familia de `sleepers`: `canGrab` con condición. |
| `archer` | Lagarto con flechas: elimina dianas y no puede entrar hasta eliminarlas todas | Veto de entrada al agujero + celdas objetivo. |
| `torch` | Lagarto con antorcha: quema todas las pajas de heno antes de poder entrar | Igual que `archer`; la paja quizá también bloquea a otros. |
| `striped` | Lagarto bicolor: solo entra en su agujero rayado | Del PDF de diseño. Variante visual de color; barata. |
| `switches` | Interruptores y puertas de color | Sinergia con portales y dormidos. |
| `conveyor` | Cintas: empujan una celda por turno | Rompe hojas frágiles por evento. |
| `sleepers` | Lagartos dormidos hasta que otro pasa al lado | |
| `glue` | Pegamento: solo se arrastra por la cabeza | |
| `fog` | Niebla parcial: solo ves X celdas alrededor | Más de presentación que de reglas. |

## Fuera de las mecánicas (meta)
- Recursos: pistas, deshacer limitado, tiempo extra.
- Nivel del día con semilla fija.

## Cambios de motor que piden varias ideas
- **Veto de entrada al agujero:** resuelto sin cambio de motor. `locked-holes` veta con `canEnter` la celda del agujero cerrado; `archer` y `torch` pueden hacer lo mismo.
- **Lagartos que aparecen en mitad de la partida**: `stacked`.
