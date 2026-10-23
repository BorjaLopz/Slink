import type { DifficultyTier, Level } from "../engine";

const TIER_NAMES: Record<DifficultyTier, string> = {
	0: "Fácil",
	1: "Medio",
	2: "Difícil",
	3: "Muy difícil",
};

/** "03", "12", "104": level numbers read as labels in the design, always two digits at least. */
export function levelNumber(id: number): string {
	return String(id).padStart(2, "0");
}

/** Handcrafted levels have a name; generated ones are named by their measured difficulty. */
export function levelTitle(level: Level): string {
	return level.name ?? TIER_NAMES[level.meta?.tier ?? 0];
}
