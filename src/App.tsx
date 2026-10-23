import { useState } from "react";
import { nextLevelId, useProgress } from "./state/progress";
import { GameScreen } from "./ui/GameScreen";
import { HomeScreen } from "./ui/HomeScreen";
import { LevelSelect } from "./ui/LevelSelect";
import { useLevels } from "./ui/useLevels";

type Screen = { name: "home" } | { name: "levels" } | { name: "game"; levelId: number };

export function App() {
	const levels = useLevels();
	const progress = useProgress();
	const [screen, setScreen] = useState<Screen>({ name: "home" });

	if (levels.status === "loading") {
		return <div className="status">Cargando niveles…</div>;
	}
	if (levels.status === "error") {
		return <div className="status">No se pudieron cargar los niveles: {levels.message}</div>;
	}

	const list = levels.levels;
	const play = (levelId: number): void => setScreen({ name: "game", levelId });
	const toLevels = (): void => setScreen({ name: "levels" });
	const next = nextLevelId(progress, list.map((l) => l.id));

	if (screen.name === "home") {
		return <HomeScreen totalLevels={list.length} nextLevel={next} onContinue={() => play(next)} onLevels={toLevels} />;
	}
	const index = screen.name === "game" ? list.findIndex((l) => l.id === screen.levelId) : -1;
	if (index < 0) {
		return <LevelSelect levels={list} onPlay={play} onBack={() => setScreen({ name: "home" })} />;
	}
	return (
		<GameScreen
			key={list[index].id}
			level={list[index]}
			hasNext={index < list.length - 1}
			onNext={() => play(list[index + 1].id)}
			onLevels={toLevels}
		/>
	);
}
