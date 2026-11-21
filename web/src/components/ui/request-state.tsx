import Link from "next/link";
import { useId } from "react";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="nexus-request-state nexus-request-state--loading" role="status" aria-live="polite" aria-busy="true">
      <span className="nexus-request-state__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "We could not load this information",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <section className="nexus-request-state nexus-request-state--error" role="alert">
      <h2 className="nexus-request-state__title">{title}</h2>
      <p className="nexus-request-state__description">{message}</p>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  const titleId = useId();
  return (
    <section className="nexus-request-state nexus-request-state--empty" aria-labelledby={titleId}>
      <h2 className="nexus-request-state__title" id={titleId}>{title}</h2>
      <p className="nexus-request-state__description">{description}</p>
      {action ? <Link className="nexus-request-state__action" href={action.href}>{action.label}</Link> : null}
    </section>
  );
}

export function UnavailableState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="nexus-request-state nexus-request-state--unavailable" data-state="unavailable" role="status" aria-live="polite">
      <h2 className="nexus-request-state__title">{title}</h2>
      <p className="nexus-request-state__description">{description}</p>
    </section>
  );
}
