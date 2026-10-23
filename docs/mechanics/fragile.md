# Mecánica: Hojas frágiles (`fragile`)

> Estado: **implementada** (2026-10-23). Código: `src/mechanics/fragile.ts`, tests: `tests/fragile.test.ts`.

## 1. Concepto
Celdas que se pueden cruzar una sola vez: cuando el lagarto termina de pasar, la hoja se rompe y la celda pasa a ser muro.

## 2. Momento "aha"
El camino corto existe, pero lo necesita **otro** lagarto. Si lo usas tú primero, lo cierras. Por primera vez el orden no solo importa, sino que se puede perder: hay callejones sin salida reales y el jugador aprende a planificar antes de arrastrar.

## 3. Reglas
- Una hoja intacta es suelo normal: cualquier lagarto puede entrar, de cualquier color.
- La hoja se rompe cuando **la última celda del lagarto la abandona** (`onLeave`). Mientras el cuerpo está encima, sigue intacta.
- Una hoja rota es un muro para el resto de la partida.
- Deshacer restaura la hoja (el estado vive en `mechState`, que se clona con el resto).
- Reiniciar restaura todas las hojas.

## 4. Casos límite
1. **Lagarto que pisa la hoja y retrocede:** al retroceder, el extremo que la pisaba la abandona, así que **se rompe**. Pisarla ya es usarla. Mientras quede alguna parte del cuerpo encima, aguanta.
2. **Lagarto de 4+ que persigue su propia cola:** en un paso la cola sale de la hoja y la cabeza entra en ella. La hoja nunca quedó vacía, así que **aguanta**.
3. **Lagarto que se salva estando encima de una hoja:** sus celdas quedan libres de golpe al entrar en el agujero. Propuesta: las hojas que ocupaba **se rompen** porque el lagarto las ha abandonado. Ver decisión D4.
4. **Hoja ocupada en el estado inicial** del JSON: error de `validateLevel` (propuesta). Evita la ambigüedad de "¿cuenta como cruzada?".
5. **Hoja sobre agujero o muro:** error de `validateLevel`.
6. **Arrastre largo (BFS):** nunca cruza hojas intactas (D2). Si el único camino pasa por una, el arrastre largo rebota y hay que cruzarla celda a celda.
7. **Lagarto de longitud 6 en un pasillo con varias hojas seguidas:** cada hoja se rompe en el paso en que la cola la deja. El orden de los eventos `cell:changed` es el orden de los pasos.
8. **Nivel sin solución tras una mala jugada:** es intencionado y no se avisa (D5).

## 5. Datos en el nivel (`mechanicData.fragile`)
```json
"mechanicData": { "fragile": [[2, 3], [2, 4]] }
```
`validateLevel`: array de celdas dentro del tablero, sin duplicados, sin solapar muros, agujeros ni lagartos.

## 6. Estado interno (`TState`) y `stateKey`
```ts
interface FragileState {
	/** Índices (en mechanicData.fragile) de las hojas rotas. Ordenados. */
	broken: number[];
}
```
`stateKey`: los índices unidos por comas. Estable porque se mantienen ordenados.

## 7. Hooks usados y prioridad
- `initState`: `broken = []`.
- `canEnter`: veto si la celda es una hoja rota.
- `onLeave`: si la celda que deja la cola es una hoja intacta, se rompe y emite `cell:changed`.
- `onEvent` sobre `hole:filled`: rompe las hojas que ocupaba el lagarto salvado (D4).
- `validateLevel`, `render`, `populate`.
- Prioridad 10: después de los muros, aunque el orden no cambia el resultado.

**No requiere hooks nuevos en el motor.**

## 8. Eventos
- Emite `cell:changed` con `{ cell, from: "fragile", to: "wall" }`.
- Escucha `hole:filled` (D4).
- Futuro: la cinta transportadora reacciona a `gecko:left`, así que una cinta que arrastra un lagarto fuera de una hoja la rompe sin código extra (sinergia ✔ de §15.2).

## 9. Interacciones con otras mecánicas
| Con | Tipo | Comportamiento |
|-----|------|----------------|
| walls | ○ | Neutra. Una hoja rota se comporta como un muro más. |
| lengths | ✔ | Los lagartos largos tardan más en abandonar la hoja, así que la tapan más tiempo. Útil para puzles de "quién pasa primero". |
| portals | ○ | Pendiente: aún no están implementados. Una hoja junto a la salida de un portal no tiene nada especial. |
| ice | definir | Se decide en la ficha de `ice`. Propuesta: deslizar sobre una hoja **cuenta como cruzarla** y la rompe cuando la cola la deja, igual que un paso normal. Así no hace falta caso especial. |
| switches | ○ | Neutra. |
| capacity | ○ | Neutra. |
| conveyor | ✔ | La cinta rompe hojas al mover lagartos (por evento). |
| sleepers | ○ | Neutra. |

