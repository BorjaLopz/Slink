import { useEffect, useState } from "react";
import type { Level, LevelManifest, LevelPack } from "../engine";

type LevelsState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; levels: Level[] };

const LEVELS_BASE = `${import.meta.env.BASE_URL}levels/`;

async function fetchJson<T>(file: string): Promise<T> {
	const response = await fetch(`${LEVELS_BASE}${file}`, { cache: "no-cache" });
	if (!response.ok) {
		throw new Error(`${file}: HTTP ${response.status}`);
	}
	return (await response.json()) as T;
}

/** Loads the manifest and every pack it lists (§5.2). New packs show up without code changes. */
export function useLevels(): LevelsState {
	const [state, setState] = useState<LevelsState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const manifest = await fetchJson<LevelManifest>("manifest.json");
			const packs = await Promise.all(manifest.packs.map((p) => fetchJson<LevelPack>(p.file)));
			const levels = packs.flatMap((p) => p.levels).sort((a, b) => a.id - b.id);
			if (!cancelled) {
				setState({ status: "ready", levels });
			}
		})().catch((error: unknown) => {
			if (!cancelled) {
				setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}
