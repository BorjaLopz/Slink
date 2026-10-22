import type { DifficultyTier } from "../engine/types";

/** Everything the generator needs to know about level `n` (GAME_DESIGN.md §4.1). */
export interface LevelParams {
	n: number;
	mechanics: string[];
	w: number;
	h: number;
	geckos: number;
	minLength: number;
	maxLength: number;
	/** Fraction of free cells turned into walls (0 when walls are locked). */
	wallDensity: number;
	/** Random reverse steps applied per gecko when scrambling. */
	scramblePerGecko: number;
	/** Difficulty label this level should get (by its position in the pack, capped early on). */
	targetTier: DifficultyTier;
	/** Multiplies the raw solution time; shrinks as levels go on. */
	timeFactor: number;
	/** Sawtooth multiplier: ramps up inside each pack of 10, peaks on the 10th, drops on the next. */
	saw: number;
}

/** Mechanics generator v1 knows how to place. Anything else in the unlock table is ignored here. */
const V1_MECHANICS = ["walls", "lengths"];

/** Tier by position inside each pack of 10: 6 easy, 2 medium, 1 hard and a very hard 10th level. */
const PACK_PATTERN: readonly DifficultyTier[] = [0, 0, 1, 0, 0, 0, 2, 0, 1, 3];

export function targetTierFor(n: number): DifficultyTier {
	const cap: DifficultyTier = n <= 10 ? 1 : n <= 20 ? 2 : 3;
	return Math.min(PACK_PATTERN[(n - 1) % 10], cap) as DifficultyTier;
}

/**
 * Share of the board covered by geckos + their holes for harder tiers. Measured in Fase 2: below
 * ~60% almost no level ever needs a parking drag, because there is always room to go around.
 */
const OCCUPANCY_BY_TIER = [0, 0.6, 0.68, 0.75];

/** Geckos on board from which a 2-parking level counts as very hard (lots of work AND ordering). */
const VERY_HARD_CROWD = 8;

function denseGeckos(w: number, h: number, tier: DifficultyTier): number {
	// Gecko (~3 cells on average) plus its hole.
	const footprint = 4;
	const geckos = Math.max(3, Math.round((w * h * OCCUPANCY_BY_TIER[tier]) / footprint));
	// Keep labels honest: a crowd of VERY_HARD_CROWD turns a 2-parking level into "very hard".
	return tier === 3 ? Math.max(VERY_HARD_CROWD, geckos) : Math.min(VERY_HARD_CROWD - 1, geckos);
}

/**
 * Label from measured parking drags. 3+ parkings is very rare with the base rules (measured in
 * Fase 2), so a 2-parking level on a crowded board also counts as very hard.
 */
export function tierFor(parkings: number, geckos: number): DifficultyTier {
	if (parkings >= 3 || (parkings === 2 && geckos >= VERY_HARD_CROWD)) {
		return 3;
	}
	return Math.max(0, parkings) as DifficultyTier;
}

export function sawtooth(n: number): number {
	return 0.9 + 0.25 * (((n - 1) % 10) / 9);
}

export function paramsFor(n: number, unlocks: Record<string, number>): LevelParams {
	const mechanics = ["base", ...V1_MECHANICS.filter((id) => unlocks[id] !== undefined && unlocks[id] <= n)];
	const saw = sawtooth(n);
	const gridSize = Math.min(12, 5 + Math.floor(n / 20));
	const hasLengths = mechanics.includes("lengths");
	const lengthsSince = n - (unlocks.lengths ?? n);
	const targetTier = targetTierFor(n);

	return {
		n,
		mechanics,
		// Portrait phones: a bit taller than wide.
		w: gridSize,
		h: Math.min(14, gridSize + 2),
		geckos: targetTier === 0 ? Math.min(12, 2 + Math.floor(n / 8)) : denseGeckos(gridSize, Math.min(14, gridSize + 2), targetTier),
		minLength: hasLengths ? 2 : 3,
		maxLength: hasLengths ? Math.min(6, 4 + Math.floor(lengthsSince / 40)) : 3,
		wallDensity: mechanics.includes("walls") ? Math.min(0.2, 0.08 + n / 1000) * saw : 0,
		scramblePerGecko: Math.round((6 + n / 8) * saw),
		targetTier,
		timeFactor: Math.max(0.5, 1 - n / 600),
		saw,
	};
}
