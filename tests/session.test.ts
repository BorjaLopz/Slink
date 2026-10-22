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
