import { sameCell } from "../engine";
import type { Cell, GameState, Gecko, Renderer, Rules } from "../engine";
import type { Grab } from "../state/gameSession";
import { BOARD_THEME, GECKO_COLORS } from "./theme";

interface Point {
	x: number;
	y: number;
}

/**
 * Visual state of one gecko. The body is drawn as a window of `length` cells sliding along `trail`,
 * so consecutive steps (or retracing) animate as a continuous slither instead of teleporting.
 */
interface GeckoAnim {
	trail: Cell[];
	/** Visual window start, fractional index into trail. Eases toward `target`. */
	a: number;
	/** Logical window start: trail[target..target+length-1] equals the gecko's cells. */
	target: number;
	length: number;
	saved: boolean;
	savedAtHead: boolean;
	/** Cells already slid into the hole. */
	swallow: number;
	/** 1 → 0 once fully swallowed. */
	fade: number;
	bump: number;
}

const MIN_SLIDE_SPEED = 14;
const SLIDE_CATCHUP = 18;
const SWALLOW_SPEED = 16;
const FADE_SPEED = 7;
const BUMP_DECAY = 6;
const HOLE_CLOSE_DELAY = -0.35;
const HOLE_CLOSE_SPEED = 3;

function cellsEqual(a: Cell[], b: Cell[]): boolean {
	return a.length === b.length && a.every((c, i) => sameCell(c, b[i]));
}

function snapAnim(gecko: Gecko): GeckoAnim {
	return {
		trail: gecko.cells.map((c) => [c[0], c[1]]),
		a: 0,
		target: 0,
		length: gecko.cells.length,
		saved: gecko.saved,
		savedAtHead: true,
		swallow: gecko.saved ? gecko.cells.length : 0,
		fade: gecko.saved ? 0 : 1,
		bump: 0,
	};
}

export class BoardRenderer {
	private anims = new Map<string, GeckoAnim>();
	private holePulse = new Map<string, number>();
	/** Full holes close up and vanish: progress 0 → 1, starting negative to wait for the swallow. */
	private holeClose = new Map<string, number>();
	private time = 0;

	constructor(private readonly rules: Rules) {}

	reset(state: GameState): void {
		this.anims.clear();
		this.holePulse.clear();
		this.holeClose.clear();
		this.sync(state);
	}

	bump(geckoId: string): void {
		const anim = this.anims.get(geckoId);
		if (anim) {
			anim.bump = 1;
		}
	}

	pulseHole(cell: Cell): void {
		this.holePulse.set(`${cell[0]},${cell[1]}`, 1);
		this.holeClose.set(`${cell[0]},${cell[1]}`, HOLE_CLOSE_DELAY);
	}

	/** Reconciles the visual trails with a new logical state. */
	sync(state: GameState): void {
		for (const gecko of state.geckos) {
			const anim = this.anims.get(gecko.id);
			if (!anim || anim.length !== gecko.cells.length || (anim.saved && !gecko.saved)) {
				this.anims.set(gecko.id, snapAnim(gecko));
				continue;
			}
			this.follow(anim, gecko.cells);
			if (gecko.saved && !anim.saved) {
				anim.saved = true;
				anim.savedAtHead = state.holes.some((h) => sameCell(h.cell, gecko.cells[0]));
			}
		}
	}

	private follow(anim: GeckoAnim, cells: Cell[]): void {
		const n = cells.length;
		const window = anim.trail.slice(anim.target, anim.target + n);
		if (cellsEqual(window, cells)) {
			return;
		}
		// Moving back along the existing trail (finger retracing the drag).
		for (let k = 0; k + n <= anim.trail.length; k++) {
			if (cellsEqual(anim.trail.slice(k, k + n), cells)) {
				anim.target = k;
				return;
			}
		}
		if (cellsEqual(cells.slice(1), window.slice(0, n - 1))) {
			// Head advanced: grow the trail at the front.
			anim.trail = [cells[0], ...anim.trail.slice(anim.target)];
			anim.a = Math.max(0, anim.a - anim.target + 1);
			anim.target = 0;
			return;
		}
		if (cellsEqual(cells.slice(0, n - 1), window.slice(1))) {
			// Tail advanced: grow the trail at the back.
			anim.trail = [...anim.trail.slice(0, anim.target + n), cells[n - 1]];
			anim.target += 1;
			return;
		}
		anim.trail = cells.map((c) => [c[0], c[1]]);
		anim.a = 0;
		anim.target = 0;
	}

