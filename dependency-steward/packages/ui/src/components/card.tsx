import type { PropsWithChildren, ReactNode } from "react";

interface CardProps extends PropsWithChildren {
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function Card({ eyebrow, title, subtitle, className, children }: CardProps) {
  return (
    <section className={["ds-card", className].filter(Boolean).join(" ")}>
      {(eyebrow || title || subtitle) && (
        <header className="ds-card__header">
          {eyebrow ? <p className="ds-card__eyebrow">{eyebrow}</p> : null}
          {title ? <h3 className="ds-card__title">{title}</h3> : null}
          {subtitle ? <p className="ds-card__subtitle">{subtitle}</p> : null}
        </header>
      )}
      <div className="ds-card__body">{children}</div>
    </section>
  );
}