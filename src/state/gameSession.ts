import { directionBetween, endCell, findPath, manhattan, sameCell, step, createInitialState, createRules } from "../engine";
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

interface Drag {
	geckoId: string;
	end: GeckoEnd;
	/** States visited during this drag; [0] is the state at grab time. Lets the finger retrace its path. */
	trail: GameState[];
}

export interface Grab {
	geckoId: string;
	end: GeckoEnd;
}

// A far jump of the finger should not produce surprising detours.
const MAX_DETOUR = 4;
const PATH_SEARCH_BUDGET = 800;

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

	/** Starts a drag if `cell` holds one end of a free gecko. */
	grab(cell: Cell): boolean {
		if (this.outcome !== "playing" || this.paused) {
			return false;
		}
		for (const gecko of this.current.geckos) {
			if (gecko.saved) {
				continue;
			}
			const end: GeckoEnd | undefined = sameCell(gecko.cells[0], cell)
				? "head"
				: sameCell(gecko.cells[gecko.cells.length - 1], cell)
					? "tail"
					: undefined;
			if (end) {
				if (!this.started) {
					this.started = true;
					this.runningSince = this.now();
				}
				this.drag = { geckoId: gecko.id, end, trail: [this.current] };
				this.notify();
				return true;
			}
		}
		return false;
	}

	/** Follows the finger to `cell`: retraces, steps, or pathfinds there. */
	dragTo(cell: Cell): void {
		const drag = this.drag;
		if (!drag) {
			return;
		}
		const gecko = this.current.geckos.find((g) => g.id === drag.geckoId);
		if (!gecko || gecko.saved) {
			this.release();
			return;
		}
		const at = endCell(gecko, drag.end);
		if (sameCell(at, cell)) {
			return;
		}

		// Dragging back over the path already walked undoes it (§2.3 rule 5).
		for (let i = drag.trail.length - 2; i >= 0; i--) {
			const past = drag.trail[i].geckos.find((g) => g.id === drag.geckoId);
			if (past && sameCell(endCell(past, drag.end), cell)) {
				drag.trail.length = i + 1;
				this.setState(drag.trail[i]);
				return;
			}
		}

		const adjacent = directionBetween(at, cell);
		const dirs: Direction[] | undefined = adjacent
			? [adjacent]
			: findPath(this.rules, this.current, drag.geckoId, drag.end, cell, PATH_SEARCH_BUDGET);
		if (!dirs || dirs.length > manhattan(at, cell) + MAX_DETOUR) {
			this.emitFeedback({ type: "bump", geckoId: drag.geckoId, end: drag.end });
			return;
		}

		for (const dir of dirs) {
			const result = step(this.rules, this.current, drag.geckoId, drag.end, dir);
			if (!result.ok) {
				this.emitFeedback({ type: "bump", geckoId: drag.geckoId, end: drag.end });
				break;
			}
			drag.trail.push(result.state);
			this.setState(result.state);
			result.events.forEach((e) => this.emitFeedback(e));
			if (result.state.geckos.find((g) => g.id === drag.geckoId)?.saved) {
				this.release();
				break;
			}
		}
	}

	/** Ends the drag; a drag that changed anything becomes one undo step (§2.7). */
	release(): void {
		if (!this.drag) {
			return;
		}
		const before = this.drag.trail[0];
		this.drag = undefined;
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
