# Mecánica: Longitudes variables (`lengths`)

## 1. Concepto
Los lagartos dejan de medir siempre 3: van de 2 a 6 celdas.

## 2. Momento "aha"
El lagarto de 2 se escurre por cualquier hueco, pero el de 5 necesita espacio para girar: a veces hay que mover primero al corto para hacer sitio al largo.

## 3. Reglas
- Sin reglas nuevas en el turno: el motor ya admite cualquier longitud entre 2 y 6 (`validateLevel` base).
- Activa la variación de longitudes en el generador (`minLength`/`maxLength` de `paramsFor`).

## 4. Casos límite
- Longitud 2: el cuello es también la cola; nunca se puede entrar en él (no hay giro en el sitio).
- Longitud 4 en bucle: la cabeza puede entrar en la celda que deja la cola.
- Longitud 6 en tablero 5x7: el generador puede no encontrar sitio; el candidato se descarta y se prueba otro.
- Deshacer / reiniciar: sin estado.
- Lagarto de longitud 1: no permitido (`validateLevel`).

## 5. Datos en el nivel
Ninguno. La longitud está implícita en `geckos[].cells`.

## 6. Estado interno
Ninguno.

## 7. Hooks y prioridad
Ninguno (marcador). Prioridad 0.

## 8. Eventos
No emite ni escucha.

## 9. Interacciones
| Con | Tipo | Comportamiento |
|-----|------|----------------|
| walls | ✔ | Pasillos estrechos + lagartos largos = problemas de orden |

## 10. Generación
`maxLength = min(6, 4 + floor((n - unlock) / 40))`, mínimo 2.

## 11. Complejidad
1. Lagartos largos reducen el espacio de estados (menos posiciones válidas).

## 12. Desbloqueo
Nivel 12 ("Largos y cortos", tutorial a mano).

## 13. Render
Sin cambios: el cuerpo se dibuja como polilínea de cualquier longitud.

## 14. Tests
- `tests/generator.test.ts`: longitudes según el nivel.
- `tests/levels.test.ts`: nivel 12 resoluble.

## 15. Notas
Es un parámetro de generación más que una mecánica de turno; se registra para que el desbloqueo y los tutoriales funcionen igual que con las demás.
