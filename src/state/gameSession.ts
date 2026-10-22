import { endCell, findPath, manhattan, moveCell, sameCell, step, createInitialState, createRules } from "../engine";
import type { Cell, Direction, GameEvent, GameState, GeckoEnd, Level, Mechanic, Rules } from "../engine";

export type SessionFeedback = GameEvent | { type: "bump"; geckoId: string; end: GeckoEnd } | { type: "reset" };

export type Outcome = "playing" | "won" | "lost";

export type Stars = 1 | 2 | 3;

/** Everything React needs, as one immutable object per change (useSyncExternalStore-friendly). */
export interface SessionSnapshot {
	state: GameState;
	outcome: Outcome;
	paused: boolean;
	/** Clock starts on the first touch (§2.5). */
	started: boolean;
	canUndo: boolean;
	/** Set when won. */
	stars?: Stars;
	/** Seconds used, set when the level ends. */
	finalTime?: number;
}

/** Board coordinates in cell units: (0, 0) is the top-left corner, (0.5, 0.5) the first cell center. */
export interface Point {
	x: number;
	y: number;
}

interface Drag {
	geckoId: string;
	end: GeckoEnd;
	/** States visited during this drag; [0] is the state at grab time. Lets the finger retrace its path. */
	trail: GameState[];
	/** Finger minus end center at grab time. */
	offset: Point;
	lastBumpAt: number;
}

export interface Grab {
	geckoId: string;
	end: GeckoEnd;
}

const ENDS: readonly GeckoEnd[] = ["head", "tail"];
/** How far from an end center (in cells) a touch still grabs it. */
const GRAB_RADIUS = 0.85;
/** The finger must lead the end by half a cell before it steps. */
const STEP_THRESHOLD = 0.5;
/** Minor-axis lead needed to slide sideways when the main direction is blocked. */
const SLIDE_THRESHOLD = 0.3;
/** Leads at least this long (dropped pointer frames) fall back to pathfinding. */
const JUMP_DISTANCE = 1.5;
const MAX_STEPS_PER_MOVE = 24;
// Jumps only recover dropped pointer frames along a straight-ish line: never a detour the finger did
// not draw (on crowded boards that looked like the gecko teleporting around obstacles).
const MAX_DETOUR = 0;
const PATH_SEARCH_BUDGET = 800;
const LEAN_MAX = 0.3;
const LEAN_BLOCKED = 0.06;
const BUMP_COOLDOWN_MS = 180;

function cellCenter(cell: Cell): Point {
	return { x: cell[0] + 0.5, y: cell[1] + 0.5 };
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** Main and secondary directions of a vector, plus the size of the secondary component. */
function axes(dx: number, dy: number): [Direction, Direction, number] {
	const horizontal: Direction = dx >= 0 ? "right" : "left";
	const vertical: Direction = dy >= 0 ? "down" : "up";
	return Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical, Math.abs(dy)] : [vertical, horizontal, Math.abs(dx)];
}

export function starsFor(level: Level, secondsUsed: number): Stars {
	const remaining = 1 - secondsUsed / level.timeLimit;
	if (remaining >= level.stars.three) {
		return 3;
	}
	return remaining >= level.stars.two ? 2 : 1;
}

/**
 * Owns the live game for one level: state, drag in progress, undo history, clock and outcome.
 * Framework-free so the canvas loop can read it every frame without going through React.
 */
export class GameSession {
	readonly rules: Rules;
	private current: GameState;
	private drag: Drag | undefined;
	private history: GameState[] = [];
	private outcome: Outcome = "playing";
	private paused = false;
	/** Clock: time accumulated before the current running stretch, plus when that stretch began. */
	private elapsedBefore = 0;
	private runningSince: number | undefined;
	private started = false;
	private leanVector: Point | undefined;
	private snapshot: SessionSnapshot;
	private readonly listeners = new Set<() => void>();
	private readonly feedbackListeners = new Set<(event: SessionFeedback) => void>();

	constructor(
		level: Level,
		registry: Record<string, Mechanic>,
		private readonly now: () => number = () => performance.now(),
	) {
		this.rules = createRules(level, registry);
		this.current = createInitialState(this.rules);
		this.snapshot = this.buildSnapshot();
	}

	get state(): GameState {
		return this.current;
	}

	get grabbed(): Grab | undefined {
		return this.drag ? { geckoId: this.drag.geckoId, end: this.drag.end } : undefined;
	}

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getSnapshot = (): SessionSnapshot => this.snapshot;

	onFeedback(listener: (event: SessionFeedback) => void): () => void {
		this.feedbackListeners.add(listener);
		return () => this.feedbackListeners.delete(listener);
	}

