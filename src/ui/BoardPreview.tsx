import { useEffect, useRef } from "react";
import { createInitialState, createRules } from "../engine";
import type { Level } from "../engine";
import { REGISTRY } from "../mechanics";
import { BoardRenderer } from "./boardRenderer";

interface BoardPreviewProps {
	level: Level;
	/** Width in CSS pixels; the height follows the board's aspect ratio. */
	width: number;
}

/**
 * Static drawing of a level's starting position (menu demo and level-list thumbnails). Drawing waits
 * until the canvas scrolls into view: the level list grows without limit and painting every
 * thumbnail up front made opening it take seconds.
 */
export function BoardPreview({ level, width }: BoardPreviewProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const cellSize = Math.floor(width / level.grid.w);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const draw = (): void => {
			const c = canvas.getContext("2d");
			if (!c) {
				return;
			}
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.round(cellSize * level.grid.w * dpr);
			canvas.height = Math.round(cellSize * level.grid.h * dpr);
			c.setTransform(dpr, 0, 0, dpr, 0, 0);
			const rules = createRules(level, REGISTRY);
			const state = createInitialState(rules);
			const renderer = new BoardRenderer(rules);
			renderer.reset(state);
			renderer.draw(c, cellSize, state, undefined, undefined, 0);
		};
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					observer.disconnect();
					draw();
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [level, cellSize]);

	return (
		<canvas
			ref={canvasRef}
			className="board-preview"
			style={{ width: cellSize * level.grid.w, height: cellSize * level.grid.h }}
			aria-hidden="true"
		/>
	);
}
