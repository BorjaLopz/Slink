import type { GameSession } from "../state/gameSession";
import { useBoardCanvas } from "./useBoardCanvas";

interface BoardProps {
	session: GameSession;
}

export function Board({ session }: BoardProps) {
	const { containerRef, canvasRef, onPointerDown, onPointerMove, onPointerUp } = useBoardCanvas(session);
	return (
		<div ref={containerRef} className="board">
			<canvas
				ref={canvasRef}
				className="board-canvas"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			/>
		</div>
	);
}
