/** Grid coordinate as [x, y]; x grows right, y grows down. */
export type Cell = [number, number];

export type Direction = "up" | "down" | "left" | "right";

/** cells[0] is the "head" end, cells[n-1] the "tail" end. Both are equally draggable. */
export type GeckoEnd = "head" | "tail";

export type GeckoColor = "green" | "blue" | "red" | "yellow" | "purple" | "orange" | "pink" | "cyan";

// ---------- Level data (JSON) ----------

export interface HoleDef {
	color: GeckoColor;
	cell: Cell;
	capacity?: number;
}

export interface GeckoDef {
	id: string;
	color: GeckoColor;
	cells: Cell[];
}

export interface Level {
	id: number;
	name?: string;
	seed?: number;
	generatorVersion?: number;
	source: "handcrafted" | "generated";
	tutorial?: boolean;
	hint?: string;
	grid: { w: number; h: number };
	holes: HoleDef[];
	geckos: GeckoDef[];
	/** Active mechanic ids. "base" is implicit and handled by the engine itself. */
	mechanics: string[];
	mechanicData: Record<string, unknown>;
	timeLimit: number;
	stars: { two: number; three: number };
	/** minMoves is exact when `optimal`, otherwise an upper bound from a weighted search. */
	meta?: LevelMeta;
}

/** 0 = easy, 1 = medium, 2 = hard, 3 = very hard. */
export type DifficultyTier = 0 | 1 | 2 | 3;

export interface LevelMeta {
	minMoves?: number;
	difficulty?: number;
	optimal?: boolean;
	dependency?: number;
	/** Minimum drags that move a gecko out of the way (not home). The main difficulty signal. */
	parkings?: number;
	tier?: DifficultyTier;
}

export interface LevelPack {
	levels: Level[];
}

/** When a mechanic entered the game. Appended on release, never edited afterwards. */
export interface TimelineEntry {
	id: string;
	debut: number;
}

export interface LevelManifest {
	version: number;
	generatedAt: string;
	packs: { file: string; from: number; to: number }[];
	timeline: TimelineEntry[];
	/** Levels up to this id are published and never regenerated (the game only grows at the end). */
	frozenThrough: number;
	/** Fingerprint of levels 1..frozenThrough, checked by validate:levels. */
	frozenHash?: string;
}

// ---------- Runtime state (serializable, never mutated after a step returns) ----------

export interface Gecko {
	id: string;
	color: GeckoColor;
	cells: Cell[];
	saved: boolean;
}

export interface Hole {
	color: GeckoColor;
	cell: Cell;
	capacity: number;
	filled: number;
}

export type GameStatus = "playing" | "won";

export interface GameState {
	geckos: Gecko[];
	holes: Hole[];
	mechState: Record<string, unknown>;
	steps: number;
	status: GameStatus;
}

// ---------- Events ----------

export type GameEvent =
	| { type: "gecko:moved"; geckoId: string; end: GeckoEnd }
	| { type: "gecko:entered"; geckoId: string; cell: Cell }
	| { type: "gecko:left"; geckoId: string; cell: Cell }
	| { type: "cell:changed"; cell: Cell }
	| { type: "hole:filled"; geckoId: string; cell: Cell }
	| { type: "switch:toggled"; cell: Cell }
	| { type: "gecko:woken"; geckoId: string }
	| { type: "level:won" };

// ---------- Mechanics contract (GAME_DESIGN.md §13.1) ----------

/** Mutable view handed to hooks while a step is being computed (it works on a private draft). */
export interface Ctx {
	readonly level: Level;
	readonly state: GameState;
	data<T>(mechanicId: string): T | undefined;
	emit(event: GameEvent): void;
	geckoAt(cell: Cell): Gecko | undefined;
	holeAt(cell: Cell): Hole | undefined;
	inBounds(cell: Cell): boolean;
}

/** Drawing surface the UI hands to mechanics' render hooks. */
export interface Renderer {
	c: CanvasRenderingContext2D;
	cellSize: number;
	/** Top-left pixel of a cell. */
	toPx(cell: Cell): { x: number; y: number };
	theme: Record<string, string>;
	/** Live game state being drawn (for overlays that depend on more than their own mechState). */
	game: GameState;
	/** Shared look for anything impassable (walls, broken leaves): a hatched rock. */
	drawRock(cell: Cell): void;
}

/** Seeded randomness handed to mechanics by the generator (implemented by generator/rng.ts). */
export interface Random {
	/** Float in [0, 1). */
	next(): number;
	int(min: number, max: number): number;
	chance(p: number): boolean;
	pick<T>(items: readonly T[]): T;
}

/**
 * Mechanic state in `GameState.mechState` is immutable: hooks replace `ctx.state.mechState[id]`
 * instead of mutating it, so cloning a state is a shallow copy (the solver clones millions).
 */
export interface Mechanic<TData = unknown, TState = unknown> {
	id: string;
	/** Hook execution order, lower runs first. Ties broken by id alphabetically. */
	priority: number;
	/** 1-10 cost for the generator's complexity budget. */
	complexity: number;
	/**
	 * Board vocabulary rather than a twist (walls, lengths): once introduced it is part of every later
	 * level and does not count against the complexity budget.
	 */
	basic?: boolean;
	conflictsWith?: string[];
	synergiesWith?: string[];

	initState?(level: Level, data: TData): TState;
	/** Stable serialization for the solver. Required whenever the mechanic has state. */
	stateKey?(state: TState): string;

	canGrab?(ctx: Ctx, gecko: Gecko, end: GeckoEnd): boolean;
	canEnter?(ctx: Ctx, gecko: Gecko, cell: Cell): boolean;
	/**
	 * True when a canEnter veto can lift while a single gecko moves on its own (a door opened by a switch
	 * it steps on). Pathfinding then cannot rule cells out early by flood fill.
	 */
	dynamicVeto?: boolean;
	redirect?(ctx: Ctx, gecko: Gecko, from: Cell, to: Cell): Cell;
	onEnter?(ctx: Ctx, gecko: Gecko, cell: Cell): void;
	onLeave?(ctx: Ctx, gecko: Gecko, cell: Cell): void;
	afterMove?(ctx: Ctx): void;
	onTick?(ctx: Ctx, dt: number): void;
	onEvent?(ctx: Ctx, event: GameEvent): void;

	validateLevel?(level: Level, data: TData): string[];
	/**
	 * Generator: data for this mechanic on an already built board (geckos, holes and walls placed).
	 * `intensity` (0..1) comes from the curriculum. Undefined when it cannot be placed.
	 */
	populate?(rng: Random, level: Level, intensity: number): TData | undefined;
	/**
	 * Generator: the same level with this mechanic made unusable (e.g. leaves turned into walls). If
	 * that variant is still solvable the mechanic is decorative, which teaching levels must avoid.
	 */
	withoutMechanic?(level: Level, data: TData): Level;

	render?(g: Renderer, level: Level, data: TData, state: TState): void;
	tutorialHint?: string;
	/** Player-facing name; a generated debut level is titled with it. */
	name?: string;
}

/** Immutable bundle of a level plus its active mechanics, sorted by priority. Built once per level. */
export interface Rules {
	level: Level;
	mechanics: Mechanic[];
}

export type StepFailure = "not-playing" | "unknown-gecko" | "already-saved" | "cannot-grab" | "blocked";

export type StepResult =
	| { ok: true; state: GameState; events: GameEvent[] }
	| { ok: false; reason: StepFailure };
