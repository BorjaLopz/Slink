import { DIRECTIONS, cellKey, manhattan, moveCell } from "../engine/cell";
import { step } from "../engine/pipeline";
import { findPath } from "../engine/path";
import { createInitialState, createRules, stateKey } from "../engine/state";
import type { Cell, DifficultyTier, GameState, Gecko, GeckoColor, GeckoDef, HoleDef, Level, Mechanic } from "../engine/types";
import { dragTargets, minParkings } from "../solver/parking";
import { heuristic, solve } from "../solver/solve";
import type { SolveResult } from "../solver/solve";
import { paramsFor, tierFor } from "./difficulty";
import type { LevelParams } from "./difficulty";
import { Rng, hashSeed } from "./rng";

/** v2: candidates are picked by measured parking drags (difficulty tiers). */
export const GENERATOR_VERSION = 2;

const COLORS: readonly GeckoColor[] = ["green", "blue", "red", "yellow", "purple", "orange", "cyan", "pink"];
/** Scrambles per level; harder tiers get more tries because the right tangle is rarer. */
const BASE_SCRAMBLES = 6;
const EXTRA_SCRAMBLES_PER_TIER = 10;
/** Snapshots kept per scramble that already need at least one parking drag. */
const MAX_TANGLED_SNAPSHOTS = 6;
const SNAPSHOT_EVERY = 3;
const PARKING_SEARCH = { maxDepth: 3, maxStates: 3_000, maxDragStates: 100, maxWork: 15_000 };
/** Random dense boards tried per level for tiers above easy. */
const DENSE_ATTEMPTS_PER_TIER = 50;
/** Hill-climb proposals per level when scrambling alone did not reach the target tier. */
const CLIMB_PROPOSALS = 60;
/** Chance of accepting a proposal that lowers the parking count (escapes plateaus). */
const CLIMB_DOWNHILL = 0.08;
const PLACEMENT_ATTEMPTS = 60;
/**
 * Search tiers: exact first while it is cheap, then progressively greedier searches whose minMoves
 * is an upper bound. Big boards would otherwise take minutes per candidate.
 */
const SEARCH_TIERS: readonly { weight: number; maxStates: number }[] = [
	{ weight: 1, maxStates: 3_000 },
	{ weight: 3, maxStates: 60_000 },
];
/** How often the scramble takes its best-scoring move instead of a random legal one. */
const SCRAMBLE_GREED = 0.7;
/** Scramble score weights. Enclosing a gecko is what creates ordering puzzles; distance just adds work. */
const DISTANCE_WEIGHT = 0.5;
const BLOCK_WEIGHT = 1;
const ENCLOSED_WEIGHT = 12;
/** Seconds a player needs per single-cell step, plus a fixed thinking allowance. */
const SEC_PER_STEP = 0.7;
const THINKING_SECONDS = 8;

export interface Evaluation {
	minMoves: number;
	optimal: boolean;
	/** Moves if no gecko were ever in another's way (admissible lower bound). */
	idealMoves: number;
	/** minMoves / idealMoves. 1 = no detours at all. */
	ratio: number;
	/**
	 * Share of geckos that cannot reach their hole while everyone else stays still. Moves are
	 * reversible, so there are hardly any dead ends: the puzzle is mostly about ordering, and this
	 * measures exactly that.
	 */
	dependency: number;
	statesExplored: number;
}

export interface GenerateOptions {
	registry: Record<string, Mechanic>;
	unlocks: Record<string, number>;
	/** Overrides the number of scrambles (tests use fewer). */
	candidates?: number;
}

interface Candidate {
	level: Level;
	parkings: number;
	tier: DifficultyTier;
	/** Steps of the solution the parking search found; fallback when the solver runs out of budget. */
	steps: number;
}

/**
 * Reverse generation (GAME_DESIGN.md §4.2): every gecko starts one step away from its hole, then
 * the board is scrambled with legal engine steps. Steps are reversible, so replaying the scramble
 * backwards is always a solution.
 *
 * Each scramble yields a few snapshots; each is measured by minimum parking drags (the difficulty a
 * player actually feels) and the first one that lands on the tier this level should have wins. If no
 * snapshot reaches it, the closest one is used and labelled with what it really is.
 */
