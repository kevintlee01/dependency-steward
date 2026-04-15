import type { PropsWithChildren } from "react";

type BadgeTone = "neutral" | "good" | "warn" | "danger" | "info";

interface BadgeProps extends PropsWithChildren {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return <span className={`ds-badge ds-badge--${tone}`}>{children}</span>;
}