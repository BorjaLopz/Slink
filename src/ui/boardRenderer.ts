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
	/** 0 → 1 while held: the gecko rises off the board (sheet: "Arrastrando"). */
	lift: number;
}

/**
 * Slither feel: a single step closes a fixed share of the remaining gap per second (fast start, soft
 * landing), with a small floor so it always finishes. When steps queue up (long, fast finger
 * patterns) the speed ramps up with the backlog, and the visual never trails more than MAX_LAG cells,
 * so the gecko stays glued to the finger instead of replaying the path late.
 */
const SLIDE_RESPONSE = 11;
const BACKLOG_BOOST = 2.5;
const MIN_SLIDE_SPEED = 2.5;
const MAX_SLIDE_SPEED = 45;
const MAX_LAG = 1.2;
const SWALLOW_SPEED = 9;
const FADE_SPEED = 5;
const BUMP_DECAY = 6;
const LEAN_EASE = 14;
const HOLE_CLOSE_DELAY = -0.35;
const HOLE_CLOSE_SPEED = 3;
const LIFT_SPEED = 12;
/** Sheet sizes, in cells: body width, hard rest shadow, lifted shadow and how far a held gecko rises. */
const BODY_WIDTH = 0.6;
const REST_SHADOW = 0.07;
const LIFT_SHADOW = 0.24;
const LIFT_BLUR = 0.16;
const LIFT_RISE = 0.08;
/** The tail sticks out half a cell past the last segment; it does not occupy or block that cell. */
const TAIL_LENGTH = 0.45;
/** Slow breathing halo that makes open holes the brightest thing on the board after the geckos. */
const HOLE_GLOW_SPEED = 2.2;

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
		lift: 0,
	};
}

export class BoardRenderer {
	private anims = new Map<string, GeckoAnim>();
	private holePulse = new Map<string, number>();
	/** Full holes close up and vanish: progress 0 → 1, starting negative to wait for the swallow. */
	private holeClose = new Map<string, number>();
	private time = 0;
	private lean: Point = { x: 0, y: 0 };

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

	draw(c: CanvasRenderingContext2D, cellSize: number, state: GameState, grabbed: Grab | undefined, lean: Point | undefined, dt: number): void {
		this.time += dt;
		// Ease the displayed lean so the end glides after the finger instead of twitching with it.
		const targetLean = grabbed && lean ? lean : { x: 0, y: 0 };
		const k = Math.min(1, dt * LEAN_EASE);
		this.lean = { x: this.lean.x + (targetLean.x - this.lean.x) * k, y: this.lean.y + (targetLean.y - this.lean.y) * k };
		const { level } = this.rules;
		const width = level.grid.w * cellSize;
		const height = level.grid.h * cellSize;
		const renderer: Renderer = {
			c,
			cellSize,
			toPx: (cell) => ({ x: cell[0] * cellSize, y: cell[1] * cellSize }),
			theme: BOARD_THEME,
			game: state,
			drawRock: (cell) => drawRock(c, cell, cellSize),
		};

		c.clearRect(0, 0, width, height);
		drawBoard(c, level.grid.w, level.grid.h, cellSize);

		this.drawHoles(c, cellSize, state, dt);

		// After the holes: mechanics may decorate them (locks). Nothing else overlaps a hole.
		for (const mechanic of this.rules.mechanics) {
			mechanic.render?.(renderer, level, level.mechanicData[mechanic.id], state.mechState[mechanic.id]);
		}

		// The held gecko is drawn last so it floats over everything else.
		const ordered = [...state.geckos].sort((a, b) => Number(a.id === grabbed?.geckoId) - Number(b.id === grabbed?.geckoId));
		for (const gecko of ordered) {
			const anim = this.anims.get(gecko.id);
			if (anim) {
				const grabbedEnd = grabbed?.geckoId === gecko.id ? grabbed.end : undefined;
				this.advance(anim, dt, grabbedEnd !== undefined);
				const shift = grabbedEnd ? { x: this.lean.x * cellSize, y: this.lean.y * cellSize } : undefined;
				this.drawGecko(c, cellSize, gecko, anim, grabbedEnd, shift);
			}
		}
	}