export function generateLevel(n: number, options: GenerateOptions): Level {
	const params = paramsFor(n, options.unlocks);
	const seed = hashSeed(n, GENERATOR_VERSION);
	const rng = new Rng(seed);
	const scrambles = options.candidates ?? BASE_SCRAMBLES + EXTRA_SCRAMBLES_PER_TIER * params.targetTier;
	let best: Candidate | undefined;
	const distance = (c: Candidate): number => Math.abs(c.tier - params.targetTier);
	// Easy levels come from reverse scrambles; harder ones from crowded random boards, which are far
	// more likely to need parking drags (see OCCUPANCY_BY_TIER). minParkings proves them solvable.
	const reverse = (count: number): (() => Level[])[] =>
		Array.from({ length: count }, () => () => buildCandidates(n, seed, params, rng, options.registry));
	const dense = (count: number): (() => Level[])[] =>
		Array.from({ length: count }, () => () => {
			const level = buildDenseCandidate(n, seed, params, rng);
			return level ? [level] : [];
		});
	const search = (sources: (() => Level[])[]): void => {
		for (let i = 0; i < sources.length && (!best || distance(best) > 0); i++) {
			for (const level of sources[i]()) {
				const rules = createRules(level, options.registry);
				const maxDepth = Math.min(3, params.targetTier);
				const { parkings, exhausted, steps } = minParkings(rules, createInitialState(rules), { ...PARKING_SEARCH, maxDepth });
				if (!Number.isFinite(parkings) || exhausted) {
					continue;
				}
				const candidate: Candidate = { level, parkings, steps, tier: tierFor(parkings, level.geckos.length) };
				if (!best || distance(candidate) < distance(best)) {
					best = candidate;
				}
				if (distance(best) === 0) {
					break;
				}
			}
		}
	};
	if (params.targetTier === 0) {
		search(reverse(scrambles));
	} else {
		search(dense(options.candidates ?? DENSE_ATTEMPTS_PER_TIER * params.targetTier));
		if (!best) {
			// No crowded board was both placeable and provably solvable: fall back to reverse generation.
			search(reverse(BASE_SCRAMBLES));
		}
	}
	if (best && distance(best) > 0 && best.tier < params.targetTier) {
		best = climb(best, params.targetTier, rng, options.registry);
	}
	if (!best) {
		throw new Error(`generator: no acceptable candidate for level ${n} (seed ${seed})`);
	}
	// The parking search already found a full solution, so its step count is a valid fallback.
	const evaluation = evaluateLevel(best.level, options.registry, best.steps);
	if (!evaluation) {
		throw new Error(`generator: level ${n} (seed ${seed}) could not be solved`);
	}
	return finalize(best.level, evaluation, params, best);
}

/**
 * Local search towards the target tier: propose a random drag of a random gecko and keep it unless it
 * makes the level easier. Every state reachable through reversible moves stays solvable, so the
 * reverse-generation guarantee holds.
 */
function climb(start: Candidate, target: DifficultyTier, rng: Rng, registry: Record<string, Mechanic>): Candidate {
	const rules = createRules(start.level, registry);
	let state = createInitialState(rules);
	let current = start.parkings;
	let best = start;
	for (let i = 0; i < CLIMB_PROPOSALS && best.tier < target; i++) {
		const free = state.geckos.filter((g) => !g.saved);
		const gecko = rng.pick(free);
		const options = dragTargets(rules, state, gecko.id, rng.chance(0.5) ? "head" : "tail", 60);
		if (options.length === 0) {
			continue;
		}
		const proposal = rng.pick(options);
		const { parkings, exhausted, steps } = minParkings(rules, proposal, { ...PARKING_SEARCH, maxDepth: Math.min(3, target) });
		if (!Number.isFinite(parkings) || exhausted || (parkings < current && !rng.chance(CLIMB_DOWNHILL))) {
			continue;
		}
		state = { ...proposal, steps: 0 };
		current = parkings;
		if (parkings > best.parkings) {
			const level = { ...start.level, geckos: state.geckos.map((g) => ({ id: g.id, color: g.color, cells: g.cells })) };
			best = { level, parkings, steps, tier: tierFor(parkings, level.geckos.length) };
		}
	}
	return best;
}

