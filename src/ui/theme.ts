import type { GeckoColor } from "../engine";

/**
 * Board palette from the design sheet ("Diseño juego Gecko Out"): a technical blueprint where the
 * geckos are the only solid, saturated pieces. Keep in sync with the CSS tokens in styles.css.
 */
export const BOARD_THEME: Record<string, string> = {
	board: "#111b25",
	grid: "#22374b",
	pit: "#070d13",
	rock: "#2b4561",
	rockEdge: "#56799e",
	rockHatch: "#1f344a",
	leaf: "#152536",
	leafEdge: "#94bce3",
	eyeWhite: "#f4f6f8",
	eyePupil: "#070d13",
	grabRing: "#e7e7ea",
	lock: "#e7e7ea",
	shadow: "rgba(0, 0, 0, 0.45)",
	shadowLifted: "rgba(0, 0, 0, 0.55)",
};

export interface GeckoPalette {
	body: string;
	/** Outline and legs: the dark band under each swatch in the sheet. */
	outline: string;
	spine: string;
}

/**
 * The sheet defines acero, papel, ámbar and coral; the other four extend it with the same lightness
 * and saturation so up to eight geckos stay apart at a glance. Ids are the level-data colors.
 */
export const GECKO_COLORS: Record<GeckoColor, GeckoPalette> = {
	blue: { body: "#94bce3", outline: "#3f6187", spine: "#c6dcf2" },
	orange: { body: "#e7e7ea", outline: "#5e5e62", spine: "#ffffff" },
	yellow: { body: "#e3a948", outline: "#7f5214", spine: "#f0cd8c" },
	red: { body: "#e2735d", outline: "#852f22", spine: "#efa595" },
	green: { body: "#7fcf9b", outline: "#2e6b45", spine: "#b7e7c7" },
	purple: { body: "#b49cf0", outline: "#4f3d8f", spine: "#d6c9f8" },
	pink: { body: "#f08fc3", outline: "#873462", spine: "#f7c2de" },
	cyan: { body: "#4fc4c9", outline: "#1b5f63", spine: "#9adfe2" },
};
