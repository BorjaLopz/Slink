import type { Level } from "../engine";

export const PACK_SIZE_UI = 10;

export interface LevelPackGroup {
	index: number;
	levels: Level[];
}

export function groupIntoPacks(levels: Level[]): LevelPackGroup[] {
	const packs = new Map<number, Level[]>();
	for (const level of levels) {
		const index = Math.floor((level.id - 1) / PACK_SIZE_UI) + 1;
		packs.set(index, [...(packs.get(index) ?? []), level]);
	}
	return [...packs].map(([index, group]) => ({ index, levels: group }));
}
