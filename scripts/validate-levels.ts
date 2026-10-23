import { createInitialState, createRules, validateLevel } from "../src/engine";
import { planFor } from "../src/generator/curriculum";
import { generateLevel, initialKey } from "../src/generator/generate";
import { REGISTRY } from "../src/mechanics";
import { proveSolvable } from "../src/solver/prove";
import { PACK_SIZE, frozenHash, readCatalog } from "./catalog";

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
	const result = proveSolvable(rules, createInitialState(rules));
	if (!result.solvable) {
		errors.push(`level ${level.id}: ${result.exhausted ? "solver budget exhausted" : "NOT solvable"}`);
	}

	if (deep && level.source === "generated") {
		const again = generateLevel(level.id, { registry: REGISTRY, timeline: manifest.timeline });
		if (JSON.stringify(again.geckos) !== JSON.stringify(level.geckos)) {
			errors.push(`level ${level.id}: seed ${level.seed} no longer reproduces this level`);
		}
	}
}

if (manifest.frozenHash && frozenHash(levels, manifest.frozenThrough) !== manifest.frozenHash) {
	errors.push(`levels 1-${manifest.frozenThrough} are published (frozen) but their content changed`);
}

// Progression rules (GAME_DESIGN.md §4.1.b): every mechanic debuts as a tutorial on its timeline
// level, nothing appears before its debut, and generated levels follow the curriculum exactly.
for (const entry of manifest.timeline) {
	if (!REGISTRY[entry.id]) {
		errors.push(`timeline: unknown mechanic "${entry.id}"`);
	}
	const debut = levels.find((l) => l.id === entry.debut);
	if (debut && (!debut.tutorial || !debut.mechanics.includes(entry.id))) {
		errors.push(`mechanic "${entry.id}" must debut in level ${entry.debut} as a tutorial`);
	}
}
for (const level of levels) {
	const early = level.mechanics.filter((id) => id !== "base" && !manifest.timeline.some((e) => e.id === id && e.debut <= level.id));
	if (early.length > 0) {
		errors.push(`level ${level.id}: uses ${early.join(", ")} before its debut`);
	}
	const planned = planFor(level.id, manifest.timeline, REGISTRY).mechanics;
	if (level.source === "generated" && level.mechanics.join() !== planned.join()) {
		errors.push(`level ${level.id}: mechanics [${level.mechanics.join(", ")}] differ from the curriculum [${planned.join(", ")}]`);
	}
}

if (errors.length > 0) {
	console.error(errors.join("\n"));
	console.error(`\n${errors.length} problem(s) in ${levels.length} levels.`);
	process.exit(1);
}
console.log(`${levels.length} levels OK (manifest v${manifest.version}, ${manifest.packs.length} packs${deep ? ", seeds reproduced" : ""}).`);