/** Solves a level and derives its difficulty metrics. Undefined when it is not solvable. */
export function evaluateLevel(level: Level, registry: Record<string, Mechanic>, knownSolutionSteps = 0): Evaluation | undefined {
	const rules = createRules(level, registry);
	const initial = createInitialState(rules);
	let result: SolveResult | undefined;
	let optimal = false;
	for (const tier of SEARCH_TIERS) {
		result = solve(rules, initial, tier);
		if (!result.exhausted) {
			optimal = tier.weight === 1;
			break;
		}
	}
	const solved = result?.solvable === true;
	if (!solved && knownSolutionSteps <= 0) {
		return undefined;
	}
	const minMoves = solved && result ? result.minMoves : knownSolutionSteps;
	const idealMoves = Math.max(1, heuristic(initial));
	return {
		minMoves,
		optimal: solved && optimal,
		idealMoves,
		ratio: minMoves / idealMoves,
		dependency: dependency(rules, initial),
		statesExplored: result?.statesExplored ?? 0,
	};
}

/** Initial-state hash used to reject duplicates (§10). */
export function initialKey(level: Level, registry: Record<string, Mechanic>): string {
	const rules = createRules(level, registry);
	const walls = JSON.stringify(level.mechanicData.walls ?? []);
	const holes = level.holes.map((h) => `${h.color}@${cellKey(h.cell)}`).join(",");
	return `${level.grid.w}x${level.grid.h}|${walls}|${holes}|${stateKey(rules, createInitialState(rules))}`;
}

/** Single number for sorting/plots: amount of work, scaled up by ordering and detours. */
export function difficultyScore(evaluation: Evaluation): number {
	return Math.round((evaluation.minMoves / 10) * (1 + evaluation.dependency) * evaluation.ratio * 10) / 10;
}

const DEPENDENCY_SEARCH_STATES = 3_000;

function dependency(rules: ReturnType<typeof createRules>, initial: GameState): number {
	const { geckos, holes } = rules.level;
	let blocked = 0;
	for (const gecko of geckos) {
		const reachable = holes
			.filter((h) => h.color === gecko.color)
			.some((h) =>
				(["head", "tail"] as const).some((end) => findPath(rules, initial, gecko.id, end, h.cell, DEPENDENCY_SEARCH_STATES) !== undefined),
			);
		if (!reachable) {
			blocked += 1;
		}
	}
	return blocked / geckos.length;
}

export function timeLimitFor(minMoves: number, timeFactor: number): number {
	// timeFactor 1 → 2x the raw solution time, 0.5 → 1.3x (§10: 1.3x-2x margin).
	const margin = 1.3 + 0.7 * ((timeFactor - 0.5) / 0.5);
	return Math.ceil((THINKING_SECONDS + minMoves * SEC_PER_STEP * margin) / 5) * 5;
}

function finalize(level: Level, evaluation: Evaluation, params: LevelParams, measured: Candidate): Level {
	return {
		...level,
		timeLimit: timeLimitFor(evaluation.minMoves, params.timeFactor),
		meta: {
			minMoves: evaluation.minMoves,
			difficulty: difficultyScore(evaluation),
			optimal: evaluation.optimal,
			dependency: Math.round(evaluation.dependency * 100) / 100,
			parkings: measured.parkings,
			tier: measured.tier,
		},
	};
}

// ---------- Candidate construction ----------

