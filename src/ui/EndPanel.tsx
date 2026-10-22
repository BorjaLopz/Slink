import type { ReactNode } from "react";

interface EndPanelProps {
	title: string;
	children?: ReactNode;
	actions: ReactNode;
}

/** Centered floating panel over the board (win, lose, pause). */
export function EndPanel({ title, children, actions }: EndPanelProps) {
	return (
		<div className="overlay">
			<div className="panel" role="dialog" aria-label={title}>
				<h2>{title}</h2>
				{children}
				<div className="panel-actions">{actions}</div>
			</div>
		</div>
	);
}