	/** Seconds on the clock so far. */
	elapsed(): number {
		const running = this.runningSince === undefined ? 0 : this.now() - this.runningSince;
		return (this.elapsedBefore + running) / 1000;
	}

	timeLeft(): number {
		return Math.max(0, this.rules.level.timeLimit - this.elapsed());
	}

	/** Called every frame; ends the level when the clock runs out. */
	tick(): void {
		if (this.outcome === "playing" && this.runningSince !== undefined && this.timeLeft() <= 0) {
			this.stopClock();
			this.drag = undefined;
			this.outcome = "lost";
			this.notify();
		}
	}

	/** Cell-based wrappers (tests, and anything that thinks in whole cells). */
	grab(cell: Cell): boolean {
		return this.grabAt(cellCenter(cell));
	}

	dragTo(cell: Cell): void {
		this.dragToPoint(cellCenter(cell));
	}

	/**
	 * Grabs the gecko end closest to `point` (board coordinates in cell units), if within reach.
	 * Fingers are imprecise, so touching the area around an end counts too.
	 */
	grabAt(point: Point): boolean {
		if (this.outcome !== "playing" || this.paused) {
			return false;
		}
		let best: { geckoId: string; end: GeckoEnd; center: Point; distance: number } | undefined;
		for (const gecko of this.current.geckos) {
			if (gecko.saved) {
				continue;
			}
			for (const end of ENDS) {
				const center = cellCenter(endCell(gecko, end));
				const distance = Math.hypot(point.x - center.x, point.y - center.y);
				if (!best || distance < best.distance) {
					best = { geckoId: gecko.id, end, center, distance };
				}
			}
		}
		if (!best || best.distance > GRAB_RADIUS) {
			return false;
		}
		if (!this.started) {
			this.started = true;
			this.runningSince = this.now();
		}
		this.drag = {
			geckoId: best.geckoId,
			end: best.end,
			trail: [this.current],
			// Grabbing off-center must not make the end jump: we track the finger's movement instead.
			offset: { x: point.x - best.center.x, y: point.y - best.center.y },
			lastBumpAt: -Infinity,
		};
		this.leanVector = undefined;
		this.notify();
		return true;
	}

	/**
	 * Moves the grabbed end towards the finger one cell at a time while the finger leads it by at least
	 * half a cell. Blocked on the main axis: tries the other one (slides along walls). Moving back onto
	 * the previous position walks the drag back one step (§2.3 rule 5).
	 */
	dragToPoint(point: Point): void {
		const drag = this.drag;
		if (!drag) {
			return;
		}
		const target = { x: point.x - drag.offset.x, y: point.y - drag.offset.y };
		for (let i = 0; i < MAX_STEPS_PER_MOVE; i++) {
			const at = this.grabbedEndCell(drag);
			if (!at) {
				return;
			}
			const center = cellCenter(at);
			const dx = target.x - center.x;
			const dy = target.y - center.y;
			const lead = Math.max(Math.abs(dx), Math.abs(dy));
			if (lead < STEP_THRESHOLD) {
				break;
			}
			const [primary, secondary, minor] = axes(dx, dy);
			const options = minor >= SLIDE_THRESHOLD ? [primary, secondary] : [primary];
			const moved = options.some((dir) => this.advance(drag, dir)) || (lead >= JUMP_DISTANCE && this.jump(drag, target));
			if (!moved) {
				this.bump(drag);
				break;
			}
			if (!this.drag) {
				// Dropped into its hole: release() already ran.
				return;
			}
		}
		this.updateLean(drag, target);
	}

	/** Small visual pull of the grabbed end towards the finger, in cell units. Undefined when idle. */
	get lean(): Point | undefined {
		return this.leanVector;
	}

	private grabbedEndCell(drag: Drag): Cell | undefined {
		const gecko = this.current.geckos.find((g) => g.id === drag.geckoId);
		if (!gecko || gecko.saved) {
			this.release();
			return undefined;
		}
		return endCell(gecko, drag.end);
	}

	/** One step of the grabbed end in `dir`, or one step back if `dir` points at its previous cell. */
	private advance(drag: Drag, dir: Direction): boolean {
		if (this.isRetrace(drag, dir)) {
			drag.trail.pop();
			this.setState(drag.trail[drag.trail.length - 1]);
			return true;
		}
		const result = step(this.rules, this.current, drag.geckoId, drag.end, dir);
		if (!result.ok) {
			return false;
		}
		drag.trail.push(result.state);
		this.setState(result.state);
		result.events.forEach((e) => this.emitFeedback(e));
		if (result.state.geckos.find((g) => g.id === drag.geckoId)?.saved) {
			this.release();
		}
		return true;
	}

