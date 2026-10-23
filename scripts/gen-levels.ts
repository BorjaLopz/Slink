import { createInitialState, createRules, validateLevel } from "../src/engine";
import type { Level } from "../src/engine";
import { tierFor } from "../src/generator/difficulty";
import { GENERATOR_VERSION, generateLevel } from "../src/generator/generate";
import { REGISTRY } from "../src/mechanics";
import { minParkings } from "../src/solver/parking";
import { readCatalog, writeCatalog } from "./catalog";

// npm run gen:levels -- [--from 7] --count 44 [--force] [--unfreeze]
// --from defaults to the first level that does not exist yet, so `-- --count 10` appends a pack.
function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

const { manifest, levels } = readCatalog();
const from = Number(arg("from") ?? levels.length + 1);
const count = Number(arg("count") ?? 10);
const force = process.argv.includes("--force");
const unfreeze = process.argv.includes("--unfreeze");
if (!Number.isInteger(from) || from < 1 || !Number.isInteger(count) || count < 1) {
	console.error("usage: npm run gen:levels -- [--from <id>] --count <n> [--force] [--unfreeze]");
	process.exit(1);
}
if (force && from <= manifest.frozenThrough && !unfreeze) {
	// Published levels must not change under the player's saved progress (GAME_DESIGN.md §4.1.b).
	console.error(`levels 1-${manifest.frozenThrough} are published and frozen; regenerating them needs --unfreeze`);
	process.exit(1);
}
const byId = new Map(levels.map((l) => [l.id, l]));
let generated = 0;

for (let id = from; id < from + count; id++) {
	const current = byId.get(id);
	if (current?.source === "handcrafted") {
		// Content stays as designed; only the difficulty label is (re)measured so the menu can show it.
		byId.set(id, labelHandcrafted(current));
		console.log(`#${id} handcrafted, kept (tier ${byId.get(id)?.meta?.tier})`);
		continue;
	}
	if (current && !force) {
		console.log(`#${id} already generated, kept (use --force to regenerate)`);
		continue;
	}
	const started = performance.now();
	let level: Level;
	try {
		level = generateLevel(id, { registry: REGISTRY, timeline: manifest.timeline });
	} catch (error) {
		// Keep what was generated so far: hard levels take minutes and the ids before this one are fine.
		console.error(`#${id} failed: ${(error as Error).message}`);
		process.exitCode = 1;
		break;
	}
	const errors = validateLevel(level, REGISTRY);
	if (errors.length > 0) {
		throw new Error(errors.join("\n"));
	}
	// Output depends only on the seed (no catalogue-dependent filtering), so --deep can reproduce it.
	// Duplicates are caught by validate:levels instead.
	byId.set(id, level);
	generated += 1;
	const m = level.meta;
	console.log(
		`#${id} ${level.grid.w}x${level.grid.h} geckos=${level.geckos.length} moves=${m?.minMoves}${m?.optimal ? "" : "~"} ` +
			`tier=${m?.tier} parkings=${m?.parkings} dependency=${m?.dependency} time=${level.timeLimit}s (${Math.round(performance.now() - started)}ms)`,
	);
}

const ids = [...byId.keys()].sort((a, b) => a - b);
const gap = ids.find((id, i) => id !== i + 1);
if (gap !== undefined) {
	console.error(`level ids must be contiguous from 1; gap before #${gap}`);
	process.exit(1);
}
const written = writeCatalog([...byId.values()], manifest);
console.log(`\n${generated} level(s) generated with generator v${GENERATOR_VERSION}. Manifest v${written.version}, ${written.packs.length} pack(s).`);

function labelHandcrafted(level: Level): Level {
	const rules = createRules(level, REGISTRY);
	const { parkings, exhausted } = minParkings(rules, createInitialState(rules), { maxDepth: 3, maxWork: 60_000 });
	if (!Number.isFinite(parkings) || exhausted) {
		return level;
	}
	return { ...level, meta: { ...level.meta, parkings, tier: tierFor(parkings, level.geckos.length) } };
}