	draw(c: CanvasRenderingContext2D, cellSize: number, state: GameState, grabbed: Grab | undefined, dt: number): void {
		this.time += dt;
		const { level } = this.rules;
		const width = level.grid.w * cellSize;
		const height = level.grid.h * cellSize;
		const renderer: Renderer = {
			c,
			cellSize,
			toPx: (cell) => ({ x: cell[0] * cellSize, y: cell[1] * cellSize }),
			theme: BOARD_THEME,
		};

		c.clearRect(0, 0, width, height);
		c.fillStyle = BOARD_THEME.board;
		c.beginPath();
		c.roundRect(0, 0, width, height, 8);
		c.fill();
		c.fillStyle = BOARD_THEME.cellDot;
		for (let y = 0; y < level.grid.h; y++) {
			for (let x = 0; x < level.grid.w; x++) {
				c.beginPath();
				c.arc((x + 0.5) * cellSize, (y + 0.5) * cellSize, cellSize * 0.05, 0, Math.PI * 2);
				c.fill();
			}
		}

		for (const mechanic of this.rules.mechanics) {
			mechanic.render?.(renderer, level, level.mechanicData[mechanic.id], state.mechState[mechanic.id]);
		}

		this.drawHoles(c, cellSize, state, dt);

		for (const gecko of state.geckos) {
			const anim = this.anims.get(gecko.id);
			if (anim) {
				this.advance(anim, dt);
				const grabbedEnd = grabbed?.geckoId === gecko.id ? grabbed.end : undefined;
				this.drawGecko(c, cellSize, gecko, anim, grabbedEnd);
			}
		}
	}

	private advance(anim: GeckoAnim, dt: number): void {
		const gap = anim.target - anim.a;
		const speed = Math.max(MIN_SLIDE_SPEED, Math.abs(gap) * SLIDE_CATCHUP);
		anim.a = Math.abs(gap) <= speed * dt ? anim.target : anim.a + Math.sign(gap) * speed * dt;
		anim.bump = Math.max(0, anim.bump - BUMP_DECAY * dt);

		if (anim.saved && anim.a === anim.target) {
			if (anim.swallow < anim.length - 1) {
				anim.swallow = Math.min(anim.length - 1, anim.swallow + SWALLOW_SPEED * dt);
			} else {
				anim.fade = Math.max(0, anim.fade - FADE_SPEED * dt);
			}
		}

		const lo = Math.floor(Math.min(anim.a, anim.target));
		if (lo > 0) {
			anim.trail.splice(0, lo);
			anim.a -= lo;
			anim.target -= lo;
		}
		const hi = Math.ceil(Math.max(anim.a, anim.target)) + anim.length;
		if (anim.trail.length > hi) {
			anim.trail.length = hi;
		}
	}

	private pointAt(anim: GeckoAnim, t: number, cellSize: number): Point {
		const last = anim.trail.length - 1;
		const clamped = Math.min(Math.max(t, 0), last);
		const i = Math.min(Math.floor(clamped), last);
		const f = clamped - i;
		const p = anim.trail[i];
		const q = anim.trail[Math.min(i + 1, last)];
		return {
			x: (p[0] + (q[0] - p[0]) * f + 0.5) * cellSize,
			y: (p[1] + (q[1] - p[1]) * f + 0.5) * cellSize,
		};
	}

	private polyline(anim: GeckoAnim, t0: number, t1: number, cellSize: number): Point[] {
		const points = [this.pointAt(anim, t0, cellSize)];
		for (let i = Math.floor(t0) + 1; i < t1; i++) {
			points.push(this.pointAt(anim, i, cellSize));
		}
		points.push(this.pointAt(anim, t1, cellSize));
		return points;
	}

	private drawGecko(c: CanvasRenderingContext2D, cellSize: number, gecko: Gecko, anim: GeckoAnim, grabbedEnd: "head" | "tail" | undefined): void {
		if (anim.fade <= 0) {
			return;
		}
		const palette = GECKO_COLORS[gecko.color];
		const n = anim.length;
		let t0 = anim.a;
		let t1 = anim.a + n - 1;
		if (anim.saved) {
			if (anim.savedAtHead) {
				t1 -= anim.swallow;
			} else {
				t0 += anim.swallow;
			}
		}
		const points = this.polyline(anim, t0, t1, cellSize);
		const width = cellSize * 0.56 * (anim.saved && anim.swallow >= n - 1 ? anim.fade : 1);
		const shake = anim.bump > 0 ? Math.sin(this.time * 60) * anim.bump * cellSize * 0.06 : 0;

		c.save();
		c.translate(shake, 0);
		c.lineCap = "round";
		c.lineJoin = "round";

		if (!anim.saved && n >= 3) {
			this.drawLegs(c, anim, t0 + 0.7, width, palette.outline, cellSize);
			this.drawLegs(c, anim, t1 - 0.7, width, palette.outline, cellSize);
		}

		this.strokePath(c, points, width + Math.max(3, cellSize * 0.06), palette.outline);
		this.strokePath(c, points, width, palette.body);
		c.globalAlpha = 0.55;
		this.strokePath(c, points, width * 0.2, palette.spine);
		c.globalAlpha = 1;

		if (grabbedEnd) {
			const p = grabbedEnd === "head" ? points[0] : points[points.length - 1];
			c.strokeStyle = BOARD_THEME.grabRing;
			c.globalAlpha = 0.35;
			c.lineWidth = 2;
			c.beginPath();
			c.arc(p.x, p.y, width * 0.75, 0, Math.PI * 2);
			c.stroke();
			c.globalAlpha = 1;
		}

		if (!anim.saved) {
			this.drawEyes(c, anim, width, cellSize);
		}
		c.restore();
	}

