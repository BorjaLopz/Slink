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

export interface LevelManifest {
	version: number;
	generatedAt: string;
	packs: { file: string; from: number; to: number }[];
	mechanicsUnlock: Record<string, number>;
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
}

export interface Mechanic<TData = unknown, TState = unknown> {
	id: string;
	/** Hook execution order, lower runs first. Ties broken by id alphabetically. */
	priority: number;
	/** 1-10 cost for the generator's complexity budget. */
	complexity: number;
	conflictsWith?: string[];
	synergiesWith?: string[];

	initState?(level: Level, data: TData): TState;
	/** Stable serialization for the solver. Required whenever the mechanic has state. */
	stateKey?(state: TState): string;

	canGrab?(ctx: Ctx, gecko: Gecko, end: GeckoEnd): boolean;
	canEnter?(ctx: Ctx, gecko: Gecko, cell: Cell): boolean;
	redirect?(ctx: Ctx, gecko: Gecko, from: Cell, to: Cell): Cell;
	onEnter?(ctx: Ctx, gecko: Gecko, cell: Cell): void;
	onLeave?(ctx: Ctx, gecko: Gecko, cell: Cell): void;
	afterMove?(ctx: Ctx): void;
	onTick?(ctx: Ctx, dt: number): void;
	onEvent?(ctx: Ctx, event: GameEvent): void;

	validateLevel?(level: Level, data: TData): string[];

	render?(g: Renderer, level: Level, data: TData, state: TState): void;
	tutorialHint?: string;
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
