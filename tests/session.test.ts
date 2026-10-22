import { describe, expect, it } from "vitest";
import { REGISTRY } from "../src/mechanics";
import { GameSession, starsFor } from "../src/state/gameSession";
import { makeLevel } from "./helpers";

const level = makeLevel({
	timeLimit: 100,
	geckos: [{ id: "g", color: "green", cells: [[2, 3], [2, 4], [2, 5]] }],
	holes: [{ color: "green", cell: [2, 0] }],
});

function fakeClock(): { now: () => number; advance: (seconds: number) => void } {
	let t = 0;
	return { now: () => t, advance: (seconds) => (t += seconds * 1000) };
}

describe("GameSession", () => {
	it("starts the clock on the first grab, not before", () => {
		const clock = fakeClock();
		const session = new GameSession(level, REGISTRY, clock.now);
		clock.advance(30);
		expect(session.elapsed()).toBe(0);
		session.grab([2, 3]);
		clock.advance(5);
		expect(session.elapsed()).toBe(5);
		expect(session.getSnapshot().started).toBe(true);
	});

	it("wins with stars based on the time left", () => {
		const clock = fakeClock();
		const session = new GameSession(level, REGISTRY, clock.now);
		session.grab([2, 3]);
		clock.advance(20);
		session.dragTo([2, 0]);
		const snap = session.getSnapshot();
		expect(snap.outcome).toBe("won");
		expect(snap.stars).toBe(3);
		expect(snap.finalTime).toBe(20);
		// The clock stops on the win.
		clock.advance(50);
		expect(session.elapsed()).toBe(20);
	});

	it("loses when the clock runs out", () => {
		const clock = fakeClock();
		const session = new GameSession(level, REGISTRY, clock.now);
		session.grab([2, 3]);
		clock.advance(100);
		session.tick();
		expect(session.getSnapshot().outcome).toBe("lost");
		expect(session.grab([2, 3])).toBe(false);
	});

	it("does not count paused time", () => {
		const clock = fakeClock();
		const session = new GameSession(level, REGISTRY, clock.now);
		session.grab([2, 3]);
		session.release();
		clock.advance(10);
		session.pause();
		clock.advance(500);
		session.tick();
		expect(session.getSnapshot().outcome).toBe("playing");
		session.resume();
		clock.advance(5);
		expect(session.elapsed()).toBe(15);
	});

	it("undoes whole drags, and restart clears history and clock", () => {
		const clock = fakeClock();
		const session = new GameSession(level, REGISTRY, clock.now);
		const initial = session.state;
		session.grab([2, 3]);
		session.dragTo([2, 2]);
		session.dragTo([2, 1]);
		session.release();
		expect(session.getSnapshot().canUndo).toBe(true);
		session.undo();
		expect(session.state).toBe(initial);
		expect(session.getSnapshot().canUndo).toBe(false);

		clock.advance(3);
		session.restart();
		expect(session.elapsed()).toBe(0);
		expect(session.getSnapshot().started).toBe(false);
	});

	it("a grab without movement is not an undo step", () => {
		const session = new GameSession(level, REGISTRY, fakeClock().now);
		session.grab([2, 3]);
		session.release();
		expect(session.getSnapshot().canUndo).toBe(false);
	});
});

describe("starsFor", () => {
	it("uses the level thresholds on remaining time", () => {
		expect(starsFor(level, 30)).toBe(3);
		expect(starsFor(level, 50)).toBe(2);
		expect(starsFor(level, 90)).toBe(1);
	});
});

describe("drag controls", () => {
	const open = makeLevel({
		grid: { w: 6, h: 6 },
		geckos: [{ id: "g", color: "green", cells: [[2, 2], [2, 3], [2, 4]] }],
		holes: [{ color: "green", cell: [5, 5] }],
	});
	const head = (session: GameSession): [number, number] => session.state.geckos[0].cells[0];

	it("grabs an end from a near miss, but not from far away", () => {
		const session = new GameSession(open, REGISTRY, fakeClock().now);
		expect(session.grabAt({ x: 0.5, y: 0.5 })).toBe(false);
		const near = new GameSession(open, REGISTRY, fakeClock().now);
		// Touch on the edge between the head cell and the one above it.
		expect(near.grabAt({ x: 2.5, y: 2.05 })).toBe(true);
		expect(near.grabbed).toEqual({ geckoId: "g", end: "head" });
		expect(session.grabAt({ x: 4.5, y: 0.5 })).toBe(false);
	});

	it("does not jump when grabbed off-center; steps once the finger leads by half a cell", () => {
		const session = new GameSession(open, REGISTRY, fakeClock().now);
		session.grabAt({ x: 2.8, y: 2.8 });
		session.dragToPoint({ x: 2.8, y: 2.5 });
		expect(head(session)).toEqual([2, 2]);
		session.dragToPoint({ x: 2.8, y: 2.25 });
		expect(head(session)).toEqual([2, 1]);
	});

	it("slides along a wall when dragging diagonally into it", () => {
		const walled = makeLevel({ ...open, mechanics: ["base", "walls"], mechanicData: { walls: [[2, 1]] } });
		const session = new GameSession(walled, REGISTRY, fakeClock().now);
		session.grab([2, 2]);
		// Mostly up (blocked by the wall), a bit to the right: instead of getting stuck it slides right,
		// then keeps chasing the finger up past the wall.
		session.dragToPoint({ x: 3.0, y: 1.9 });
		expect(session.state.geckos[0].cells).toEqual([[3, 1], [3, 2], [2, 2]]);
	});

	it("circling back past older cells keeps moving forward instead of undoing", () => {
		const session = new GameSession(open, REGISTRY, fakeClock().now);
		session.grab([2, 2]);
		const path: [number, number][] = [[2, 1], [3, 1], [3, 2], [3, 3], [4, 3], [4, 2], [4, 1], [3, 1]];
		for (const cell of path) {
			session.dragTo(cell);
		}
		// [3, 1] was visited 7 steps ago; the old code jumped back there. Now it is just the next step.
		expect(session.state.geckos[0].cells).toEqual([[3, 1], [4, 1], [4, 2]]);
	});

	it("walks back one step when the finger returns to the previous cell", () => {
		const session = new GameSession(open, REGISTRY, fakeClock().now);
		session.grab([2, 2]);
		session.dragTo([2, 1]);
		session.dragTo([2, 0]);
		session.dragTo([2, 1]);
		expect(session.state.geckos[0].cells).toEqual([[2, 1], [2, 2], [2, 3]]);
	});

	it("leans towards a free direction and barely at all into a wall", () => {
		const session = new GameSession(open, REGISTRY, fakeClock().now);
		session.grab([2, 2]);
		session.dragToPoint({ x: 2.5, y: 2.2 });
		expect(session.lean?.y).toBeCloseTo(-0.3);
		session.dragToPoint({ x: 2.5, y: 2.9 });
		expect(Math.abs(session.lean?.y ?? 0)).toBeLessThan(0.1);
		session.release();
		expect(session.lean).toBeUndefined();
	});
});
