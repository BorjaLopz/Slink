import type { Stars } from "../state/gameSession";
import { CornerMarks } from "./CornerMarks";
import { StarRow } from "./StarRow";
import { formatClock } from "./useCountdown";

interface VictoryPanelProps {
	time: number;
	limit: number;
	stars: Stars;
	/** Best time before this win; undefined on the first win. */
	previousBest: number | undefined;
	hasNext: boolean;
	onNext(): void;
	onRetry(): void;
	onLevels(): void;
}

/** Bottom sheet over the dimmed board (sheet: "D · Victoria"). */
export function VictoryPanel({ time, limit, stars, previousBest, hasNext, onNext, onRetry, onLevels }: VictoryPanelProps) {
	const newRecord = previousBest !== undefined && time < previousBest;
	return (
		<div className="overlay overlay-bottom">
			<section className="sheet framed" role="dialog" aria-label="Nivel superado">
				<div className="sheet-head">
					<div>
						<p className="label">Nivel superado</p>
						<p className="sheet-time">{formatClock(time)}</p>
					</div>
					{newRecord && <span className="chip-record">Nuevo récord</span>}
				</div>
				<StarRow earned={stars} size="large" reveal />
				<dl className="sheet-stats">
					<div>
						<dt className="label">Límite</dt>
						<dd>{formatClock(limit)}</dd>
					</div>
					<div>
						<dt className="label">Récord anterior</dt>
						<dd>{previousBest === undefined ? "—" : formatClock(previousBest)}</dd>
					</div>
				</dl>
				<div className="sheet-actions">
					{hasNext && (
						<button className="btn btn-primary framed" onClick={onNext}>
							Siguiente nivel
							<CornerMarks />
						</button>
					)}
					<div className="btn-row">
						<button className="btn" onClick={onRetry}>
							Repetir
						</button>
						<button className="btn" onClick={onLevels}>
							Niveles
						</button>
					</div>
				</div>
				<CornerMarks />
			</section>
		</div>
	);
}
