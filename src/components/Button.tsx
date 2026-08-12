import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "dark" | "ghost";
  size?: "md" | "sm";
};

/**
 * The app's button. `primary` is the teal call-to-action, `dark` the ink
 * button used for "proceed" style actions, `ghost` the bordered white one.
 *
 * Defaults to `type="button"`: an unspecified button inside a form submits it,
 * which in a bookkeeping form means an accidental post.
 */
export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : null, className]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes} {...rest} />;
}
