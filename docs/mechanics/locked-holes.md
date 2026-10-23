# Mecánica: Agujeros con candado (`locked-holes`)

> Estado: **implementada** (2026-10-23). Decisiones tomadas por el agente con el visto bueno general del dueño ("te dejo hacer"); revisables tras probarla.

## 1. Concepto
Un agujero cerrado con candado que se abre cuando N geckos ya han entrado en otros agujeros.

## 2. Momento "aha"
El gecko que está al lado de su agujero no puede entrar todavía: estorba justo donde los demás necesitan pasar. Hay que **apartarlo y volver a por él**, y elegir bien a quién se salva primero para abrir el candado.

## 3. Reglas
- Mientras el candado esté cerrado, el agujero es un muro para todos (también para su color).
- Se abre cuando el número total de geckos salvados alcanza `needs`. Cuentan todos los agujeros.
- Abierto, es un agujero normal: entra su color y, lleno, pasa a ser suelo.
- No tiene estado propio: se deriva de los agujeros llenos, que ya están en el estado del juego. Deshacer y reiniciar funcionan sin nada extra.

## 4. Casos límite
1. **Gecko de su color pegado al agujero cerrado:** no puede entrar. Si bloquea el paso, hay que moverlo.
2. **`needs` mayor o igual que el número de geckos:** imposible de abrir. `validateLevel` lo rechaza (máximo: geckos − 1).
3. **Dos candados que se esperan entre sí:** el generador solo acepta niveles resolubles, y el solver lo comprueba.
4. **Candado sobre una celda que no es agujero:** error de `validateLevel`.
5. **Arrastre largo hacia un agujero cerrado:** el BFS lo trata como muro y el gecko rebota, igual que con un muro.

## 5. Datos en el nivel (`mechanicData["locked-holes"]`)
```json
"mechanicData": { "locked-holes": [ { "cell": [4, 0], "needs": 2 } ] }
```

## 6. Estado interno
Ninguno. Abierto o cerrado se calcula con `sum(holes.filled) >= needs`.

## 7. Hooks y prioridad
`canEnter` (veto en la celda del agujero cerrado), `validateLevel`, `populate`, `render`. Prioridad 5.

## 8. Eventos
No emite ni escucha. Abrirse es consecuencia directa de `hole:filled`.

## 9. Interacciones
| Con | Tipo | Comportamiento |
|-----|------|----------------|
| walls, lengths | ○ | Neutra. |
| fragile | ✔ | El gecko que espera al candado tiene que aparcarse, y si para hacerlo cruza una hoja la gasta. Combinación dura. |
| capacity (futura) | definir | ¿Un agujero doble con candado cuenta los geckos que entran en él mismo? |
| switches (futura) | ✔ | Candado abierto por interruptor como variante. |

## 10. Generación (`populate`)
- Número de candados: 1, o 2 con intensidad ≥ 0,7 y al menos 5 geckos.
- Agujeros candidatos: los de los geckos más cercanos a casa (los que irían primero). Cerrarlos rompe el orden obvio.
- `needs` entre 1 y `min(3, geckos − 1)`, más alto cuanto mayor la intensidad.
- El solver descarta los candidatos irresolubles. No hay `withoutMechanic`: es una mecánica que restringe, y su efecto ya se mide en aparcamientos.

## 11. Complejidad
2. Sin estado extra para el solver: reduce movimientos, no amplía el espacio.

## 12. Desbloqueo, tutorial
- Debut: el primer nivel no publicado tras congelar 1-50 → **nivel 51**.
- `tutorialHint`: "Los agujeros con candado se abren cuando entran otros geckos."

## 13. Render
Sobre el pozo: candado en papel y el número de geckos que faltan. Al abrirse, el candado desaparece y el agujero queda normal.

## 14. Tests
`tests/lockedHoles.test.ts`: veto mientras está cerrado, apertura al alcanzar `needs`, validación, `populate` determinista y válido.
