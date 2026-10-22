interface StarRowProps {
	earned: number;
	size?: "small" | "large";
	/** Pops the earned stars in one after another (win panel). */
	reveal?: boolean;
}

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";

export function StarRow({ earned, size = "small", reveal = false }: StarRowProps) {
	return (
		<span className={`stars stars-${size}`} aria-label={`${earned} de 3 estrellas`}>
			{[0, 1, 2].map((i) => (
				<svg
					key={i}
					viewBox="0 0 24 24"
					className={`star ${i < earned ? "star-on" : "star-off"} ${reveal && i < earned ? "star-reveal" : ""}`}
					style={reveal ? { animationDelay: `${120 + i * 140}ms` } : undefined}
					aria-hidden="true"
				>
					<path d={STAR_PATH} />
				</svg>
			))}
		</span>
	);
}
