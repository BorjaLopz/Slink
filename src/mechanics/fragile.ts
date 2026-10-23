import { DIRECTIONS, cellKey, moveCell, sameCell } from "../engine/cell";
import type { Cell, Ctx, Level, Mechanic } from "../engine/types";

/** Leaf cells, in level order. Their index is their bit in the state. */
type FragileData = Cell[];
/** Bitmask of broken leaves. A number keeps cloning and hashing free on the solver's hot path. */
type FragileState = number;

/** Bitmask limit: 31 bits stay a positive small integer. */
const MAX_LEAVES = 31;

// Leaves are static data, so the cell → index map is memoized per data array (like walls).
const indexMaps = new WeakMap<FragileData, Map<string, number>>();

function leafIndex(data: FragileData, cell: Cell): number {
	let map = indexMaps.get(data);
	if (!map) {
		map = new Map(data.map((c, i) => [cellKey(c), i]));
		indexMaps.set(data, map);
	}
	return map.get(cellKey(cell)) ?? -1;
}

function brokenMask(ctx: Ctx): FragileState {
	return (ctx.state.mechState.fragile as FragileState | undefined) ?? 0;
}

/** Breaks the leaf on `cell` if there is an intact one. State is replaced, never mutated (§13.3). */
function breakLeaf(ctx: Ctx, cell: Cell): void {
	const data = ctx.data<FragileData>("fragile");
	const index = data ? leafIndex(data, cell) : -1;
	const mask = brokenMask(ctx);
	if (index < 0 || mask & (1 << index)) {
		return;
	}
	ctx.state.mechState.fragile = mask | (1 << index);
	ctx.emit({ type: "cell:changed", cell });
}

export const fragile: Mechanic<FragileData, FragileState> = {
	id: "fragile",
	priority: 10,
	complexity: 4,
	synergiesWith: ["conveyor"],
	tutorialHint: "Las hojas aguantan una pasada. Después se rompen.",
	name: "Hojas frágiles",

	initState() {
		return 0;
	},

	stateKey(state) {
		return state.toString(36);
	},

	canEnter(ctx, _gecko, cell) {
		const data = ctx.data<FragileData>("fragile");
		const index = data ? leafIndex(data, cell) : -1;
		return index < 0 || (brokenMask(ctx) & (1 << index)) === 0;
	},

	// The tail abandoning a leaf breaks it. A long gecko chasing its own tail in a loop re-enters the
	// cell in the same step: the leaf was never actually left, so it holds.
	onLeave(ctx, gecko, cell) {
		if (!gecko.cells.some((c) => sameCell(c, cell))) {
			breakLeaf(ctx, cell);
		}
	},

	// A saved gecko leaves the board at once, abandoning every leaf it was lying on (D4).
	onEvent(ctx, event) {
		if (event.type !== "hole:filled") {
			return;
		}
		const gecko = ctx.state.geckos.find((g) => g.id === event.geckoId);
		gecko?.cells.forEach((cell) => breakLeaf(ctx, cell));
	},

	validateLevel(level, data) {
		if (!Array.isArray(data)) {
			return ["fragile: mechanicData.fragile must be an array of cells"];
		}
		const errors: string[] = [];
		if (data.length > MAX_LEAVES) {
			errors.push(`fragile: at most ${MAX_LEAVES} leaves`);
		}
		const taken = new Set([
			...level.geckos.flatMap((g) => g.cells.map(cellKey)),
			...level.holes.map((h) => cellKey(h.cell)),
			...((level.mechanicData.walls as Cell[] | undefined) ?? []).map(cellKey),
		]);
		const seen = new Set<string>();
		for (const cell of data) {
			const key = cellKey(cell);
			if (cell[0] < 0 || cell[1] < 0 || cell[0] >= level.grid.w || cell[1] >= level.grid.h) {
				errors.push(`fragile: ${key} out of bounds`);
			}
			if (taken.has(key)) {
				errors.push(`fragile: ${key} overlaps a gecko, hole or wall`);
			}
			if (seen.has(key)) {
				errors.push(`fragile: duplicate leaf ${key}`);
			}
			seen.add(key);
		}
		return errors;
	},

	populate(rng, level, intensity) {
		const count = 1 + Math.round(intensity * 3);
		// First a gate: the smallest set of cells some gecko cannot get home without crossing. Leaves
		// there are unavoidable, which is what makes the mechanic matter instead of being decoration.
		const order = level.geckos.map((g) => g.id);
		for (let i = order.length - 1; i > 0; i--) {
			const j = rng.int(0, i);
			[order[i], order[j]] = [order[j], order[i]];
		}
		let leaves: Cell[] = [];
		for (const id of order) {
			const gate = minimumGate(level, id, count + 1);
			if (gate) {
				leaves = gate;
				break;
			}
		}
		const taken = new Set(leaves.map(cellKey));
		const candidates = trafficMap(level).filter((c) => !taken.has(cellKey(c.cell)));
		while (leaves.length < count && candidates.length > 0) {
			// Weighted pick: busy corridor cells are where breaking a leaf early hurts someone else.
			const total = candidates.reduce((sum, c) => sum + c.weight, 0);
			let roll = rng.next() * total;
			const i = Math.max(0, candidates.findIndex((c) => (roll -= c.weight) < 0));
			leaves.push(candidates.splice(i, 1)[0].cell);
		}
		return leaves.length > 0 ? leaves : undefined;
	},

	// Same level with leaves turned into walls: if it is still solvable, the leaves are decorative.
	withoutMechanic(level, data) {
		const walls = (level.mechanicData.walls as Cell[] | undefined) ?? [];
		const mechanicData: Record<string, unknown> = { ...level.mechanicData, walls: [...walls, ...data] };
		delete mechanicData.fragile;
		return {
			...level,
			mechanics: [...level.mechanics.filter((id) => id !== "fragile"), ...(level.mechanics.includes("walls") ? [] : ["walls"])],
			mechanicData,
		};
	},

	render(g, _level, data, state) {
		if (!data) {
			return;
		}
		const inset = g.cellSize * 0.1;
		const size = g.cellSize - inset * 2;
		for (const [i, cell] of data.entries()) {
			const { x, y } = g.toPx(cell);
			if (((state ?? 0) & (1 << i)) !== 0) {
				g.drawRock(cell);
				drawCrack(g.c, x, y, g.cellSize, g.theme.pit);
				continue;
			}
			// Intact leaf: dashed outline, like the sheet's single-use pieces, plus a leaf vein.
			g.c.beginPath();
			g.c.rect(x + inset, y + inset, size, size);
			g.c.fillStyle = g.theme.leaf;
			g.c.fill();
			g.c.setLineDash([g.cellSize * 0.09, g.cellSize * 0.07]);
			g.c.strokeStyle = g.theme.leafEdge;
			g.c.globalAlpha = 0.7;
			g.c.lineWidth = Math.max(1.5, g.cellSize * 0.035);
			g.c.stroke();
			g.c.setLineDash([]);
			g.c.globalAlpha = 0.35;
			g.c.lineCap = "round";
			g.c.beginPath();
			g.c.moveTo(x + g.cellSize * 0.32, y + g.cellSize * 0.68);
			g.c.lineTo(x + g.cellSize * 0.68, y + g.cellSize * 0.32);
			g.c.stroke();
			g.c.globalAlpha = 1;
		}
	},
};

