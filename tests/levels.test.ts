import { describe, expect, it } from "vitest";
import { createInitialState, createRules, validateLevel } from "../src/engine";
import { REGISTRY } from "../src/mechanics";
import { proveSolvable } from "../src/solver/prove";
import { readCatalog } from "../scripts/catalog";

const { manifest, levels } = readCatalog();

describe("published levels", () => {
	it("ids are contiguous from 1 and every pack range matches", () => {
		expect(levels.map((l) => l.id)).toEqual(levels.map((_, i) => i + 1));
		for (const pack of manifest.packs) {
			expect(levels.filter((l) => l.id >= pack.from && l.id <= pack.to)).toHaveLength(pack.to - pack.from + 1);
		}
	});

	for (const level of levels) {
		it(`level ${level.id} is valid and solvable`, { timeout: 120_000 }, () => {
			expect(validateLevel(level, REGISTRY)).toEqual([]);
			const rules = createRules(level, REGISTRY);
			const result = proveSolvable(rules, createInitialState(rules));
			expect(result.exhausted).toBe(false);
			expect(result.solvable).toBe(true);
		});
	}
});
