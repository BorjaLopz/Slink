import { useEffect, useState } from "react";
import type { GameSession } from "../state/gameSession";

const REFRESH_MS = 200;

/** Seconds left on the session clock, refreshed a few times per second. */
export function useCountdown(session: GameSession): number {
	const [left, setLeft] = useState(() => session.timeLeft());
	useEffect(() => {
		const id = window.setInterval(() => setLeft(session.timeLeft()), REFRESH_MS);
		return () => window.clearInterval(id);
	}, [session]);
	return left;
}

export function formatClock(seconds: number): string {
	const whole = Math.ceil(seconds);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