function drawCrack(c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
	c.strokeStyle = color;
	c.lineWidth = Math.max(1.5, size * 0.04);
	c.lineCap = "round";
	c.beginPath();
	c.moveTo(x + size * 0.3, y + size * 0.2);
	c.lineTo(x + size * 0.5, y + size * 0.45);
	c.lineTo(x + size * 0.4, y + size * 0.6);
	c.lineTo(x + size * 0.65, y + size * 0.8);
	c.moveTo(x + size * 0.5, y + size * 0.45);
	c.lineTo(x + size * 0.72, y + size * 0.38);
	c.stroke();
}

interface Weighted {
	cell: Cell;
	weight: number;
}

/**
 * Free cells weighted by how many geckos' shortest routes home cross them, doubled in corridors
 * (two or fewer open neighbours). Routes ignore other geckos: they are the paths a player would try.
 */
function trafficMap(level: Level): Weighted[] {
	const { w, h } = level.grid;
	const walls = new Set(((level.mechanicData.walls as Cell[] | undefined) ?? []).map(cellKey));
	const occupied = new Set(level.geckos.flatMap((g) => g.cells.map(cellKey)));
	const holeColor = new Map(level.holes.map((hole) => [cellKey(hole.cell), hole.color]));
	const open = (cell: Cell): boolean => cell[0] >= 0 && cell[1] >= 0 && cell[0] < w && cell[1] < h && !walls.has(cellKey(cell));
	const traffic = new Map<string, number>();

	for (const gecko of level.geckos) {
		const route = shortestRoute(gecko, open, holeColor);
		route.forEach((cell) => traffic.set(cellKey(cell), (traffic.get(cellKey(cell)) ?? 0) + 1));
	}

	const result: Weighted[] = [];
	for (const [key, count] of traffic) {
		const [x, y] = key.split(",").map(Number) as Cell;
		if (occupied.has(key) || holeColor.has(key)) {
			continue;
		}
		const exits = DIRECTIONS.filter((d) => open(moveCell([x, y], d))).length;
		result.push({ cell: [x, y], weight: count * (exits <= 2 ? 2 : 1) });
	}
	// Stable order so the RNG draw, and therefore the level, depends only on the seed.
	return result.sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0]);
}

