import { CornerMarks } from "./CornerMarks";
import { ClockIcon } from "./icons";
import { formatClock } from "./useCountdown";

interface ClockProps {
	seconds: number;
	/** Warnings only make sense once the clock is running. */
	running: boolean;
}

/** Sheet thresholds: amber under 15 s, coral and beating under 5 s. */
const WARN_SECONDS = 15;
const DANGER_SECONDS = 5;

export function Clock({ seconds, running }: ClockProps) {
	const state = !running ? "" : seconds <= DANGER_SECONDS ? "clock-danger" : seconds <= WARN_SECONDS ? "clock-warn" : "";
	return (
		<span className={`clock framed ${state}`} role="timer" aria-label={`${formatClock(seconds)} restantes`}>
			<ClockIcon size={18} />
			{formatClock(seconds)}
			<CornerMarks />
		</span>
	);
}
