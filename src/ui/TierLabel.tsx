import type { DifficultyTier } from "../engine";

const TIER_TEXT: Record<DifficultyTier, string | undefined> = {
	0: undefined,
	1: "Medio",
	2: "Difícil",
	3: "Muy difícil",
};

interface TierLabelProps {
	tier: DifficultyTier | undefined;
}

/** Easy levels show nothing on purpose: only the ones worth bracing for get a label. */
export function TierLabel({ tier }: TierLabelProps) {
	const text = tier === undefined ? undefined : TIER_TEXT[tier];
	if (!text) {
		return null;
	}
	return (
		<span className={`tier tier-${tier}`}>
			<span className="tier-dot" aria-hidden="true" />
			{text}
		</span>
	);
}
