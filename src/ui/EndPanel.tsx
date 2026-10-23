import type { ReactNode } from "react";
import { CornerMarks } from "./CornerMarks";

interface EndPanelProps {
	label: string;
	title: string;
	children?: ReactNode;
	actions: ReactNode;
}

/** Floating panel over the board for pause and time-out. */
export function EndPanel({ label, title, children, actions }: EndPanelProps) {
	return (
		<div className="overlay">
			<section className="panel framed" role="dialog" aria-label={title}>
				<p className="label">{label}</p>
				<h2 className="panel-title">{title}</h2>
				{children}
				<div className="sheet-actions">{actions}</div>
				<CornerMarks />
			</section>
		</div>
	);
}
