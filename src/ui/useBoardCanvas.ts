import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { Cell } from "../engine";
import type { GameSession } from "../state/gameSession";
import { BoardRenderer } from "./boardRenderer";

interface BoardCanvas {
	containerRef: RefObject<HTMLDivElement | null>;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void;
	onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void;
	onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void;
}

const MAX_FRAME_DT = 0.05;

/**
 * Wires a GameSession to a canvas: sizing, the requestAnimationFrame loop and pointer input.
 * Drawing happens outside React's render cycle; React only mounts the elements.
 */
export function useBoardCanvas(session: GameSession): BoardCanvas {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const cellSizeRef = useRef(0);

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		const c = canvas?.getContext("2d");
		if (!container || !canvas || !c) {
			return;
		}
		const { grid } = session.rules.level;
		const renderer = new BoardRenderer(session.rules);
		renderer.reset(session.state);

		const resize = (): void => {
			const cellSize = Math.floor(Math.min(container.clientWidth / grid.w, container.clientHeight / grid.h));
			const dpr = window.devicePixelRatio || 1;
			cellSizeRef.current = cellSize;
			canvas.style.width = `${cellSize * grid.w}px`;
			canvas.style.height = `${cellSize * grid.h}px`;
			canvas.width = Math.round(cellSize * grid.w * dpr);
			canvas.height = Math.round(cellSize * grid.h * dpr);
			c.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(container);

		const unsubscribe = session.subscribe(() => renderer.sync(session.state));
		const offFeedback = session.onFeedback((event) => {
			if (event.type === "bump") {
				renderer.bump(event.geckoId);
			} else if (event.type === "hole:filled") {
				renderer.pulseHole(event.cell);
				navigator.vibrate?.(30);
			} else if (event.type === "reset") {
				renderer.reset(session.state);
			}
		});

		let frame = 0;
		let last = performance.now();
		const loop = (now: number): void => {
			const dt = Math.min((now - last) / 1000, MAX_FRAME_DT);
			last = now;
			session.tick();
			renderer.draw(c, cellSizeRef.current, session.state, session.grabbed, dt);
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			unsubscribe();
			offFeedback();
		};
	}, [session]);

	const toCell = (event: ReactPointerEvent<HTMLCanvasElement>): Cell => {
		const rect = event.currentTarget.getBoundingClientRect();
		const size = cellSizeRef.current || 1;
		const { w, h } = session.rules.level.grid;
		const x = Math.floor((event.clientX - rect.left) / size);
		const y = Math.floor((event.clientY - rect.top) / size);
		return [Math.min(Math.max(x, 0), w - 1), Math.min(Math.max(y, 0), h - 1)];
	};

	return {
		containerRef,
		canvasRef,
		onPointerDown(event) {
			if (session.grab(toCell(event))) {
				event.currentTarget.setPointerCapture(event.pointerId);
			}
		},
		onPointerMove(event) {
			if (session.grabbed) {
				session.dragTo(toCell(event));
			}
		},
		onPointerUp() {
			session.release();
		},
	};
}
