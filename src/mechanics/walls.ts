import { cellKey } from "../engine/cell";
import type { Cell, Mechanic } from "../engine/types";

type WallsData = Cell[];

// Walls are static, so the lookup set is memoized per data array instead of living in mechState.
const wallSets = new WeakMap<WallsData, Set<string>>();

function wallSet(data: WallsData): Set<string> {
	let set = wallSets.get(data);
	if (!set) {
		set = new Set(data.map(cellKey));
		wallSets.set(data, set);
	}
	return set;
}

export const walls: Mechanic<WallsData> = {
	id: "walls",
	priority: 0,
	complexity: 1,
	tutorialHint: "Los muros no se pueden atravesar. Busca el pasillo.",

	canEnter(ctx, _gecko, cell) {
		const data = ctx.data<WallsData>("walls");
		return !data || !wallSet(data).has(cellKey(cell));
	},

	validateLevel(level, data) {
		if (!Array.isArray(data)) {
			return ["walls: mechanicData.walls must be an array of cells"];
		}
		const errors: string[] = [];
		const taken = new Set([
			...level.geckos.flatMap((g) => g.cells.map(cellKey)),
			...level.holes.map((h) => cellKey(h.cell)),
		]);
		for (const cell of data) {
			const [x, y] = cell;
			if (x < 0 || y < 0 || x >= level.grid.w || y >= level.grid.h) {
				errors.push(`walls: ${cellKey(cell)} out of bounds`);
			}
			if (taken.has(cellKey(cell))) {
				errors.push(`walls: ${cellKey(cell)} overlaps a gecko or hole`);
			}
		}
		return errors;
	},

	render(g, _level, data) {
		if (!data) {
			return;
		}
		const inset = g.cellSize * 0.06;
		const size = g.cellSize - inset * 2;
		g.c.fillStyle = g.theme.wall;
		for (const cell of data) {
			const { x, y } = g.toPx(cell);
			g.c.beginPath();
			g.c.roundRect(x + inset, y + inset, size, size, 6);
			g.c.fill();
		}
	},
};