/** One board + scramble; returns the scramble snapshots worth measuring (possibly none). */
function buildCandidates(n: number, seed: number, params: LevelParams, rng: Rng, registry: Record<string, Mechanic>): Level[] {
	const { w, h } = params;
	const walls = params.wallDensity > 0 ? placeWalls(w, h, params.wallDensity, rng) : [];
	const blocked = new Set(walls.map(cellKey));
	const holes: HoleDef[] = [];
	const geckos: GeckoDef[] = [];

	for (let i = 0; i < params.geckos; i++) {
		const color = COLORS[i % COLORS.length];
		const length = rng.int(params.minLength, params.maxLength);
		const placed = placeGeckoAtHole(w, h, length, blocked, rng);
		if (!placed) {
			return [];
		}
		holes.push({ color, cell: placed.hole });
		geckos.push({ id: `g${i + 1}`, color, cells: placed.cells });
		blocked.add(cellKey(placed.hole));
		placed.cells.forEach((c) => blocked.add(cellKey(c)));
	}

	const level: Level = {
		id: n,
		seed,
		generatorVersion: GENERATOR_VERSION,
		source: "generated",
		grid: { w, h },
		holes,
		geckos,
		mechanics: params.mechanics,
		mechanicData: walls.length > 0 ? { walls } : {},
		timeLimit: 0,
		stars: { two: 0.3, three: 0.6 },
	};

	return scramble(level, params.scramblePerGecko * params.geckos, rng, registry).map((state) => ({
		...level,
		geckos: state.geckos.map((g) => ({ id: g.id, color: g.color, cells: g.cells })),
	}));
}

/**
 * Crowded random board: holes and geckos anywhere (not next to each other). Unlike reverse generation
 * this may be unsolvable; the caller only keeps boards whose parking search finds a full solution.
 */
function buildDenseCandidate(n: number, seed: number, params: LevelParams, rng: Rng): Level | undefined {
	const { w, h } = params;
	const walls = params.wallDensity > 0 ? placeWalls(w, h, params.wallDensity / 2, rng) : [];
	const taken = new Set(walls.map(cellKey));
	const isFree = (c: Cell): boolean => c[0] >= 0 && c[1] >= 0 && c[0] < w && c[1] < h && !taken.has(cellKey(c));
	const randomFreeCell = (): Cell | undefined => {
		for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
			const cell: Cell = [rng.int(0, w - 1), rng.int(0, h - 1)];
			if (isFree(cell)) {
				return cell;
			}
		}
		return undefined;
	};
	const holes: HoleDef[] = [];
	const geckos: GeckoDef[] = [];

	for (let i = 0; i < params.geckos; i++) {
		const color = COLORS[i % COLORS.length];
		const hole = randomFreeCell();
		if (!hole) {
			return undefined;
		}
		taken.add(cellKey(hole));
		const length = rng.int(params.minLength, params.maxLength);
		let cells: Cell[] = [];
		for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && cells.length < length; attempt++) {
			const start = randomFreeCell();
			if (!start) {
				break;
			}
			cells = [start];
			const local = new Set([cellKey(start)]);
			while (cells.length < length) {
				const tip = cells[cells.length - 1];
				const options = DIRECTIONS.map((d) => moveCell(tip, d)).filter((c) => isFree(c) && !local.has(cellKey(c)));
				if (options.length === 0) {
					break;
				}
				const next = rng.pick(options);
				local.add(cellKey(next));
				cells.push(next);
			}
		}
		if (cells.length < length) {
			return undefined;
		}
		cells.forEach((c) => taken.add(cellKey(c)));
		holes.push({ color, cell: hole });
		geckos.push({ id: `g${i + 1}`, color, cells });
	}

	return {
		id: n,
		seed,
		generatorVersion: GENERATOR_VERSION,
		source: "generated",
		grid: { w, h },
		holes,
		geckos,
		mechanics: params.mechanics,
		mechanicData: walls.length > 0 ? { walls } : {},
		timeLimit: 0,
		stars: { two: 0.3, three: 0.6 },
	};
}

/** Adds walls one by one, skipping any that would split the free area in two. */
function placeWalls(w: number, h: number, density: number, rng: Rng): Cell[] {
	const target = Math.round(w * h * density);
	const all: Cell[] = [];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			all.push([x, y]);
		}
	}
	const walls: Cell[] = [];
	const wallKeys = new Set<string>();
	for (const cell of rng.shuffle(all)) {
		if (walls.length >= target) {
			break;
		}
		wallKeys.add(cellKey(cell));
		if (isConnected(w, h, wallKeys)) {
			walls.push(cell);
		} else {
			wallKeys.delete(cellKey(cell));
		}
	}
	return walls;
}