	private strokePath(c: CanvasRenderingContext2D, points: Point[], width: number, color: string): void {
		c.strokeStyle = color;
		c.lineWidth = width;
		c.beginPath();
		c.moveTo(points[0].x, points[0].y);
		for (let i = 1; i < points.length; i++) {
			c.lineTo(points[i].x, points[i].y);
		}
		// A zero-length path draws nothing with round caps in some browsers; nudge it.
		if (points.length === 2 && points[0].x === points[1].x && points[0].y === points[1].y) {
			c.lineTo(points[0].x + 0.01, points[0].y);
		}
		c.stroke();
	}

	private drawLegs(c: CanvasRenderingContext2D, anim: GeckoAnim, t: number, width: number, color: string, cellSize: number): void {
		const p = this.pointAt(anim, t, cellSize);
		const q = this.pointAt(anim, t + 0.2, cellSize);
		const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
		const px = -(q.y - p.y) / len;
		const py = (q.x - p.x) / len;
		const reach = width * 0.78;
		c.strokeStyle = color;
		c.lineWidth = width * 0.26;
		c.beginPath();
		c.moveTo(p.x - px * reach, p.y - py * reach);
		c.lineTo(p.x + px * reach, p.y + py * reach);
		c.stroke();
	}

	private drawEyes(c: CanvasRenderingContext2D, anim: GeckoAnim, width: number, cellSize: number): void {
		const head = this.pointAt(anim, anim.a, cellSize);
		const neck = this.pointAt(anim, anim.a + 0.5, cellSize);
		const len = Math.hypot(head.x - neck.x, head.y - neck.y) || 1;
		const dx = (head.x - neck.x) / len;
		const dy = (head.y - neck.y) / len;
		const r = width / 2;
		for (const side of [-1, 1]) {
			const ex = head.x + dx * r * 0.2 - dy * r * 0.5 * side;
			const ey = head.y + dy * r * 0.2 + dx * r * 0.5 * side;
			c.fillStyle = BOARD_THEME.eyeWhite;
			c.beginPath();
			c.arc(ex, ey, r * 0.3, 0, Math.PI * 2);
			c.fill();
			c.fillStyle = BOARD_THEME.eyePupil;
			c.beginPath();
			c.arc(ex + dx * r * 0.1, ey + dy * r * 0.1, r * 0.15, 0, Math.PI * 2);
			c.fill();
		}
	}

	private drawHoles(c: CanvasRenderingContext2D, cellSize: number, state: GameState, dt: number): void {
		for (const hole of state.holes) {
			const key = `${hole.cell[0]},${hole.cell[1]}`;
			const pulse = this.holePulse.get(key) ?? 0;
			if (pulse > 0) {
				this.holePulse.set(key, Math.max(0, pulse - dt * 3));
			}
			const palette = GECKO_COLORS[hole.color];
			const cx = (hole.cell[0] + 0.5) * cellSize;
			const cy = (hole.cell[1] + 0.5) * cellSize;
			const full = hole.filled >= hole.capacity;
			let closing = 0;
			if (full) {
				// A full hole is plain floor in the rules; visually it shrinks away after the swallow.
				const progress = Math.min(1, (this.holeClose.get(key) ?? 1) + dt * HOLE_CLOSE_SPEED);
				this.holeClose.set(key, progress);
				if (progress >= 1) {
					continue;
				}
				closing = Math.max(0, progress);
			}
			const radius = cellSize * 0.36 * (1 + pulse * 0.25) * (1 - closing * closing * closing);

			c.fillStyle = BOARD_THEME.holeInner;
			c.beginPath();
			c.arc(cx, cy, radius, 0, Math.PI * 2);
			c.fill();
			c.strokeStyle = palette.body;
			c.globalAlpha = 1 - closing;
			c.lineWidth = Math.max(2, cellSize * 0.07);
			c.stroke();
			c.globalAlpha = 1;
		}
	}
}
