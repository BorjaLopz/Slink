import { createInitialState, createRules, validateLevel } from "../src/engine";
import type { Level } from "../src/engine";
import { tierFor } from "../src/generator/difficulty";
import { GENERATOR_VERSION, generateLevel } from "../src/generator/generate";
import { REGISTRY } from "../src/mechanics";
import { minParkings } from "../src/solver/parking";
import { readCatalog, writeCatalog } from "./catalog";

// npm run gen:levels -- --from 7 --count 44 [--force]
function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

const from = Number(arg("from"));
const count = Number(arg("count") ?? 10);
const force = process.argv.includes("--force");
if (!Number.isInteger(from) || from < 1 || !Number.isInteger(count) || count < 1) {
	console.error("usage: npm run gen:levels -- --from <id> --count <n> [--force]");
	process.exit(1);
}

const { manifest, levels } = readCatalog();
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
	const level = generateLevel(id, { registry: REGISTRY, unlocks: manifest.mechanicsUnlock });
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