## 10. Generación (`populate`)
1. Se construye el tablero base como siempre (muros, lagartos, agujeros).
2. **Puerta:** para algún lagarto (orden aleatorio con semilla) se calcula el corte mínimo de celdas entre él y su agujero (flujo máximo con nodos partidos). Si cabe en el número de hojas (`1 + round(intensidad · 3)`, más uno), esas celdas son hojas: **no se pueden esquivar**.
3. El resto de hojas va a celdas libres muy transitadas (rutas más cortas a casa), con más peso en pasillos.
4. En los niveles de enseñanza (adaptación y profundización) el generador exige además que `withoutMechanic` (hojas convertidas en muro) sea irresoluble. Si ningún candidato lo cumple, se queda con el más cercano.
5. Pendiente: buscar **trampas** de verdad (romper una hoja demasiado pronto deja a otro lagarto sin camino) y aplicar la exigencia también en el pool.

## 11. Complejidad y riesgo para el solver
- Complejidad: **4**.
- Estados extra: hasta `2^n` con `n` hojas. Con n ≤ 4 es manejable.
- **Riesgo importante:** el solver de aparcamientos (`src/solver/parking.ts`) asume que mandar un lagarto a casa nunca perjudica. Con hojas eso deja de ser cierto: el camino a casa puede romper una hoja que otro necesita. Habrá que cambiar `sendHome` para que solo aplique de forma voraz los caminos que no rompen hojas y trate el resto como un movimiento normal de la búsqueda.
- `findPath` (BFS del arrastre) ya incluye el estado de las hojas en la clave, así que es correcto. Solo necesita la opción de excluir hojas intactas cuando lo usa la UI (D2).

## 12. Desbloqueo, tutorial y niveles de introducción
- Debut: nivel 20 (D1). Los niveles de adaptación los genera el currículo; el 20 es el tutorial.
- Tutorial "La hoja": dos lagartos y un pasillo con una hoja que ambos necesitan. Uno tiene un rodeo y el otro no. Si pasa primero el que tiene rodeo, el nivel queda bloqueado.
- `tutorialHint`: "Las hojas aguantan una pasada. Después, se rompen."
- Tras el tutorial, 3-5 niveles con hojas + muros + longitudes.

## 13. Render, animación y feedback
- Hoja intacta: cuadro con borde discontinuo acero y una vena diagonal, sobre un fondo algo más claro que el tablero. Se distingue de la roca (rayada y maciza) de un vistazo.
- Hoja rota: se dibuja como roca (`Renderer.drawRock`) con una grieta encima.
- Pendiente: animación de rotura y vibración corta.

## 14. Tests requeridos
- `canEnter` veta la hoja rota y permite la intacta.
- La hoja no se rompe mientras el cuerpo la ocupa; se rompe en el paso en que la cola sale.
- Pisar y retroceder rompe la hoja (caso límite 1); perseguir la propia cola no (caso límite 2).
- Deshacer restaura la hoja.
- `stateKey` distingue el estado con la hoja rota del estado con la hoja intacta.
- Lagarto que se salva estando sobre una hoja (según D4).
- `validateLevel`: duplicados, fuera del tablero, solapes.
- `sendHome` del solver no rompe hojas de forma voraz.
- Test de propiedad: 200 niveles generados con `fragile`, todos resolubles y deterministas.
- Nivel tutorial: resoluble y con al menos una trampa.

## 15. Decisiones (cerradas)
- **D1. Debut. Cerrada:** nivel 20, con el reinicio único de los niveles 13+ acordado al pasar al currículo (GAME_DESIGN.md §4.1.b). Adaptación 20-21, profundización 22-29.
- **D2. Arrastre largo. Cerrada:** el BFS del arrastre **nunca** cruza hojas intactas. Para pasar por una hoja hay que llevar el dedo celda a celda, a propósito. `findPath` necesita una opción para excluirlas; el solver sigue explorando todos los pasos.
- **D3. Momento de la rotura. Cerrada:** cuando la cola la deja.
- **D4. Lagarto salvado sobre una hoja. Cerrada:** se rompe.
- **D5. Callejón sin salida. Cerrada:** no se avisa. El jugador lo descubre y usa deshacer o reiniciar.