function isConnected(w: number, h: number, blocked: Set<string>): boolean {
	const free = w * h - blocked.size;
	let start: Cell | undefined;
	for (let i = 0; i < w * h && !start; i++) {
		const cell: Cell = [i % w, Math.floor(i / w)];
		if (!blocked.has(cellKey(cell))) {
			start = cell;
		}
	}
	if (!start) {
		return false;
	}
	const seen = new Set([cellKey(start)]);
	const stack = [start];
	while (stack.length > 0) {
		const cell = stack.pop() as Cell;
		for (const dir of DIRECTIONS) {
			const next = moveCell(cell, dir);
			const key = cellKey(next);
			if (next[0] >= 0 && next[1] >= 0 && next[0] < w && next[1] < h && !blocked.has(key) && !seen.has(key)) {
				seen.add(key);
				stack.push(next);
			}
		}
	}
	return seen.size === free;
}

/** Picks a hole cell and grows a self-avoiding body from a neighbouring cell. */
function placeGeckoAtHole(w: number, h: number, length: number, blocked: Set<string>, rng: Rng): { hole: Cell; cells: Cell[] } | undefined {
	const isFree = (c: Cell, taken: Set<string>): boolean =>
		c[0] >= 0 && c[1] >= 0 && c[0] < w && c[1] < h && !blocked.has(cellKey(c)) && !taken.has(cellKey(c));

	for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
		const hole: Cell = [rng.int(0, w - 1), rng.int(0, h - 1)];
		if (!isFree(hole, new Set())) {
			continue;
		}
		const taken = new Set([cellKey(hole)]);
		const cells: Cell[] = [];
		let tip = hole;
		for (let i = 0; i < length; i++) {
			const options = DIRECTIONS.map((d) => moveCell(tip, d)).filter((c) => isFree(c, taken));
			if (options.length === 0) {
				break;
			}
			tip = rng.pick(options);
			taken.add(cellKey(tip));
			cells.push(tip);
		}
		if (cells.length === length) {
			return { hole, cells };
		}
	}
	return undefined;
}

/**
 * Random legal walk that never lets a gecko drop into a hole. Biased towards states where geckos are
 * far from their holes AND in each other's way, otherwise each one just wanders off on its own and the
 * level is solved by walking every gecko straight home.
 */
function scramble(level: Level, steps: number, rng: Rng, registry: Record<string, Mechanic>): GameState[] {
	const rules = createRules(level, registry);
	let state = createInitialState(rules);
	const walls = new Set(((level.mechanicData.walls as Cell[] | undefined) ?? []).map(cellKey));
	const holeOf = new Map(level.geckos.map((g, i) => [g.id, level.holes[i].cell]));
	const distance = (gecko: Gecko): number => {
		const hole = holeOf.get(gecko.id) as Cell;
		return Math.min(manhattan(gecko.cells[0], hole), manhattan(gecko.cells[gecko.cells.length - 1], hole));
	};

	const score = (s: GameState): number =>
		DISTANCE_WEIGHT * s.geckos.reduce((sum, g) => sum + distance(g), 0) +
		BLOCK_WEIGHT * blockers(s, holeOf) +
		ENCLOSED_WEIGHT * enclosed(level, s, holeOf, walls);
	// Greedy walks drift: a great tangle reached mid-way can be undone later, so keep the best one
	// seen once the board has had some time to mix.
	let best = { state, score: -Infinity };
	const settleAfter = Math.floor(steps / 3);
	// Snapshots where "send everyone home in some order" already fails, i.e. at least one parking drag.
	const tangled: GameState[] = [];
	const needsParking = (s: GameState): boolean => minParkings(rules, s, { maxDepth: 0 }).parkings > 0;

	for (let i = 0; i < steps; i++) {
		const gecko = rng.pick(state.geckos);
		const end = rng.chance(0.5) ? "head" : "tail";
		const options: { state: GameState; score: number }[] = [];
		for (const dir of DIRECTIONS) {
			const result = step(rules, state, gecko.id, end, dir);
			if (!result.ok) {
				continue;
			}
			const moved = result.state.geckos.find((g) => g.id === gecko.id) as Gecko;
			if (!moved.saved) {
				options.push({ state: result.state, score: score(result.state) });
			}
		}
		if (options.length === 0) {
			continue;
		}
		const chosen = rng.chance(SCRAMBLE_GREED)
			? options.reduce((a, b) => (b.score > a.score ? b : a))
			: rng.pick(options);
		state = chosen.state;
		if (i >= settleAfter && chosen.score > best.score) {
			best = chosen;
		}
		if (i >= settleAfter && i % SNAPSHOT_EVERY === 0 && tangled.length < MAX_TANGLED_SNAPSHOTS && needsParking(state)) {
			tangled.push(state);
		}
	}
	return [best.state, ...tangled].map((s) => ({ ...s, steps: 0 }));
}

