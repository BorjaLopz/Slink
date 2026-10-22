import type { GeckoColor } from "../engine";

export const BOARD_THEME: Record<string, string> = {
	board: "#0F1011",
	cellDot: "#1C1E21",
	wall: "#23252A",
	holeInner: "#040505",
	eyeWhite: "#F4F5F6",
	eyePupil: "#08090A",
	grabRing: "#FFFFFF",
};

interface GeckoPalette {
	body: string;
	outline: string;
	spine: string;
}

export const GECKO_COLORS: Record<GeckoColor, GeckoPalette> = {
	green: { body: "#4CC38A", outline: "#1F5A3E", spine: "#7FDCB0" },
	blue: { body: "#4EA7FC", outline: "#1D4A78", spine: "#8CC6FD" },
	red: { body: "#EB5757", outline: "#6E2222", spine: "#F38E8E" },
	yellow: { body: "#F2C94C", outline: "#6E5717", spine: "#F7DE8E" },
	purple: { body: "#9B8AFB", outline: "#43398A", spine: "#C1B6FD" },
	orange: { body: "#F2994A", outline: "#6F3E14", spine: "#F7BF8C" },
	pink: { body: "#F79CE0", outline: "#7A3767", spine: "#FAC4EC" },
	cyan: { body: "#5BC7D4", outline: "#1F5A61", spine: "#96DDE5" },
};