	private advance(anim: GeckoAnim, dt: number, held: boolean): void {
		anim.lift = held ? Math.min(1, anim.lift + LIFT_SPEED * dt) : Math.max(0, anim.lift - LIFT_SPEED * dt);
		if (Math.abs(anim.target - anim.a) > MAX_LAG) {
			anim.a = anim.target - Math.sign(anim.target - anim.a) * MAX_LAG;
		}
		const gap = anim.target - anim.a;
		const backlog = Math.max(0, Math.abs(gap) - 1);
		const speed = Math.min(MAX_SLIDE_SPEED, Math.max(MIN_SLIDE_SPEED, Math.abs(gap) * SLIDE_RESPONSE * (1 + backlog * BACKLOG_BOOST)));
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

	private drawGecko(
		c: CanvasRenderingContext2D,
		cellSize: number,
		gecko: Gecko,
		anim: GeckoAnim,
		grabbedEnd: "head" | "tail" | undefined,
		shift: Point | undefined,
	): void {
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
		if (grabbedEnd && shift && !anim.saved) {
			const i = grabbedEnd === "head" ? 0 : points.length - 1;
			points[i] = { x: points[i].x + shift.x, y: points[i].y + shift.y };
		}
		const width = cellSize * BODY_WIDTH * (anim.saved && anim.swallow >= n - 1 ? anim.fade : 1);
		const shake = anim.bump > 0 ? Math.sin(this.time * 60) * anim.bump * cellSize * 0.06 : 0;
		const lift = anim.lift;
		const tail = anim.saved ? undefined : this.tailPoint(anim, t1, points[points.length - 1], cellSize);
		const outline = Math.max(2, cellSize * 0.045);

		c.save();
		c.translate(shake, -LIFT_RISE * cellSize * lift);
		c.lineCap = "round";
		c.lineJoin = "round";

		// Shadow: hard and short at rest (a toy on paper), long and soft while held.
		c.save();
		c.translate(0, cellSize * (REST_SHADOW + (LIFT_SHADOW - REST_SHADOW) * lift + LIFT_RISE * lift));
		if (lift > 0) {
			c.filter = `blur(${(cellSize * LIFT_BLUR * lift).toFixed(1)}px)`;
		}
		const shadow = lift > 0 ? BOARD_THEME.shadowLifted : BOARD_THEME.shadow;
		this.drawSilhouette(c, points, tail, width + outline, shadow, cellSize);
		c.restore();

		if (!anim.saved) {
			const front = n >= 3 ? 0.7 : 0.3;
			this.drawLegs(c, anim, t0 + front, width, palette.outline, cellSize);
			this.drawLegs(c, anim, t1 - front, width, palette.outline, cellSize);
		}
		this.drawSilhouette(c, points, tail, width + outline, palette.outline, cellSize);
		this.drawSilhouette(c, points, tail, width, palette.body, cellSize);
		// Highlight stripe along the back, as in the sheet's "Anatomía".
		c.globalAlpha = 0.75;
		this.strokePath(c, points, width * 0.18, palette.spine);
		c.globalAlpha = 1;

		if (grabbedEnd) {
			const p = grabbedEnd === "head" ? points[0] : points[points.length - 1];
			c.strokeStyle = BOARD_THEME.grabRing;
			c.globalAlpha = 0.5 * lift;
			c.lineWidth = 2;
			c.beginPath();
			c.arc(p.x, p.y, width * 0.85, 0, Math.PI * 2);
			c.stroke();
			c.globalAlpha = 1;
		}

		if (!anim.saved) {
			this.drawEyes(c, anim, points[0], width, cellSize);
		}
		c.restore();
	}

	/** Point half a cell past the last segment, continuing its direction: where the tail tip goes. */
	private tailPoint(anim: GeckoAnim, t1: number, end: Point, cellSize: number): Point {
		const before = this.pointAt(anim, t1 - 0.5, cellSize);
		const len = Math.hypot(end.x - before.x, end.y - before.y) || 1;
		return {
			x: end.x + ((end.x - before.x) / len) * cellSize * TAIL_LENGTH,
			y: end.y + ((end.y - before.y) / len) * cellSize * TAIL_LENGTH,
		};
	}

	/** Body + head bulb + thin tail in one color (used for the shadow, outline and fill passes). */
	private drawSilhouette(c: CanvasRenderingContext2D, points: Point[], tail: Point | undefined, width: number, color: string, cellSize: number): void {
		this.strokePath(c, points, width, color);
		if (tail) {
			this.strokePath(c, [points[points.length - 1], tail], width * 0.42, color);
		}
		// The head is a touch wider than the body.
		c.fillStyle = color;
		c.beginPath();
		c.arc(points[0].x, points[0].y, width * 0.56 + cellSize * 0.01, 0, Math.PI * 2);
		c.fill();
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
		const reach = width * 0.82;
		c.strokeStyle = color;
		c.lineWidth = width * 0.22;
		c.beginPath();
		c.moveTo(p.x - px * reach, p.y - py * reach);
		c.lineTo(p.x + px * reach, p.y + py * reach);
		c.stroke();
	}

	private drawEyes(c: CanvasRenderingContext2D, anim: GeckoAnim, head: Point, width: number, cellSize: number): void {
		const neck = this.pointAt(anim, anim.a + 0.5, cellSize);
		const len = Math.hypot(head.x - neck.x, head.y - neck.y) || 1;
		const dx = (head.x - neck.x) / len;
		const dy = (head.y - neck.y) / len;
		const r = width / 2;
		for (const side of [-1, 1]) {
			const ex = head.x + dx * r * 0.35 - dy * r * 0.48 * side;
			const ey = head.y + dy * r * 0.35 + dx * r * 0.48 * side;
			c.fillStyle = BOARD_THEME.eyeWhite;
			c.beginPath();
			c.arc(ex, ey, r * 0.32, 0, Math.PI * 2);
			c.fill();
			c.fillStyle = BOARD_THEME.eyePupil;
			c.beginPath();
			c.arc(ex + dx * r * 0.1, ey + dy * r * 0.1, r * 0.17, 0, Math.PI * 2);
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
			const scale = (1 + pulse * 0.25) * (1 - closing * closing * closing);
			const radius = cellSize * 0.4 * scale;
			const ring = cellSize * 0.09 * scale;
			const glow = full ? 0 : 0.5 + 0.5 * Math.sin(this.time * HOLE_GLOW_SPEED + hole.cell[0] + hole.cell[1]);
			const fade = 1 - closing;

			// Halo: open holes breathe softly in their color so they read from across the board.
			c.fillStyle = palette.body;
			c.globalAlpha = (0.1 + 0.12 * glow + 0.4 * pulse) * fade;
			c.beginPath();
			c.arc(cx, cy, radius + ring * (0.9 + 0.5 * glow), 0, Math.PI * 2);
			c.fill();

			c.globalAlpha = fade;
			c.fillStyle = BOARD_THEME.pit;
			c.beginPath();
			c.arc(cx, cy, radius, 0, Math.PI * 2);
			c.fill();
			// Inner black ring (sheet: "anillo interior negro 55 %") and a tinted floor dot for depth.
			c.strokeStyle = "rgba(0, 0, 0, 0.55)";
			c.lineWidth = ring;
			c.beginPath();
			c.arc(cx, cy, radius - ring * 1.4, 0, Math.PI * 2);
			c.stroke();
			c.fillStyle = palette.outline;
			c.globalAlpha = 0.45 * fade;
			c.beginPath();
			c.arc(cx, cy, radius * 0.32, 0, Math.PI * 2);
			c.fill();
			c.globalAlpha = fade;
			c.strokeStyle = palette.body;
			c.lineWidth = ring;
			c.beginPath();
			c.arc(cx, cy, radius - ring / 2, 0, Math.PI * 2);
			c.stroke();
			c.globalAlpha = 1;
		}
	}
}

/**
 * Sunken blueprint board: flat fill, fine grid lines and an inset shadow along the top edge
 * (sheet: "inset 0 3px 14px rgb(0 0 0/.55)").
 */
function drawBoard(c: CanvasRenderingContext2D, w: number, h: number, cellSize: number): void {
	const width = w * cellSize;
	const height = h * cellSize;
	c.fillStyle = BOARD_THEME.board;
	c.fillRect(0, 0, width, height);

	c.strokeStyle = BOARD_THEME.grid;
	c.lineWidth = 1;
	c.beginPath();
	for (let x = 1; x < w; x++) {
		c.moveTo(Math.round(x * cellSize) + 0.5, 0);
		c.lineTo(Math.round(x * cellSize) + 0.5, height);
	}
	for (let y = 1; y < h; y++) {
		c.moveTo(0, Math.round(y * cellSize) + 0.5);
		c.lineTo(width, Math.round(y * cellSize) + 0.5);
	}
	c.stroke();

	c.save();
	c.beginPath();
	c.rect(0, 0, width, height);
	c.clip();
	c.shadowColor = "rgba(0, 0, 0, 0.55)";
	c.shadowBlur = 14;
	c.shadowOffsetY = 3;
	c.strokeStyle = BOARD_THEME.board;
	c.lineWidth = 20;
	c.strokeRect(-10, -10, width + 20, height + 20);
	c.restore();
}

/** Rock: hatched block with a hard short shadow, the only diagonal pattern on the board. */
function drawRock(c: CanvasRenderingContext2D, cell: Cell, cellSize: number): void {
	const inset = cellSize * 0.06;
	const size = cellSize - inset * 2;
	const x = cell[0] * cellSize + inset;
	const y = cell[1] * cellSize + inset;
	c.save();
	c.fillStyle = "rgba(0, 0, 0, 0.4)";
	c.fillRect(x, y + 3, size, size);
	c.fillStyle = BOARD_THEME.rock;
	c.fillRect(x, y, size, size);
	c.beginPath();
	c.rect(x, y, size, size);
	c.clip();
	c.strokeStyle = BOARD_THEME.rockHatch;
	c.lineWidth = Math.max(1.5, cellSize * 0.04);
	const gap = cellSize * 0.16;
	c.beginPath();
	for (let d = -size; d < size * 2; d += gap) {
		c.moveTo(x + d, y);
		c.lineTo(x + d + size, y + size);
	}
	c.stroke();
	c.restore();
	c.strokeStyle = BOARD_THEME.rockEdge;
	c.lineWidth = 1;
	c.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}