/** Cells between the closer end of a gecko and its hole (both excluded), by plain grid BFS. */
function shortestRoute(gecko: { color: string; cells: Cell[] }, open: (c: Cell) => boolean, holeColor: Map<string, string>): Cell[] {
	const ends = [gecko.cells[0], gecko.cells[gecko.cells.length - 1]];
	const body = new Set(gecko.cells.map(cellKey));
	const parent = new Map<string, string | undefined>(ends.map((c) => [cellKey(c), undefined]));
	const queue: Cell[] = [...ends];
	for (let i = 0; i < queue.length; i++) {
		const cell = queue[i];
		for (const dir of DIRECTIONS) {
			const next = moveCell(cell, dir);
			const key = cellKey(next);
			if (!open(next) || parent.has(key) || body.has(key)) {
				continue;
			}
			const color = holeColor.get(key);
			if (color !== undefined && color !== gecko.color) {
				continue;
			}
			parent.set(key, cellKey(cell));
			if (color === gecko.color) {
				const route: Cell[] = [];
				for (let k = parent.get(key); k !== undefined && !ends.some((e) => cellKey(e) === k); k = parent.get(k)) {
					route.push(k.split(",").map(Number) as Cell);
				}
				return route;
			}
			queue.push(next);
		}
	}
	return [];
}

const UNCUTTABLE = 1_000;

/**
 * Minimum vertex cut between a gecko and its hole on the free cells (max-flow with split nodes).
 * Cells under geckos and holes can pass flow but cannot be cut, since leaves never start there.
 * Returns undefined when the smallest gate is larger than `limit`.
 */
function minimumGate(level: Level, geckoId: string, limit: number): Cell[] | undefined {
	const gecko = level.geckos.find((g) => g.id === geckoId);
	const hole = gecko && level.holes.find((h) => h.color === gecko.color);
	if (!gecko || !hole) {
		return undefined;
	}
	const { w, h } = level.grid;
	const walls = new Set(((level.mechanicData.walls as Cell[] | undefined) ?? []).map(cellKey));
	const occupied = new Set(level.geckos.flatMap((g) => g.cells.map(cellKey)));
	const holeColor = new Map(level.holes.map((x) => [cellKey(x.cell), x.color]));
	const index = (c: Cell): number => c[1] * w + c[0];
	const passable = (c: Cell): boolean => {
		const key = cellKey(c);
		const color = holeColor.get(key);
		return c[0] >= 0 && c[1] >= 0 && c[0] < w && c[1] < h && !walls.has(key) && (color === undefined || color === gecko.color);
	};

	// Node 2i = cell i "in", 2i+1 = cell i "out"; the in→out edge carries the cell's capacity.
	const size = w * h * 2 + 1;
	const source = size - 1;
	const sink = 2 * index(hole.cell);
	const capacity = new Map<number, number>();
	const neighbours: number[][] = Array.from({ length: size }, () => []);
	const addEdge = (a: number, b: number, cap: number): void => {
		capacity.set(a * size + b, (capacity.get(a * size + b) ?? 0) + cap);
		capacity.set(b * size + a, capacity.get(b * size + a) ?? 0);
		neighbours[a].push(b);
		neighbours[b].push(a);
	};
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const cell: Cell = [x, y];
			if (!passable(cell)) {
				continue;
			}
			const i = index(cell);
			const key = cellKey(cell);
			addEdge(2 * i, 2 * i + 1, occupied.has(key) || holeColor.has(key) ? UNCUTTABLE : 1);
			for (const dir of DIRECTIONS) {
				const next = moveCell(cell, dir);
				if (passable(next)) {
					addEdge(2 * i + 1, 2 * index(next), UNCUTTABLE);
				}
			}
		}
	}
	gecko.cells.forEach((c) => addEdge(source, 2 * index(c) + 1, UNCUTTABLE));

	const residual = (a: number, b: number): number => capacity.get(a * size + b) ?? 0;
	const reachable = (): Int32Array => {
		const parent = new Int32Array(size).fill(-1);
		parent[source] = source;
		const queue = [source];
		for (let q = 0; q < queue.length; q++) {
			for (const next of neighbours[queue[q]]) {
				if (parent[next] < 0 && residual(queue[q], next) > 0) {
					parent[next] = queue[q];
					queue.push(next);
				}
			}
		}
		return parent;
	};

	// Edmonds-Karp, stopping as soon as the gate is known to be too wide. Every useful path costs at
	// least one unit-capacity cell, so pushing one unit per path is enough.
	let flow = 0;
	for (;;) {
		const parent = reachable();
		if (parent[sink] < 0) {
			break;
		}
		for (let v = sink; v !== source; v = parent[v]) {
			const u = parent[v];
			capacity.set(u * size + v, residual(u, v) - 1);
			capacity.set(v * size + u, residual(v, u) + 1);
		}
		flow += 1;
		if (flow > limit) {
			return undefined;
		}
	}
	if (flow === 0) {
		return undefined;
	}
	// The cut: cells whose "in" side is still reachable but whose "out" side is not.
	const parent = reachable();
	const gate: Cell[] = [];
	for (let i = 0; i < w * h; i++) {
		if (parent[2 * i] >= 0 && parent[2 * i + 1] < 0) {
			gate.push([i % w, Math.floor(i / w)]);
		}
	}
	return gate.length === flow ? gate : undefined;
}
