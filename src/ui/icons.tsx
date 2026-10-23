import type { ReactNode } from "react";

interface IconProps {
	size?: number;
}

function Svg({ size = 20, children }: IconProps & { children: ReactNode }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			{children}
		</svg>
	);
}

export function BackIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M14.5 6.5 9 12l5.5 5.5" />
		</Svg>
	);
}

export function UndoIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M9 7 5 11l4 4" />
			<path d="M5 11h9a5 5 0 0 1 0 10h-2" />
		</Svg>
	);
}

export function RestartIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
			<path d="M4.5 4.5v4h4" />
		</Svg>
	);
}

export function PauseIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="7" y="5.5" width="3.2" height="13" rx="0.6" />
			<rect x="13.8" y="5.5" width="3.2" height="13" rx="0.6" />
		</Svg>
	);
}

export function ClockIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="12" cy="12" r="8" />
			<path d="M12 7.5V12l3 2" />
		</Svg>
	);
}

export function CheckIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="m5.5 12.5 4 4 9-9" />
		</Svg>
	);
}

export function LockIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="6" y="11" width="12" height="8.5" rx="1" />
			<path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" />
		</Svg>
	);
}

export function PlayIcon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M8 5.5v13l10-6.5z" />
		</Svg>
	);
}
