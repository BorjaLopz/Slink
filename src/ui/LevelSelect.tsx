import type { Level } from "../engine";
import { PACK_SIZE_UI, groupIntoPacks } from "./packs";
import { isUnlocked, nextLevelId, useProgress } from "../state/progress";
import { StarRow } from "./StarRow";
import { TierLabel } from "./TierLabel";

interface LevelSelectProps {
	levels: Level[];
	onPlay(levelId: number): void;
}

export function LevelSelect({ levels, onPlay }: LevelSelectProps) {
	const progress = useProgress();
	const beaten = levels.filter((l) => progress.stars[l.id] !== undefined).length;
	const totalStars = Object.values(progress.stars).reduce((sum, s) => sum + s, 0);
	const next = nextLevelId(progress, levels.map((l) => l.id));

	return (
		<main className="screen screen-enter menu">
			<header className="menu-header">
				<h1 className="menu-title">Slink</h1>
				<p className="menu-stats">
					{beaten}/{levels.length} niveles · {totalStars} ★
				</p>
				<button className="pill-button menu-play" onClick={() => onPlay(next)}>
					Jugar nivel {next}
				</button>
			</header>

			<div className="packs">
				{groupIntoPacks(levels).map((pack) => (
					<section key={pack.index} className="pack">
						<h2 className="pack-title">
							Pack {pack.index} <span>
								{(pack.index - 1) * PACK_SIZE_UI + 1}–{pack.levels[pack.levels.length - 1].id}
							</span>
						</h2>
						<div className="level-grid">
							{pack.levels.map((level) => {
								const unlocked = isUnlocked(progress, level.id);
								return (
									<button
										key={level.id}
										className={`level-card ${level.id === next ? "level-card-next" : ""}`}
										disabled={!unlocked}
										onClick={() => onPlay(level.id)}
										aria-label={`Nivel ${level.id}${unlocked ? "" : ", bloqueado"}`}
									>
										<span className="level-number">{level.id}</span>
										<TierLabel tier={level.meta?.tier} />
										{unlocked ? <StarRow earned={progress.stars[level.id] ?? 0} /> : <span className="level-locked">Bloqueado</span>}
									</button>
								);
							})}
						</div>
					</section>
				))}
			</div>
		</main>
	);
}
