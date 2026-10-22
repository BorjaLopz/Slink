import type { Cell, Direction } from "./types";

export const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];

const OFFSETS: Record<Direction, Cell> = {
	up: [0, -1],
	down: [0, 1],
	left: [-1, 0],
	right: [1, 0],
};

export function cellKey(cell: Cell): string {
	return `${cell[0]},${cell[1]}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
	return a[0] === b[0] && a[1] === b[1];
}

export function moveCell(cell: Cell, dir: Direction): Cell {
	const offset = OFFSETS[dir];
	return [cell[0] + offset[0], cell[1] + offset[1]];
}

export function manhattan(a: Cell, b: Cell): number {
	return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

export function isAdjacent(a: Cell, b: Cell): boolean {
	return manhattan(a, b) === 1;
}

/** Direction that takes `from` to the adjacent cell `to`, or undefined if they aren't adjacent. */
export function directionBetween(from: Cell, to: Cell): Direction | undefined {
	return DIRECTIONS.find((dir) => sameCell(moveCell(from, dir), to));
}
