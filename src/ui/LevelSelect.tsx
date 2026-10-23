import type { Level } from "../engine";
import { isUnlocked, nextLevelId, useProgress } from "../state/progress";
import { BoardPreview } from "./BoardPreview";
import { CornerMarks } from "./CornerMarks";
import { BackIcon, CheckIcon, LockIcon } from "./icons";
import { levelNumber, levelTitle } from "./levelText";
import { PACK_SIZE_UI, groupIntoPacks } from "./packs";
import { StarRow } from "./StarRow";
import { formatClock } from "./useCountdown";

interface LevelSelectProps {
	levels: Level[];
	onPlay(levelId: number): void;
	onBack(): void;
}

const THUMB_WIDTH = 72;

export function LevelSelect({ levels, onPlay, onBack }: LevelSelectProps) {
	const progress = useProgress();
	const beaten = levels.filter((l) => progress.stars[l.id] !== undefined).length;
	const next = nextLevelId(progress, levels.map((l) => l.id));

	return (
		<main className="screen screen-enter levels">
			<header className="topbar">
				<button className="icon-btn" onClick={onBack} aria-label="Volver">
					<BackIcon />
				</button>
				<h1 className="topbar-title">Niveles</h1>
				<span className="topbar-count">
					{beaten}/{levels.length}
				</span>
			</header>

			<div className="level-list">
				{groupIntoPacks(levels).map((pack) => (
					<section key={pack.index} className="pack">
						<h2 className="label pack-title">
							Pack {pack.index} · {(pack.index - 1) * PACK_SIZE_UI + 1}–{pack.levels[pack.levels.length - 1].id}
						</h2>
						{pack.levels.map((level) => {
							const unlocked = isUnlocked(progress, level.id);
							const stars = progress.stars[level.id];
							const best = progress.bestTimes[level.id];
							const current = level.id === next;
							return (
								<button
									key={level.id}
									className={`level-row ${current ? "level-row-current framed" : ""}`}
									disabled={!unlocked}
									onClick={() => onPlay(level.id)}
									aria-label={`Nivel ${level.id}, ${levelTitle(level)}${unlocked ? "" : ", bloqueado"}`}
								>
									<span className="level-thumb">
										<BoardPreview level={level} width={THUMB_WIDTH} />
									</span>
									<span className="level-info">
										<span className="level-number">{levelNumber(level.id)}</span>
										<span className="level-name">{levelTitle(level)}</span>
										{level.tutorial && level.hint && <span className="level-hint">{level.hint}</span>}
									</span>
									<span className="level-status">
										{!unlocked && <LockIcon />}
										{unlocked && stars !== undefined && (
											<>
												<CheckIcon />
												{best !== undefined && <span className="level-time">{formatClock(best)}</span>}
												<StarRow earned={stars} />
											</>
										)}
										{unlocked && stars === undefined && <span className="level-play">Jugar</span>}
									</span>
									{current && <CornerMarks />}
								</button>
							);
						})}
					</section>
				))}
			</div>
		</main>
	);
}
