import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Level } from "../engine";
import { REGISTRY } from "../mechanics";
import { GameSession } from "../state/gameSession";
import { recordWin } from "../state/progress";
import { Board } from "./Board";
import { Clock } from "./Clock";
import { EndPanel } from "./EndPanel";
import { GeckoCounter } from "./GeckoCounter";
import { BackIcon, PauseIcon, RestartIcon, UndoIcon } from "./icons";
import { levelNumber, levelTitle } from "./levelText";
import { VictoryPanel } from "./VictoryPanel";
import { formatClock, useCountdown } from "./useCountdown";

interface GameScreenProps {
	level: Level;
	hasNext: boolean;
	onNext(): void;
	onLevels(): void;
}

interface WinRecord {
	/** finalTime of the win this record belongs to, so a replay never shows a stale panel. */
	time: number;
	previousBest: number | undefined;
}

export function GameScreen({ level, hasNext, onNext, onLevels }: GameScreenProps) {
	const session = useMemo(() => new GameSession(level, REGISTRY), [level]);
	const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
	const timeLeft = useCountdown(session);
	const [win, setWin] = useState<WinRecord>();
	const { state, outcome, paused, started, canUndo, stars, finalTime } = snapshot;
	const missing = state.geckos.filter((g) => !g.saved).length;

	useEffect(() => {
		if (outcome === "won" && stars !== undefined && finalTime !== undefined) {
			const previousBest = recordWin(level.id, stars, finalTime);
			// Progress is an external store; the old record only exists at the moment of saving.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setWin({ time: finalTime, previousBest });
		}
	}, [outcome, stars, finalTime, level.id]);

	// Switching apps on the phone should never cost time.
	useEffect(() => {
		const onHide = (): void => {
			if (document.hidden) {
				session.pause();
			}
		};
		document.addEventListener("visibilitychange", onHide);
		return () => document.removeEventListener("visibilitychange", onHide);
	}, [session]);

	const clock = started ? timeLeft : level.timeLimit;
	const playing = outcome === "playing";

	return (
		<main className="screen screen-enter game">
			<header className="topbar">
				<button className="icon-btn" onClick={onLevels} aria-label="Volver a niveles">
					<BackIcon />
				</button>
				<div className="game-title">
					<span className="label">Nivel {levelNumber(level.id)}</span>
					<span className="game-name">{levelTitle(level)}</span>
				</div>
				<Clock seconds={clock} running={started && playing} />
			</header>

			<p className="hint">{level.hint ?? (started ? " " : "El reloj empieza al tocar un gecko.")}</p>

			<div className="board-area">
				<Board key={level.id} session={session} />
			</div>

			<footer className="game-footer">
				<GeckoCounter geckos={state.geckos} />
				<div className="tool-row">
					<button className="icon-btn" onClick={() => session.undo()} disabled={!canUndo || !playing} aria-label="Deshacer">
						<UndoIcon />
					</button>
					<button className="icon-btn" onClick={() => session.restart()} aria-label="Reiniciar">
						<RestartIcon />
					</button>
					<button className="icon-btn" onClick={() => session.pause()} disabled={!started || !playing} aria-label="Pausa">
						<PauseIcon />
					</button>
				</div>
			</footer>

			{outcome === "won" && stars !== undefined && finalTime !== undefined && (
				<VictoryPanel
					time={finalTime}
					limit={level.timeLimit}
					stars={stars}
					previousBest={win?.time === finalTime ? win.previousBest : undefined}
					hasNext={hasNext}
					onNext={onNext}
					onRetry={() => session.restart()}
					onLevels={onLevels}
				/>
			)}

			{outcome === "lost" && (
				<EndPanel
					label="Tiempo agotado"
					title={missing === 1 ? "¡Casi! Faltaba 1 gecko" : `Faltaban ${missing} geckos`}
					actions={
						<>
							<button className="btn btn-primary" onClick={() => session.restart()}>
								Reintentar
							</button>
							<button className="btn" onClick={onLevels}>
								Niveles
							</button>
						</>
					}
				/>
			)}

			{paused && (
				<EndPanel
					label="Pausa"
					title={`${formatClock(timeLeft)} restantes`}
					actions={
						<>
							<button className="btn btn-primary" onClick={() => session.resume()}>
								Continuar
							</button>
							<button className="btn" onClick={onLevels}>
								Niveles
							</button>
						</>
					}
				/>
			)}
		</main>
	);
}
