import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Level } from "../engine";
import { REGISTRY } from "../mechanics";
import { GameSession } from "../state/gameSession";
import { recordWin } from "../state/progress";
import { Board } from "./Board";
import { EndPanel } from "./EndPanel";
import { StarRow } from "./StarRow";
import { TierLabel } from "./TierLabel";
import { formatClock, useCountdown } from "./useCountdown";

interface GameScreenProps {
	level: Level;
	hasNext: boolean;
	onNext(): void;
	onMenu(): void;
}

const LOW_TIME_SECONDS = 10;

export function GameScreen({ level, hasNext, onNext, onMenu }: GameScreenProps) {
	const session = useMemo(() => new GameSession(level, REGISTRY), [level]);
	const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
	const timeLeft = useCountdown(session);
	const { state, outcome, paused, started, canUndo, stars, finalTime } = snapshot;
	const saved = state.geckos.filter((g) => g.saved).length;
	const missing = state.geckos.length - saved;

	useEffect(() => {
		if (outcome === "won" && stars !== undefined && finalTime !== undefined) {
			recordWin(level.id, stars, finalTime);
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

	return (
		<main className="screen screen-enter">
			<header className="hud">
				<button className="icon-button" onClick={onMenu} aria-label="Volver al menú">
					‹
				</button>
				<div className="hud-title">
					<span className="hud-level">Nivel {level.id}</span>
					<TierLabel tier={level.meta?.tier} />
				</div>
				<span className={`clock ${started && clock <= LOW_TIME_SECONDS ? "clock-low" : ""}`}>{formatClock(clock)}</span>
			</header>

			<p className="hint">{level.hint ?? (started ? " " : "El reloj empieza al tocar un lagarto.")}</p>

			<Board key={level.id} session={session} />

			<footer className="controls">
				<span className="counter">
					{saved}/{state.geckos.length}
				</span>
				<div className="control-group">
					<button className="ghost-button" onClick={() => session.undo()} disabled={!canUndo || outcome !== "playing"}>
						Deshacer
					</button>
					<button className="ghost-button" onClick={() => session.restart()}>
						Reiniciar
					</button>
					<button className="ghost-button" onClick={() => session.pause()} disabled={!started || outcome !== "playing"}>
						Pausa
					</button>
				</div>
			</footer>

			{outcome === "won" && (
				<EndPanel
					title={`Nivel ${level.id} completado`}
					actions={
						<>
							<button className="ghost-button" onClick={() => session.restart()}>
								Repetir
							</button>
							{hasNext ? (
								<button className="pill-button" onClick={onNext}>
									Siguiente
								</button>
							) : (
								<button className="pill-button" onClick={onMenu}>
									Menú
								</button>
							)}
						</>
					}
				>
					<StarRow earned={stars ?? 1} size="large" reveal />
					<p>{formatClock(finalTime ?? 0)} de {formatClock(level.timeLimit)}</p>
				</EndPanel>
			)}

			{outcome === "lost" && (
				<EndPanel
					title="Se acabó el tiempo"
					actions={
						<>
							<button className="ghost-button" onClick={onMenu}>
								Menú
							</button>
							<button className="pill-button" onClick={() => session.restart()}>
								Reintentar
							</button>
						</>
					}
				>
					<p>{missing === 1 ? "¡Casi! Faltaba 1 lagarto." : `Faltaban ${missing} lagartos.`}</p>
				</EndPanel>
			)}

			{paused && (
				<EndPanel
					title="Pausa"
					actions={
						<>
							<button className="ghost-button" onClick={onMenu}>
								Menú
							</button>
							<button className="pill-button" onClick={() => session.resume()}>
								Continuar
							</button>
						</>
					}
				>
					<p>{formatClock(timeLeft)} restantes</p>
				</EndPanel>
			)}
		</main>
	);
}
