import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { buttonClass, type ButtonVariant } from "./Button.tsx";

/** The desk every rebuilt screen sits on: background, text color and body font. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="ui-page">{children}</div>;
}

/** A message on the page about what just happened. `bad` is announced at once; the rest politely. */
export function Notice({ kind = "warn", children }: { kind?: "warn" | "bad" | "good" | "info"; children: ReactNode }) {
  return (
    <p className={`ui-notice ui-notice--${kind}`} role={kind === "bad" ? "alert" : "status"}>
      {children}
    </p>
  );
}

/** A small filled label for a state, e.g. "Connected". Not interactive. */
export function Pill({ kind, children }: { kind?: "good" | "warn" | "bad"; children: ReactNode }) {
  return <span className={kind ? `ui-pill ui-pill--${kind}` : "ui-pill"}>{children}</span>;
}

/** A grey bar standing in for content that is loading. Pair it with a screen-reader status text. */
export function Skeleton({ width, height }: { width?: string; height?: string }) {
  return <div className="ui-skeleton" style={{ width, height }} aria-hidden="true" />;
}

type ButtonLinkProps = { variant?: ButtonVariant; size?: "md" | "sm"; children: ReactNode };

/** A link to another screen that looks like a button. */
export function ButtonLink({ variant, size, children, ...rest }: ButtonLinkProps & Omit<LinkProps, "className">) {
  return (
    <Link {...rest} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

/** A link to a file or another site that looks like a button. */
export function ButtonAnchor({ variant, size, children, ...rest }: ButtonLinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className">) {
  return (
    <a {...rest} className={buttonClass(variant, size)}>
      {children}
    </a>
  );
}
