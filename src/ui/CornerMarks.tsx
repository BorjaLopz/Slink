/** Blueprint registration crosses on the four corners of the parent (which must be `position: relative`). */
export function CornerMarks() {
	return (
		<span className="marks" aria-hidden="true">
			<span className="mark mark-tl" />
			<span className="mark mark-tr" />
			<span className="mark mark-bl" />
			<span className="mark mark-br" />
		</span>
	);
}
