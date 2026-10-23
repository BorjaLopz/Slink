import { describe, expect, it } from "vitest";
import { step, validateLevel } from "../src/engine";
import type { Level } from "../src/engine";
import { Rng } from "../src/generator/rng";
import { REGISTRY } from "../src/mechanics";
import { lockedHoles } from "../src/mechanics/lockedHoles";
import { solve } from "../src/solver/solve";
import { makeLevel, setup } from "./helpers";

/**
 * Green sits right next to its locked hole; blue has a free walk home. Green can only finish once
 * blue is in, which is exactly what the lock is for.
 */
function twoGeckos(needs = 1): Level {
	return makeLevel({
		grid: { w: 5, h: 3 },
		geckos: [
			{ id: "g", color: "green", cells: [[1, 0], [0, 0]] },
			{ id: "b", color: "blue", cells: [[1, 2], [0, 2]] },
		],
		holes: [
			{ color: "green", cell: [2, 0] },
			{ color: "blue", cell: [4, 2] },
		],
		mechanics: ["base", "locked-holes"],
		mechanicData: { "locked-holes": [{ cell: [2, 0], needs }] },
	});
}

describe("locked-holes", () => {
	it("acts as a wall until enough geckos are home, then opens", () => {
		const { rules, state } = setup(twoGeckos());
		expect(step(rules, state, "g", "head", "right").ok).toBe(false);

		let s = state;
		for (let i = 0; i < 3; i++) {
			const r = step(rules, s, "b", "head", "right");
			if (!r.ok) {
				throw new Error(r.reason);
			}
			s = r.state;
		}
		expect(s.geckos.find((g) => g.id === "b")?.saved).toBe(true);
		const opened = step(rules, s, "g", "head", "right");
		expect(opened.ok && opened.state.status).toBe("won");
	});

	it("keeps the level solvable through the right order", () => {
		const { rules, state } = setup(twoGeckos());
		expect(solve(rules, state).solvable).toBe(true);
	});

	it("validates locks", () => {
		const errors = validateLevel(
			{ ...twoGeckos(), mechanicData: { "locked-holes": [{ cell: [3, 1], needs: 1 }, { cell: [2, 0], needs: 2 }] } },
			REGISTRY,
		).join("\n");
		expect(errors).toContain("3,1 is not a hole");
		expect(errors).toContain("needs 2, must be 1-1");
		expect(validateLevel(twoGeckos(), REGISTRY)).toEqual([]);
	});

	it("populate locks a hole with a valid count, deterministically", () => {
		const level = { ...twoGeckos(), mechanicData: {} };
		const a = lockedHoles.populate?.(new Rng(3), level, 0.5);
		expect(a).toEqual(lockedHoles.populate?.(new Rng(3), level, 0.5));
		expect(validateLevel({ ...level, mechanicData: { "locked-holes": a } }, REGISTRY)).toEqual([]);
	});
});
