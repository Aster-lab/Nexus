export default function Loading() {
  return (
    <main className="nexus-route-loading" aria-busy="true" aria-label="Loading page">
      <div className="nexus-route-loading__heading" aria-hidden="true">
        <span className="nexus-route-loading__line nexus-route-loading__line--short" />
        <span className="nexus-route-loading__line nexus-route-loading__line--title" />
        <span className="nexus-route-loading__line nexus-route-loading__line--wide" />
      </div>
      <div className="nexus-route-loading__cards" aria-hidden="true">
        {[0, 1, 2].map((item) => <div className="nexus-route-loading__card" key={item} />)}
      </div>
      <p role="status">Loading your workspace…</p>
    </main>
  );
}
