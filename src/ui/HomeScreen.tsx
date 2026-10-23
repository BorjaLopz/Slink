import type { Level } from "../engine";
import { BoardPreview } from "./BoardPreview";
import { CornerMarks } from "./CornerMarks";
import { PlayIcon } from "./icons";
import { levelNumber } from "./levelText";

interface HomeScreenProps {
	totalLevels: number;
	nextLevel: number;
	onContinue(): void;
	onLevels(): void;
}

/** Decorative board for the title screen, laid out like the design sheet's menu. */
const DEMO_LEVEL: Level = {
	id: 0,
	source: "handcrafted",
	grid: { w: 6, h: 4 },
	holes: [
		{ color: "orange", cell: [0, 0] },
		{ color: "yellow", cell: [5, 0] },
	],
	geckos: [
		{ id: "a", color: "yellow", cells: [[4, 0], [3, 0], [3, 1], [2, 1], [1, 1]] },
		{ id: "b", color: "orange", cells: [[1, 2], [0, 2], [0, 3], [1, 3]] },
		{ id: "c", color: "red", cells: [[5, 3], [5, 2], [4, 2]] },
	],
	mechanics: ["base", "walls"],
	mechanicData: { walls: [[2, 3]] },
	timeLimit: 0,
	stars: { two: 0.3, three: 0.6 },
};

const DEMO_WIDTH = 300;

export function HomeScreen({ totalLevels, nextLevel, onContinue, onLevels }: HomeScreenProps) {
	return (
		<main className="screen screen-enter home">
			<header className="home-header">
				<p className="label">Puzzle · {totalLevels} niveles</p>
				<h1 className="home-title">
					<span>Gecko</span>
					<span className="home-title-accent">Slink</span>
				</h1>
			</header>

			<div className="home-board framed">
				<BoardPreview level={DEMO_LEVEL} width={DEMO_WIDTH} />
				<CornerMarks />
			</div>

			<nav className="home-actions">
				<button className="btn btn-primary framed" onClick={onContinue}>
					<PlayIcon size={18} />
					{nextLevel === 1 ? "Empezar" : `Continuar · Nivel ${levelNumber(nextLevel)}`}
					<CornerMarks />
				</button>
				<button className="btn" onClick={onLevels}>
					Niveles
				</button>
			</nav>
		</main>
	);
}
