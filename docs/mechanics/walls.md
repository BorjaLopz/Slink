# Mecánica: Muros (`walls`)

## 1. Concepto
Celdas infranqueables que convierten el tablero abierto en pasillos.

## 2. Momento "aha"
Un hueco de una sola celda obliga a decidir **quién pasa primero**: el orden importa más que la ruta.

## 3. Reglas
- Ninguna parte de un lagarto puede entrar en un muro.
- Los muros son estáticos: no cambian durante la partida.

## 4. Casos límite
- Lagarto de longitud 2 o 6 junto a un muro: sin diferencias, el veto es por celda.
- Muro sobre un lagarto o agujero en el JSON: error de `validateLevel`.
- Muro fuera del tablero: error de `validateLevel`.
- Pasillo de ancho 1 con dos lagartos enfrentados: solo pasa uno; el solver lo detecta como nivel de orden.
- Deshacer / reiniciar: sin estado, nada que restaurar.

## 5. Datos en el nivel
```json
"mechanicData": { "walls": [[0, 3], [1, 3], [3, 3]] }
```
`validateLevel`: array de celdas, dentro del tablero, sin solapar lagartos ni agujeros.

## 6. Estado interno
Ninguno (`initState`/`stateKey` no implementados). El `Set` de búsqueda se memoiza por array de datos.

## 7. Hooks y prioridad
`canEnter` (veto), `validateLevel`, `render`. Prioridad 0.

## 8. Eventos
No emite ni escucha.

## 9. Interacciones
| Con | Tipo | Comportamiento |
|-----|------|----------------|
| (resto) | ○ | Neutra: es la base sobre la que se apoyan las demás |

## 10. Generación
Pendiente (Fase 2): muros aleatorios sin dejar zonas aisladas.

## 11. Complejidad
1. No añade estados al solver (reduce el espacio).

## 12. Desbloqueo
Nivel 6 ("El pasillo", tutorial).

## 13. Render
Bloques redondeados del color `wall` del tema, a ras del tablero (sin sombra).

## 14. Tests
- Veto de movimiento (`tests/engine.test.ts`).
- Validación de solapes (`tests/engine.test.ts`).
- Nivel 6 resoluble (`tests/levels.test.ts`).

## 15. Notas
Primera mecánica "de verdad": sirve para validar el registro y el pipeline.
