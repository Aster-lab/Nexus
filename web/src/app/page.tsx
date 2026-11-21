import Link from "next/link";

export default function HomePage() {
  return <section className="nexus-hero nexus-page-container">
    <p className="nexus-eyebrow">Financial stability</p>
    <h1>Move forward with clarity.</h1>
    <p>Manage borrowing and investing through a secure financial platform with clear records at every step.</p>
    <div className="nexus-hero__actions">
      <Link className="nexus-button nexus-button--primary" href="/login">Sign in to NEXUS</Link>
      <Link className="nexus-button nexus-button--secondary" href="/register">Create an account</Link>
    </div>
    <p className="nexus-hero__note">Accounts are provided by NEXUS. New account registration is not available online.</p>
  </section>;
}
