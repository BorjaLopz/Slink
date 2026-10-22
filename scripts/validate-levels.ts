import { createInitialState, createRules, validateLevel } from "../src/engine";
import { generateLevel, initialKey } from "../src/generator/generate";
import { REGISTRY } from "../src/mechanics";
import { solve } from "../src/solver/solve";
import { PACK_SIZE, readCatalog } from "./catalog";

// npm run validate:levels [-- --deep]   (--deep also regenerates every generated level from its seed)
const deep = process.argv.includes("--deep");
const { manifest, levels } = readCatalog();
const errors: string[] = [];

levels.forEach((level, i) => {
	if (level.id !== i + 1) {
		errors.push(`ids must be contiguous from 1: found #${level.id} at position ${i + 1}`);
	}
});
for (const pack of manifest.packs) {
	const inPack = levels.filter((l) => l.id >= pack.from && l.id <= pack.to);
	const samePack = Math.floor((pack.from - 1) / PACK_SIZE) === Math.floor((pack.to - 1) / PACK_SIZE);
	if (inPack.length !== pack.to - pack.from + 1 || !samePack) {
		errors.push(`${pack.file}: range ${pack.from}-${pack.to} does not match its contents`);
	}
}

const seen = new Map<string, number>();
for (const level of levels) {
	errors.push(...validateLevel(level, REGISTRY));

	const key = initialKey(level, REGISTRY);
	const twin = seen.get(key);
	if (twin !== undefined) {
		errors.push(`level ${level.id}: duplicate of level ${twin}`);
	}
	seen.set(key, level.id);

	const rules = createRules(level, REGISTRY);
	const result = solve(rules, createInitialState(rules), { weight: 3, maxStates: 100_000 });
	if (!result.solvable) {
		errors.push(`level ${level.id}: ${result.exhausted ? "solver budget exhausted" : "NOT solvable"}`);
	}

	if (deep && level.source === "generated") {
		const again = generateLevel(level.id, { registry: REGISTRY, unlocks: manifest.mechanicsUnlock });
		if (JSON.stringify(again.geckos) !== JSON.stringify(level.geckos)) {
			errors.push(`level ${level.id}: seed ${level.seed} no longer reproduces this level`);
		}
	}
}

// A mechanic must debut in a tutorial level (§3 golden rule).
for (const id of Object.keys(manifest.mechanicsUnlock)) {
	const first = levels.find((l) => l.mechanics.includes(id));
	if (first && !first.tutorial) {
		errors.push(`mechanic "${id}" debuts in level ${first.id}, which is not marked as tutorial`);
	}
}

if (errors.length > 0) {
	console.error(errors.join("\n"));
	console.error(`\n${errors.length} problem(s) in ${levels.length} levels.`);
	process.exit(1);
}
console.log(`${levels.length} levels OK (manifest v${manifest.version}, ${manifest.packs.length} packs${deep ? ", seeds reproduced" : ""}).`);
