import { describe, expect, it } from "vitest";
import { createInitialState, createRules, validateLevel } from "../src/engine";
import { paramsFor, sawtooth, targetTierFor, tierFor } from "../src/generator/difficulty";
import { GENERATOR_VERSION, generateLevel, timeLimitFor } from "../src/generator/generate";
import { Rng, hashSeed } from "../src/generator/rng";
import { REGISTRY } from "../src/mechanics";
import { minParkings } from "../src/solver/parking";
import { solve } from "../src/solver/solve";
import { readCatalog } from "../scripts/catalog";

const UNLOCKS = { walls: 6, lengths: 12 };
// Fewer candidates keeps the suite fast; selection quality is not what is under test here.
const FAST = { registry: REGISTRY, unlocks: UNLOCKS, candidates: 4 };

describe("Rng", () => {
	it("is deterministic per seed and stays in range", () => {
		const a = new Rng(42);
		const b = new Rng(42);
		const values = Array.from({ length: 100 }, () => a.int(3, 7));
		expect(values).toEqual(Array.from({ length: 100 }, () => b.int(3, 7)));
		expect(Math.min(...values)).toBe(3);
		expect(Math.max(...values)).toBe(7);
	});

	it("mixes seeds so neighbouring ids diverge", () => {
		expect(hashSeed(1, 1)).not.toBe(hashSeed(2, 1));
		expect(hashSeed(1, 1)).toBe(hashSeed(1, 1));
	});
});

describe("difficulty curve", () => {
	it("peaks on the 10th level of each pack and drops on the next", () => {
		expect(sawtooth(10)).toBeGreaterThan(sawtooth(9));
		expect(sawtooth(11)).toBeLessThan(sawtooth(10));
		expect(sawtooth(11)).toBeCloseTo(sawtooth(1));
	});

	it("unlocks mechanics by level and grows the board", () => {
		expect(paramsFor(5, UNLOCKS).mechanics).toEqual(["base"]);
		expect(paramsFor(6, UNLOCKS).mechanics).toEqual(["base", "walls"]);
		expect(paramsFor(12, UNLOCKS).mechanics).toEqual(["base", "walls", "lengths"]);
		expect(paramsFor(11, UNLOCKS).maxLength).toBe(3);
		expect(paramsFor(12, UNLOCKS).minLength).toBe(2);
		expect(paramsFor(200, UNLOCKS).w).toBeGreaterThan(paramsFor(7, UNLOCKS).w);
		expect(paramsFor(200, UNLOCKS).w).toBeLessThanOrEqual(12);
	});

	it("time limits grow with work and shrink as levels advance", () => {
		expect(timeLimitFor(30, 1)).toBeGreaterThan(timeLimitFor(10, 1));
		expect(timeLimitFor(30, 0.5)).toBeLessThan(timeLimitFor(30, 1));
		expect(timeLimitFor(30, 1) % 5).toBe(0);
	});
});

describe("generateLevel", () => {
	it("is reproducible: same id and version give the same level", () => {
		const a = generateLevel(9, FAST);
		const b = generateLevel(9, FAST);
		expect(a).toEqual(b);
		expect(a.seed).toBe(hashSeed(9, GENERATOR_VERSION));
		expect(a.generatorVersion).toBe(GENERATOR_VERSION);
	});

	it("gives different levels to different ids", () => {
		expect(generateLevel(9, FAST).geckos).not.toEqual(generateLevel(10, FAST).geckos);
	});

	// Property test (§14 step 8, scaled down for the unit suite).
	for (let n = 7; n <= 22; n++) {
		it(`level ${n} is valid, solvable and honest about its metadata`, () => {
			const level = generateLevel(n, FAST);
			expect(validateLevel(level, REGISTRY)).toEqual([]);
			expect(level.source).toBe("generated");
			expect(level.mechanics).toEqual(paramsFor(n, UNLOCKS).mechanics);
			expect(level.timeLimit).toBeGreaterThan(0);

			const rules = createRules(level, REGISTRY);
			const result = solve(rules, createInitialState(rules), { weight: 3 });
			expect(result.solvable).toBe(true);
			if (level.meta?.optimal) {
				expect(solve(rules, createInitialState(rules)).minMoves).toBe(level.meta.minMoves);
			}
		});
	}
});

describe("difficulty tiers", () => {
	it("follows the pack pattern, capped on early packs", () => {
		expect([21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(targetTierFor)).toEqual([0, 0, 1, 0, 0, 0, 2, 0, 1, 3]);
		expect(targetTierFor(10)).toBe(1);
		expect(targetTierFor(20)).toBe(2);
	});

	it("labels by parking drags; 2 parkings on a crowded board is very hard", () => {
		expect(tierFor(0, 12)).toBe(0);
		expect(tierFor(1, 5)).toBe(1);
		expect(tierFor(2, 7)).toBe(2);
		expect(tierFor(2, 8)).toBe(3);
		expect(tierFor(3, 3)).toBe(3);
	});

	it("published labels match a fresh parking measurement", () => {
		const { levels } = readCatalog();
		for (const id of [7, 17, 30]) {
			const level = levels.find((l) => l.id === id);
			if (!level?.meta?.parkings) {
				continue;
			}
			const rules = createRules(level, REGISTRY);
			const result = minParkings(rules, createInitialState(rules), { maxDepth: 3, maxWork: 60_000 });
			expect(result.parkings).toBe(level.meta.parkings);
			expect(tierFor(result.parkings, level.geckos.length)).toBe(level.meta.tier);
		}
	}, 60_000);
});
