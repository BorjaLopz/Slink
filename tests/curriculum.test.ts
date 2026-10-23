import { describe, expect, it } from "vitest";
import type { Mechanic, TimelineEntry } from "../src/engine";
import { ADAPTATION_LEVELS, DEBUT_SPACING, complexityBudget, planFor } from "../src/generator/curriculum";

// Fake mechanics: the curriculum only reads metadata, never hooks.
function fake(id: string, complexity: number, extra: Partial<Mechanic> = {}): Mechanic {
	return { id, priority: 0, complexity, ...extra };
}

const REGISTRY: Record<string, Mechanic> = {
	walls: fake("walls", 1, { basic: true }),
	lengths: fake("lengths", 1, { basic: true }),
	fragile: fake("fragile", 4, { synergiesWith: ["conveyor"] }),
	ice: fake("ice", 4),
	conveyor: fake("conveyor", 4),
};

const TIMELINE: TimelineEntry[] = [
	{ id: "walls", debut: 6 },
	{ id: "lengths", debut: 12 },
	{ id: "fragile", debut: 20 },
	{ id: "ice", debut: 30 },
	{ id: "conveyor", debut: 40 },
];

const twists = (n: number): string[] => planFor(n, TIMELINE, REGISTRY).mechanics.filter((id) => !["base", "walls", "lengths"].includes(id));

describe("curriculum", () => {
	it("keeps basics on every level after their debut", () => {
		expect(planFor(5, TIMELINE, REGISTRY).mechanics).toEqual(["base"]);
		for (let n = 12; n <= 120; n++) {
			expect(planFor(n, TIMELINE, REGISTRY).mechanics.slice(0, 3)).toEqual(["base", "walls", "lengths"]);
		}
	});

	it("teaches a new twist alone, then always with it, with rising intensity", () => {
		for (let n = 20; n < 20 + ADAPTATION_LEVELS; n++) {
			const plan = planFor(n, TIMELINE, REGISTRY);
			expect(plan.focus).toEqual({ id: "fragile", phase: "adaptation", debut: 20 });
			expect(twists(n)).toEqual(["fragile"]);
		}
		let previous = 0;
		for (let n = 20 + ADAPTATION_LEVELS; n < 20 + DEBUT_SPACING; n++) {
			const plan = planFor(n, TIMELINE, REGISTRY);
			expect(plan.focus?.phase).toBe("deepening");
			expect(plan.mechanics).toContain("fragile");
			expect(plan.intensity.fragile).toBeGreaterThan(previous);
			previous = plan.intensity.fragile;
		}
		expect(previous).toBeCloseTo(1);
	});

	it("brings back at most one older twist while deepening", () => {
		for (let n = 32; n < 40; n++) {
			const t = twists(n);
			expect(t).toContain("ice");
			expect(t.length).toBeLessThanOrEqual(2);
		}
	});

	it("mixes known twists in the pool within the complexity budget", () => {
		const seen = new Set<string>();
		for (let n = 50; n <= 300; n++) {
			const plan = planFor(n, TIMELINE, REGISTRY);
			const t = twists(n);
			expect(plan.focus).toBeUndefined();
			expect(t.length).toBeGreaterThanOrEqual(1);
			expect(t.reduce((sum, id) => sum + REGISTRY[id].complexity, 0)).toBeLessThanOrEqual(complexityBudget(n));
			t.forEach((id) => seen.add(id));
		}
		expect([...seen].sort()).toEqual(["conveyor", "fragile", "ice"]);
	});

	it("starts boss levels from a synergy pair when the budget allows it", () => {
		const boss = planFor(100, TIMELINE, REGISTRY);
		expect(boss.boss).toBe(true);
		expect(boss.mechanics).toEqual(expect.arrayContaining(["fragile", "conveyor"]));
	});

	it("never uses a mechanic before its debut and is deterministic", () => {
		expect(twists(19)).toEqual([]);
		expect(twists(29)).not.toContain("ice");
		expect(planFor(77, TIMELINE, REGISTRY)).toEqual(planFor(77, TIMELINE, REGISTRY));
	});
});
