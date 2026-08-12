import type { ReactNode } from "react";
import "./Card.css";

type CardProps = {
  /** Optional heading, rendered as the prototype's `.card h2`. */
  title?: string;
  /** Optional supporting line under the title. */
  subtitle?: string;
  children?: ReactNode;
  className?: string;
};

/** The app's basic surface: white panel, soft border, 16px radius. */
export function Card({ title, subtitle, children, className }: CardProps) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      {title ? <h2 className="card-title">{title}</h2> : null}
      {subtitle ? <p className="card-sub">{subtitle}</p> : null}
      {children}
    </section>
  );
}
