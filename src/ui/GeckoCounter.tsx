import type { Gecko } from "../engine";
import { GECKO_COLORS } from "./theme";

interface GeckoCounterProps {
	geckos: Gecko[];
}

/** "GECKOS 1/3" plus one swatch per gecko in its color, filled once it is home. */
export function GeckoCounter({ geckos }: GeckoCounterProps) {
	const saved = geckos.filter((g) => g.saved).length;
	return (
		<div className="gecko-counter">
			<span className="label">
				Geckos {saved}/{geckos.length}
			</span>
			<span className="swatches" aria-hidden="true">
				{geckos.map((g) => (
					<span
						key={g.id}
						className="swatch"
						style={{ borderColor: GECKO_COLORS[g.color].body, background: g.saved ? GECKO_COLORS[g.color].body : "transparent" }}
					/>
				))}
			</span>
		</div>
	);
}
