import { moveCell, sameCell } from "./cell";
import { cloneState, stateKey } from "./state";
import type { Cell, Ctx, Direction, GameEvent, GameState, Gecko, GeckoEnd, Rules, StepResult } from "./types";

const MAX_AFTER_MOVE_ITERATIONS = 50;
const MAX_EVENT_DISPATCHES = 500;

export function createCtx(rules: Rules, state: GameState, events: GameEvent[]): Ctx {
	const { level } = rules;
	return {
		level,
		state,
		data: <T>(id: string) => level.mechanicData[id] as T | undefined,
		emit: (event) => {
			events.push(event);
		},
		geckoAt: (cell) => state.geckos.find((g) => !g.saved && g.cells.some((c) => sameCell(c, cell))),
		holeAt: (cell) => state.holes.find((h) => sameCell(h.cell, cell)),
		inBounds: (cell) => cell[0] >= 0 && cell[1] >= 0 && cell[0] < level.grid.w && cell[1] < level.grid.h,
	};
}

/** Base rules for entering a cell (§2.3 and §2.4). `ordered` has the grabbed end first. */
function baseCanEnter(ctx: Ctx, gecko: Gecko, ordered: Cell[], to: Cell): boolean {
	if (!ctx.inBounds(to)) {
		return false;
	}
	// The neck is never enterable: on a 2-long gecko it would flip the body in place.
	if (ordered.length > 1 && sameCell(to, ordered[1])) {
		return false;
	}
	// Own body blocks except the trailing end, which vacates this very step.
	const body = ordered.slice(0, -1);
	if (body.some((c) => sameCell(c, to))) {
		return false;
	}
	const occupant = ctx.geckoAt(to);
	if (occupant && occupant.id !== gecko.id) {
		return false;
	}
	// An open hole of another color acts as a wall; a full hole disappears and becomes plain floor.
	const hole = ctx.holeAt(to);
	if (hole && hole.filled < hole.capacity && hole.color !== gecko.color) {
		return false;
	}
	return true;
}

/**
 * Advances one end of a gecko by one cell following the fixed turn pipeline (GAME_DESIGN.md §13.2).
 * Pure: the input state is never mutated, a new state is returned on success.
 *
 * Phases 1-3 (canGrab, redirect, canEnter) are queries and run against the untouched input state;
 * the state is only cloned once the move is known to be legal. Most candidate moves explored by the
 * solver are illegal, so this skips the bulk of the cloning.
 */
export function step(rules: Rules, state: GameState, geckoId: string, end: GeckoEnd, dir: Direction): StepResult {
	if (state.status !== "playing") {
		return { ok: false, reason: "not-playing" };
	}
	const { mechanics } = rules;
	const probe = createCtx(rules, state, []);

	const current = state.geckos.find((g) => g.id === geckoId);
	if (!current) {
		return { ok: false, reason: "unknown-gecko" };
	}
	if (current.saved) {
		return { ok: false, reason: "already-saved" };
	}

	// 1. canGrab
	if (mechanics.some((m) => m.canGrab && !m.canGrab(probe, current, end))) {
		return { ok: false, reason: "cannot-grab" };
	}

	// 2. Destination + redirect
	const ordered = end === "head" ? current.cells : [...current.cells].reverse();
	const from = ordered[0];
	let to = moveCell(from, dir);
	for (const m of mechanics) {
		if (m.redirect) {
			to = m.redirect(probe, current, from, to);
		}
	}

	// 3. canEnter: base rules plus any mechanic veto (veto wins)
	if (!baseCanEnter(probe, current, ordered, to)) {
		return { ok: false, reason: "blocked" };
	}
	if (mechanics.some((m) => m.canEnter && !m.canEnter(probe, current, to))) {
		return { ok: false, reason: "blocked" };
	}

	// 4. Apply move (body follows the trail) + onLeave
	const draft = cloneState(state);
	const events: GameEvent[] = [];
	const ctx = createCtx(rules, draft, events);
	const gecko = draft.geckos.find((g) => g.id === geckoId) as Gecko;
	const left = ordered[ordered.length - 1];
	const moved = [to, ...ordered.slice(0, -1)].map((c): Cell => [c[0], c[1]]);
	gecko.cells = end === "head" ? moved : moved.reverse();
	draft.steps += 1;
	ctx.emit({ type: "gecko:left", geckoId, cell: left });
	for (const m of mechanics) {
		m.onLeave?.(ctx, gecko, left);
	}

	// 5. onEnter
	ctx.emit({ type: "gecko:entered", geckoId, cell: to });
	for (const m of mechanics) {
		m.onEnter?.(ctx, gecko, to);
	}
	ctx.emit({ type: "gecko:moved", geckoId, end });

	// 6. Hole entry + victory
	const hole = ctx.holeAt(to);
	if (hole && hole.color === gecko.color && hole.filled < hole.capacity) {
		hole.filled += 1;
		gecko.saved = true;
		ctx.emit({ type: "hole:filled", geckoId, cell: to });
		if (draft.geckos.every((g) => g.saved)) {
			draft.status = "won";
			ctx.emit({ type: "level:won" });
		}
	}

	// 7. afterMove until stable
	if (mechanics.some((m) => m.afterMove)) {
		let iterations = 0;
		let before = stateKey(rules, draft);
		for (;;) {
			for (const m of mechanics) {
				m.afterMove?.(ctx);
			}
			const after = stateKey(rules, draft);
			if (after === before) {
				break;
			}
			before = after;
			iterations += 1;
			if (iterations >= MAX_AFTER_MOVE_ITERATIONS) {
				throw new Error(`Level ${rules.level.id}: afterMove did not stabilize in ${MAX_AFTER_MOVE_ITERATIONS} iterations`);
			}
		}
	}

	// 8. Dispatch events. Handlers may emit more; they're appended and dispatched too.
	if (mechanics.some((m) => m.onEvent)) {
		for (let i = 0; i < events.length; i++) {
			if (i >= MAX_EVENT_DISPATCHES) {
				throw new Error(`Level ${rules.level.id}: event cascade exceeded ${MAX_EVENT_DISPATCHES} events`);
			}
			for (const m of mechanics) {
				m.onEvent?.(ctx, events[i]);
			}
		}
	}

	return { ok: true, state: draft, events };
}

/** Grabbed end's current cell. */
export function endCell(gecko: Gecko, end: GeckoEnd): Cell {
	return end === "head" ? gecko.cells[0] : gecko.cells[gecko.cells.length - 1];
}
