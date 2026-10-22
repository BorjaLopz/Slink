import { useState } from "react";
import { GameScreen } from "./ui/GameScreen";
import { LevelSelect } from "./ui/LevelSelect";
import { useLevels } from "./ui/useLevels";

export function App() {
	const levels = useLevels();
	/** Level being played, or undefined for the level list. */
	const [playing, setPlaying] = useState<number>();

	if (levels.status === "loading") {
		return <div className="status">Cargando niveles…</div>;
	}
	if (levels.status === "error") {
		return <div className="status">No se pudieron cargar los niveles: {levels.message}</div>;
	}

	const list = levels.levels;
	const index = list.findIndex((l) => l.id === playing);
	if (index < 0) {
		return <LevelSelect levels={list} onPlay={setPlaying} />;
	}
	return (
		<GameScreen
			key={list[index].id}
			level={list[index]}
			hasNext={index < list.length - 1}
			onNext={() => setPlaying(list[index + 1].id)}
			onMenu={() => setPlaying(undefined)}
		/>
	);
}
