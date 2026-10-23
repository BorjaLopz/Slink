import { cellKey, manhattan, sameCell } from "../engine/cell";
import type { Cell, Ctx, GameState, Mechanic } from "../engine/types";

interface Lock {
	/** Cell of the hole this lock closes. */
	cell: Cell;
	/** Geckos that must be saved (in any hole) before it opens. */
	needs: number;
}

type LockedHolesData = Lock[];

const ID = "locked-holes";
/** Never ask for more than this many geckos first: longer chains read as arbitrary, not clever. */
const MAX_NEEDS = 3;

function savedCount(state: GameState): number {
	return state.holes.reduce((sum, h) => sum + h.filled, 0);
}

function lockAt(ctx: Ctx, cell: Cell): Lock | undefined {
	return ctx.data<LockedHolesData>(ID)?.find((lock) => sameCell(lock.cell, cell));
}

/** Open/closed is derived from filled holes, which the engine already tracks: no state of its own. */
export function isLocked(lock: Lock, state: GameState): boolean {
	return savedCount(state) < lock.needs;
}

export const lockedHoles: Mechanic<LockedHolesData> = {
	id: ID,
	priority: 5,
	complexity: 2,
	synergiesWith: ["fragile"],
	name: "Candados",
	tutorialHint: "Los agujeros con candado se abren cuando entran otros geckos.",

	canEnter(ctx, _gecko, cell) {
		const lock = lockAt(ctx, cell);
		return !lock || !isLocked(lock, ctx.state);
	},

	validateLevel(level, data) {
		if (!Array.isArray(data)) {
			return [`${ID}: mechanicData["${ID}"] must be an array of { cell, needs }`];
		}
		const errors: string[] = [];
		const seen = new Set<string>();
		for (const lock of data) {
			const key = cellKey(lock.cell);
			if (!level.holes.some((h) => sameCell(h.cell, lock.cell))) {
				errors.push(`${ID}: ${key} is not a hole`);
			}
			if (!Number.isInteger(lock.needs) || lock.needs < 1 || lock.needs > level.geckos.length - 1) {
				errors.push(`${ID}: ${key} needs ${lock.needs}, must be 1-${level.geckos.length - 1}`);
			}
			if (seen.has(key)) {
				errors.push(`${ID}: duplicate lock ${key}`);
			}
			seen.add(key);
		}
		return errors;
	},

	populate(rng, level, intensity) {
		if (level.geckos.length < 2) {
			return undefined;
		}
		// Lock the holes of the geckos closest to home: they are the ones a player would send first.
		const distance = (id: string): number => {
			const gecko = level.geckos.find((g) => g.id === id);
			const hole = gecko && level.holes.find((h) => h.color === gecko.color);
			if (!gecko || !hole) {
				return Infinity;
			}
			return Math.min(manhattan(gecko.cells[0], hole.cell), manhattan(gecko.cells[gecko.cells.length - 1], hole.cell));
		};
		const closest = [...level.geckos].sort((a, b) => distance(a.id) - distance(b.id) || a.id.localeCompare(b.id)).slice(0, 3);
		const count = intensity >= 0.7 && level.geckos.length >= 5 ? 2 : 1;
		const maxNeeds = Math.min(MAX_NEEDS, level.geckos.length - 1);
		const locks: Lock[] = [];
		const pool = [...closest];
		while (locks.length < count && pool.length > 0) {
			const gecko = pool.splice(rng.int(0, pool.length - 1), 1)[0];
			const hole = level.holes.find((h) => h.color === gecko.color && !locks.some((l) => sameCell(l.cell, h.cell)));
			if (!hole) {
				continue;
			}
			const needs = Math.max(1, Math.min(maxNeeds, Math.round(1 + intensity * (maxNeeds - 1) + (rng.next() - 0.5))));
			locks.push({ cell: [hole.cell[0], hole.cell[1]], needs });
		}
		return locks.length > 0 ? locks : undefined;
	},

	// Locks depend on how many geckos are home, so this reads the live game state, not mechState.
	render(g, _level, data) {
		const state = g.game;
		if (!data) {
			return;
		}
		for (const lock of data) {
			if (!isLocked(lock, state)) {
				continue;
			}
			drawLock(g.c, g.toPx(lock.cell), g.cellSize, lock.needs - savedCount(state), g.theme);
		}
	},
};

function drawLock(c: CanvasRenderingContext2D, at: { x: number; y: number }, size: number, missing: number, theme: Record<string, string>): void {
	const cx = at.x + size / 2;
	const cy = at.y + size / 2;
	// Darken the pit so a locked hole never looks inviting.
	c.fillStyle = theme.pit;
	c.beginPath();
	c.arc(cx, cy, size * 0.27, 0, Math.PI * 2);
	c.fill();
	// Padlock: shackle + body in papel.
	const w = size * 0.26;
	const h = size * 0.2;
	c.strokeStyle = theme.lock;
	c.fillStyle = theme.lock;
	c.lineWidth = Math.max(1.5, size * 0.045);
	c.beginPath();
	c.arc(cx, cy - h * 0.35, w * 0.32, Math.PI, 0);
	c.stroke();
	c.fillRect(cx - w / 2, cy - h * 0.35, w, h);
	// Missing count on the body.
	c.fillStyle = theme.pit;
	c.font = `700 ${Math.round(size * 0.17)}px "Barlow Condensed", sans-serif`;
	c.textAlign = "center";
	c.textBaseline = "middle";
	c.fillText(String(missing), cx, cy - h * 0.35 + h / 2 + 0.5);
}
