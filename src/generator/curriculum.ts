import type { Mechanic, TimelineEntry } from "../engine/types";
import { Rng, hashSeed } from "./rng";

/**
 * Mechanic progression (GAME_DESIGN.md §4.1.b). Mechanics are not tied to fixed level numbers: each
 * one debuts wherever the timeline says (the first unpublished level when it was released) and then
 * goes through the same cycle, so new ideas can keep being added without touching older levels.
 */

/** Easy levels where the newest mechanic appears alone with the basics. */
export const ADAPTATION_LEVELS = 2;
/** Levels after adaptation where the newest mechanic is always on, with rising intensity. */
export const DEEPENING_LEVELS = 8;
/** Minimum gap between two debuts, so two mechanics are never taught at the same time. */
export const DEBUT_SPACING = ADAPTATION_LEVELS + DEEPENING_LEVELS;
/** Every BOSS_EVERY levels the pool tries to combine a synergy pair. */
export const BOSS_EVERY = 25;
/** Hard cap of twists (non-basic mechanics) mixed in a single pool level. */
const MAX_TWISTS = 4;
/** Chance that a deepening level also brings back one older twist. */
const DEEPENING_COMPANION_CHANCE = 0.5;
/** Salt so the curriculum draws are independent from the board generator's RNG stream. */
const CURRICULUM_SALT = 0x5c1e;

export type MechanicPhase = "adaptation" | "deepening" | "pool";

export interface LevelPlan {
	/** "base", then basics, then twists; always in timeline order. */
	mechanics: string[];
	/** 0..1 per twist: how much of it the generator should place. Basics scale with n on their own. */
	intensity: Record<string, number>;
	/** The newest mechanic while it is being taught; undefined once everything is in the pool. */
	focus?: { id: string; phase: Exclude<MechanicPhase, "pool">; debut: number };
	boss: boolean;
}

/** Complexity budget for twists in pool levels: one mechanic early on, up to MAX_TWISTS later. */
export function complexityBudget(n: number): number {
	return 4 + Math.floor(n / 25);
}

export function planFor(n: number, timeline: readonly TimelineEntry[], registry: Record<string, Mechanic>): LevelPlan {
	const known = [...timeline].filter((e) => e.debut <= n && registry[e.id]).sort((a, b) => a.debut - b.debut);
	const basics = known.filter((e) => registry[e.id].basic).map((e) => e.id);
	const twists = known.filter((e) => !registry[e.id].basic);
	const rng = new Rng(hashSeed(n, CURRICULUM_SALT));
	const boss = n % BOSS_EVERY === 0;

	const newest = known[known.length - 1];
	const sinceDebut = newest ? n - newest.debut : Infinity;
	const plan = (chosen: string[], intensity: Record<string, number>, focus?: LevelPlan["focus"]): LevelPlan => ({
		mechanics: ["base", ...basics, ...twists.map((e) => e.id).filter((id) => chosen.includes(id))],
		intensity,
		focus,
		boss,
	});

	if (newest && sinceDebut < ADAPTATION_LEVELS) {
		const focus = { id: newest.id, phase: "adaptation" as const, debut: newest.debut };
		return plan([newest.id], registry[newest.id].basic ? {} : { [newest.id]: 0.25 }, focus);
	}

	if (newest && sinceDebut < DEBUT_SPACING) {
		const focus = { id: newest.id, phase: "deepening" as const, debut: newest.debut };
		if (registry[newest.id].basic) {
			return plan([], {}, focus);
		}
		const progress = (sinceDebut - ADAPTATION_LEVELS) / (DEEPENING_LEVELS - 1);
		const intensity: Record<string, number> = { [newest.id]: 0.35 + 0.65 * progress };
		const older = twists.filter((e) => e.id !== newest.id && fits([newest.id, e.id], n, registry));
		if (older.length > 0 && rng.chance(DEEPENING_COMPANION_CHANCE)) {
			const companion = rng.pick(older);
			intensity[companion.id] = poolIntensity(n, companion.debut);
			return plan([newest.id, companion.id], intensity, focus);
		}
		return plan([newest.id], intensity, focus);
	}

	const chosen = pickPool(twists.map((e) => e.id), n, boss, rng, registry);
	const intensity = Object.fromEntries(chosen.map((id) => [id, poolIntensity(n, known.find((e) => e.id === id)?.debut ?? n)]));
	return plan(chosen, intensity);
}

/** Pool intensity grows with how long the player has known the mechanic. */
function poolIntensity(n: number, debut: number): number {
	return Math.min(1, 0.5 + (n - debut) / 200);
}

function fits(ids: string[], n: number, registry: Record<string, Mechanic>): boolean {
	if (ids.length > MAX_TWISTS) {
		return false;
	}
	const cost = ids.reduce((sum, id) => sum + registry[id].complexity, 0);
	const conflict = ids.some((a) => ids.some((b) => registry[a].conflictsWith?.includes(b)));
	return cost <= complexityBudget(n) && !conflict;
}

/**
 * Random subset of known twists within the budget. Synergies with what is already picked go first,
 * and boss levels start from a synergy pair when there is one.
 */
function pickPool(twists: string[], n: number, boss: boolean, rng: Rng, registry: Record<string, Mechanic>): string[] {
	if (twists.length === 0) {
		return [];
	}
	const synergic = (a: string, b: string): boolean =>
		Boolean(registry[a].synergiesWith?.includes(b) || registry[b].synergiesWith?.includes(a));
	const shuffled = rng.shuffle([...twists]);
	const chosen: string[] = [];

	if (boss) {
		const pairs = shuffled.flatMap((a, i) => shuffled.slice(i + 1).filter((b) => synergic(a, b) && fits([a, b], n, registry)).map((b) => [a, b]));
		if (pairs.length > 0) {
			chosen.push(...rng.pick(pairs));
		}
	}
	// One twist always; more only as the budget grows, and never all of them every time.
	const target = Math.max(chosen.length, rng.int(1, Math.min(MAX_TWISTS, twists.length)));
	const rest = shuffled.filter((id) => !chosen.includes(id));
	while (chosen.length < target && rest.length > 0) {
		rest.sort((a, b) => Number(chosen.some((c) => synergic(b, c))) - Number(chosen.some((c) => synergic(a, c))));
		const next = rest.findIndex((id) => fits([...chosen, id], n, registry));
		if (next < 0) {
			break;
		}
		chosen.push(...rest.splice(next, 1));
	}
	return chosen;
}
