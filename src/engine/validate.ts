import { cellKey, isAdjacent } from "./cell";
import type { Level, Mechanic } from "./types";

const MIN_GECKO_LENGTH = 2;
const MAX_GECKO_LENGTH = 6;

/** Structural checks shared by every level, plus each active mechanic's own validateLevel. */
export function validateLevel(level: Level, registry: Record<string, Mechanic>): string[] {
	const errors: string[] = [];
	const { w, h } = level.grid;
	const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h;
	const occupied = new Map<string, string>();

	const geckoIds = new Set<string>();
	for (const gecko of level.geckos) {
		if (geckoIds.has(gecko.id)) {
			errors.push(`duplicate gecko id "${gecko.id}"`);
		}
		geckoIds.add(gecko.id);

		if (gecko.cells.length < MIN_GECKO_LENGTH || gecko.cells.length > MAX_GECKO_LENGTH) {
			errors.push(`gecko ${gecko.id} length ${gecko.cells.length} outside ${MIN_GECKO_LENGTH}-${MAX_GECKO_LENGTH}`);
		}
		gecko.cells.forEach((cell, i) => {
			if (!inBounds(cell[0], cell[1])) {
				errors.push(`gecko ${gecko.id} cell ${cellKey(cell)} out of bounds`);
			}
			if (i > 0 && !isAdjacent(gecko.cells[i - 1], cell)) {
				errors.push(`gecko ${gecko.id} is not contiguous at ${cellKey(cell)}`);
			}
			const other = occupied.get(cellKey(cell));
			if (other) {
				errors.push(`gecko ${gecko.id} overlaps ${other} at ${cellKey(cell)}`);
			}
			occupied.set(cellKey(cell), gecko.id);
		});
	}

	for (const hole of level.holes) {
		if (!inBounds(hole.cell[0], hole.cell[1])) {
			errors.push(`hole ${cellKey(hole.cell)} out of bounds`);
		}
		const other = occupied.get(cellKey(hole.cell));
		if (other) {
			errors.push(`hole ${cellKey(hole.cell)} overlaps ${other}`);
		}
		occupied.set(cellKey(hole.cell), `hole(${hole.color})`);
	}

	const colors = new Set(level.geckos.map((g) => g.color));
	for (const color of colors) {
		const need = level.geckos.filter((g) => g.color === color).length;
		const capacity = level.holes.filter((hole) => hole.color === color).reduce((sum, hole) => sum + (hole.capacity ?? 1), 0);
		if (capacity < need) {
			errors.push(`${need} ${color} gecko(s) but only ${capacity} ${color} hole capacity`);
		}
	}

	for (const id of level.mechanics) {
		if (id === "base") {
			continue;
		}
		const mechanic = registry[id];
		if (!mechanic) {
			errors.push(`unknown mechanic "${id}"`);
			continue;
		}
		errors.push(...(mechanic.validateLevel?.(level, level.mechanicData[id]) ?? []));
	}

	return errors.map((e) => `level ${level.id}: ${e}`);
}