/** Counts other geckos' cells and foreign holes inside each gecko's bounding box to its hole. */
function blockers(state: GameState, holeOf: Map<string, Cell>): number {
	let count = 0;
	for (const gecko of state.geckos) {
		const hole = holeOf.get(gecko.id) as Cell;
		const head = gecko.cells[0];
		const tail = gecko.cells[gecko.cells.length - 1];
		const from = manhattan(head, hole) <= manhattan(tail, hole) ? head : tail;
		const minX = Math.min(from[0], hole[0]);
		const maxX = Math.max(from[0], hole[0]);
		const minY = Math.min(from[1], hole[1]);
		const maxY = Math.max(from[1], hole[1]);
		const inBox = (c: Cell): boolean => c[0] >= minX && c[0] <= maxX && c[1] >= minY && c[1] <= maxY;
		for (const other of state.geckos) {
			if (other.id !== gecko.id) {
				count += other.cells.filter(inBox).length;
			}
		}
		for (const [id, otherHole] of holeOf) {
			if (id !== gecko.id && inBox(otherHole)) {
				count += 1;
			}
		}
	}
	return count;
}

/**
 * Cheap proxy for "dependency": how many geckos have no free route from either end to their hole
 * while everyone else stays put (flood fill over cells; ignores the body's own movement).
 */
function enclosed(level: Level, state: GameState, holeOf: Map<string, Cell>, walls: Set<string>): number {
	const { w, h } = level.grid;
	const occupied = new Map<string, string>();
	for (const gecko of state.geckos) {
		gecko.cells.forEach((c) => occupied.set(cellKey(c), gecko.id));
	}
	const holeKeys = new Map([...holeOf].map(([id, cell]) => [cellKey(cell), id]));
	let count = 0;
	for (const gecko of state.geckos) {
		const target = cellKey(holeOf.get(gecko.id) as Cell);
		const passable = (cell: Cell): boolean => {
			if (cell[0] < 0 || cell[1] < 0 || cell[0] >= w || cell[1] >= h) {
				return false;
			}
			const key = cellKey(cell);
			const owner = occupied.get(key);
			const holeOwner = holeKeys.get(key);
			return !walls.has(key) && (owner === undefined || owner === gecko.id) && (holeOwner === undefined || holeOwner === gecko.id);
		};
		const start = [gecko.cells[0], gecko.cells[gecko.cells.length - 1]];
		const seen = new Set(start.map(cellKey));
		const stack = [...start];
		let reached = false;
		while (stack.length > 0 && !reached) {
			const cell = stack.pop() as Cell;
			for (const dir of DIRECTIONS) {
				const next = moveCell(cell, dir);
				const key = cellKey(next);
				if (key === target) {
					reached = true;
					break;
				}
				if (!seen.has(key) && passable(next)) {
					seen.add(key);
					stack.push(next);
				}
			}
		}
		if (!reached) {
			count += 1;
		}
	}
	return count;
}