	/** Only the immediately previous cell counts: circling back past older cells keeps moving forward. */
	private isRetrace(drag: Drag, dir: Direction): boolean {
		if (drag.trail.length < 2) {
			return false;
		}
		const previous = drag.trail[drag.trail.length - 2].geckos.find((g) => g.id === drag.geckoId);
		const at = this.grabbedEndCell(drag);
		return previous !== undefined && at !== undefined && sameCell(endCell(previous, drag.end), moveCell(at, dir));
	}

	/** Fallback for a finger that leapt ahead (dropped frames): pathfind to the target cell. */
	private jump(drag: Drag, target: Point): boolean {
		const at = this.grabbedEndCell(drag);
		const { w, h } = this.rules.level.grid;
		const cell: Cell = [clamp(Math.floor(target.x), 0, w - 1), clamp(Math.floor(target.y), 0, h - 1)];
		if (!at || sameCell(at, cell)) {
			return false;
		}
		const dirs = findPath(this.rules, this.current, drag.geckoId, drag.end, cell, PATH_SEARCH_BUDGET);
		if (!dirs || dirs.length > manhattan(at, cell) + MAX_DETOUR) {
			return false;
		}
		return dirs.every((dir) => this.drag !== undefined && this.advance(drag, dir));
	}

	private bump(drag: Drag): void {
		const now = this.now();
		if (now - drag.lastBumpAt >= BUMP_COOLDOWN_MS) {
			drag.lastBumpAt = now;
			this.emitFeedback({ type: "bump", geckoId: drag.geckoId, end: drag.end });
		}
	}

	private updateLean(drag: Drag, target: Point): void {
		const at = this.grabbedEndCell(drag);
		if (!at || !this.drag) {
			this.leanVector = undefined;
			return;
		}
		const center = cellCenter(at);
		const dx = target.x - center.x;
		const dy = target.y - center.y;
		const [primary] = axes(dx, dy);
		const amount = Math.max(Math.abs(dx), Math.abs(dy));
		const free = this.isRetrace(drag, primary) || step(this.rules, this.current, drag.geckoId, drag.end, primary).ok;
		// Free direction: follow the finger a little. Blocked: barely budge, so the wall pushes back.
		const pull = Math.min(amount, free ? LEAN_MAX : LEAN_BLOCKED);
		const unit = moveCell([0, 0], primary);
		this.leanVector = { x: unit[0] * pull, y: unit[1] * pull };
	}

	/** Ends the drag; a drag that changed anything becomes one undo step (§2.7). */
	release(): void {
		if (!this.drag) {
			return;
		}
		const before = this.drag.trail[0];
		this.drag = undefined;
		this.leanVector = undefined;
		if (before !== this.current) {
			this.history.push(before);
		}
		this.notify();
	}

	undo(): void {
		const previous = this.history.pop();
		if (!previous || this.outcome !== "playing" || this.paused) {
			if (previous) {
				this.history.push(previous);
			}
			return;
		}
		this.drag = undefined;
		this.setState(previous);
		this.emitFeedback({ type: "reset" });
	}

	pause(): void {
		if (this.outcome === "playing" && !this.paused) {
			this.paused = true;
			this.drag = undefined;
			this.stopClock();
			this.notify();
		}
	}

	resume(): void {
		if (this.paused) {
			this.paused = false;
			if (this.started) {
				this.runningSince = this.now();
			}
			this.notify();
		}
	}

	restart(): void {
		this.drag = undefined;
		this.history = [];
		this.outcome = "playing";
		this.paused = false;
		this.started = false;
		this.elapsedBefore = 0;
		this.runningSince = undefined;
		this.setState(createInitialState(this.rules));
		this.emitFeedback({ type: "reset" });
	}

	private stopClock(): void {
		if (this.runningSince !== undefined) {
			this.elapsedBefore += this.now() - this.runningSince;
			this.runningSince = undefined;
		}
	}

	private setState(state: GameState): void {
		this.current = state;
		if (state.status === "won" && this.outcome === "playing") {
			this.stopClock();
			this.outcome = "won";
		}
		this.notify();
	}

	private buildSnapshot(): SessionSnapshot {
		const ended = this.outcome !== "playing";
		const finalTime = ended ? Math.min(this.elapsed(), this.rules.level.timeLimit) : undefined;
		return {
			state: this.current,
			outcome: this.outcome,
			paused: this.paused,
			started: this.started,
			canUndo: this.history.length > 0,
			stars: this.outcome === "won" && finalTime !== undefined ? starsFor(this.rules.level, finalTime) : undefined,
			finalTime,
		};
	}

	private notify(): void {
		this.snapshot = this.buildSnapshot();
		this.listeners.forEach((l) => l());
	}

	private emitFeedback(event: SessionFeedback): void {
		this.feedbackListeners.forEach((l) => l(event));
	}
}
