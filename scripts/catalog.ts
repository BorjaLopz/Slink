import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Level, LevelManifest, LevelPack } from "../src/engine";

export const LEVELS_DIR = join(import.meta.dirname, "..", "public", "levels");
export const PACK_SIZE = 10;

export interface Catalog {
	manifest: LevelManifest;
	levels: Level[];
}

function readJson<T>(file: string): T {
	return JSON.parse(readFileSync(join(LEVELS_DIR, file), "utf8")) as T;
}

export function readCatalog(): Catalog {
	const manifest = readJson<LevelManifest>("manifest.json");
	const levels = manifest.packs.flatMap((p) => readJson<LevelPack>(p.file).levels).sort((a, b) => a.id - b.id);
	return { manifest, levels };
}

function packFile(index: number): string {
	return `pack-${String(index).padStart(4, "0")}.json`;
}

/** Rewrites every pack from `levels` (grouped by id in blocks of PACK_SIZE) and bumps the manifest version. */
export function writeCatalog(levels: Level[], previous: LevelManifest): LevelManifest {
	const groups = new Map<number, Level[]>();
	for (const level of [...levels].sort((a, b) => a.id - b.id)) {
		const index = Math.floor((level.id - 1) / PACK_SIZE) + 1;
		groups.set(index, [...(groups.get(index) ?? []), level]);
	}

	for (const file of readdirSync(LEVELS_DIR).filter((f) => /^pack-\d+\.json$/.test(f))) {
		unlinkSync(join(LEVELS_DIR, file));
	}
	const packs = [...groups].map(([index, group]) => {
		const file = packFile(index);
		writeFileSync(join(LEVELS_DIR, file), formatPack(group));
		return { file, from: group[0].id, to: group[group.length - 1].id };
	});

	const manifest: LevelManifest = {
		version: previous.version + 1,
		generatedAt: new Date().toISOString(),
		packs,
		mechanicsUnlock: previous.mechanicsUnlock,
	};
	writeFileSync(join(LEVELS_DIR, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	return manifest;
}

/** Tab-indented JSON with each cell and each list of cells on one line, so pack diffs stay readable. */
function formatPack(levels: Level[]): string {
	const json = JSON.stringify({ levels }, null, "\t");
	const cells = json.replace(/\[\s*(-?\d+),\s*(-?\d+)\s*\]/g, "[$1, $2]");
	const cellLists = cells.replace(/\[(\s*\[-?\d+, -?\d+\],?)+\s*\]/g, (match) => match.replace(/\s+/g, " ").replace("[ ", "[").replace(" ]", "]"));
	return `${cellLists}\n`;
}
