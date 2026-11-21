export function WorkspacePlaceholder({ title, description }: { title: string; description: string }) {
  return <section className="nexus-page-container nexus-workspace-card">
    <p className="nexus-eyebrow">NEXUS workspace</p>
    <h1>{title}</h1>
    <p>{description}</p>
    <p className="nexus-workspace-card__note">Your account and role are verified for this area. Detailed workflow screens are being added in the next frontend phase.</p>
  </section>;
}
