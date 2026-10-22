import { useSyncExternalStore } from "react";
import type { Stars } from "./gameSession";

/** Player progress (§5.3). Local only, no backend. */
export interface Progress {
	stars: Record<number, Stars>;
	bestTimes: Record<number, number>;
}

const STORAGE_KEY = "slink:progress:v1";
const EMPTY: Progress = { stars: {}, bestTimes: {} };

function load(): Progress {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Progress>) } : EMPTY;
	} catch {
		// Private mode or blocked storage: play on without persistence.
		return EMPTY;
	}
}

let progress = load();
const listeners = new Set<() => void>();

function save(next: Progress): void {
	progress = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Same as load(): keep the in-memory copy.
	}
	listeners.forEach((l) => l());
}

/** Keeps the best result per level: more stars, or the same stars in less time. */
export function recordWin(levelId: number, stars: Stars, seconds: number): void {
	const previousStars = progress.stars[levelId] ?? 0;
	const previousTime = progress.bestTimes[levelId] ?? Infinity;
	save({
		stars: { ...progress.stars, [levelId]: Math.max(previousStars, stars) as Stars },
		bestTimes: { ...progress.bestTimes, [levelId]: Math.min(previousTime, Math.round(seconds * 10) / 10) },
	});
}

/** A level is playable once the previous one has been beaten. */
export function isUnlocked(p: Progress, levelId: number): boolean {
	return levelId === 1 || p.stars[levelId - 1] !== undefined;
}

/** First level not yet beaten (or the last one if everything is done). */
export function nextLevelId(p: Progress, levelIds: number[]): number {
	return levelIds.find((id) => p.stars[id] === undefined) ?? levelIds[levelIds.length - 1];
}

export function useProgress(): Progress {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => progress,
	);
}
