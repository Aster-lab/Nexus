import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, CircleHelp, ShieldCheck } from "lucide-react";
import type { NexusRole } from "../../lib/client/auth-access";
import { buttonVariants } from "../ui/button";
import { cn } from "../../lib/utils";

type GuideStep = { title: string; description: string; href?: string; linkLabel?: string };

const GUIDES: Record<NexusRole, { title: string; intro: string; sections: { title: string; steps: GuideStep[] }[] }> = {
  BORROWER: {
    title: "Borrower user guide",
    intro: "A practical guide to applying for a loan, reviewing offers, and keeping up with repayments in NEXUS.",
    sections: [
      { title: "Get started", steps: [
        { title: "Complete your profile", description: "Keep your contact and borrower details current so the application team can review your information.", href: "/profile", linkLabel: "Open profile" },
        { title: "Check your wallet", description: "Your wallet shows simulated THB funds and activity. You can add simulated funds from the wallet; each top-up is limited to THB 50,000. This is separate from your loan balance and is not a bank deposit.", href: "/borrower/wallet", linkLabel: "View wallet" },
      ] },
      { title: "Apply and review an offer", steps: [
        { title: "Create an application", description: "Choose an amount, term, and purpose, then review the details before saving the application. You can return to a draft to continue editing it.", href: "/borrower/applications", linkLabel: "View applications" },
        { title: "Follow the review", description: "Check the application page for its current status and any decision or next step. An approval alone is not a loan offer." },
        { title: "Review and accept an offer", description: "Read the principal, interest rate, term, fee disclosure, and expiry before accepting. Funding can begin only after you accept an available offer.", href: "/borrower/offers", linkLabel: "View offers" },
      ] },
      { title: "Manage a loan", steps: [
        { title: "Review your loan and schedule", description: "The loan page shows the schedule and amounts recorded by NEXUS. Contact the administrator if a schedule or status appears incorrect.", href: "/borrower/loans", linkLabel: "View loans" },
        { title: "Make a repayment", description: "Check the current payable amount and due installments before continuing. NEXUS confirms the repayment only after it has been posted; if the result is uncertain, check history before retrying.", href: "/borrower/repayments/make", linkLabel: "Make a repayment" },
        { title: "Find repayment history and receipts", description: "Use repayment history to review confirmed repayments and open a receipt when one is available.", href: "/borrower/repayments", linkLabel: "Open repayment history" },
      ] },
    ],
  },
  INVESTOR: {
    title: "Investor user guide",
    intro: "Learn how to manage simulated funds, review funding opportunities, and track investments and payouts.",
    sections: [
      { title: "Get started", steps: [
        { title: "Complete your profile", description: "Review your account details and make sure your investor role is enabled.", href: "/profile", linkLabel: "Open profile" },
        { title: "Check your wallet", description: "Your wallet balance is simulated THB. You can add simulated funds in the wallet; each top-up is limited to THB 50,000. No real payment is made.", href: "/investor/wallet", linkLabel: "View wallet" },
      ] },
      { title: "Review and invest", steps: [
        { title: "Browse the marketplace", description: "Only loans currently open for funding with remaining capacity appear. An approved application does not appear until an offer is issued, accepted, and the loan is opened for funding.", href: "/investor/marketplace", linkLabel: "Browse marketplace" },
        { title: "Review before investing", description: "Read the loan terms and remaining capacity. NEXUS checks eligibility and available wallet funds when you submit. Investment returns are not guaranteed." },
        { title: "Use recommendations", description: "Set preferences to rank opportunities by how well they match. A match score is not a risk prediction, probability of repayment, or expected return.", href: "/investor/recommendations", linkLabel: "Open recommendations" },
      ] },
      { title: "Track your money", steps: [
        { title: "Review portfolio and allocations", description: "Your portfolio shows investments and repayment allocations. An allocation is not available wallet money until the payout is completed.", href: "/investor/portfolio", linkLabel: "View portfolio" },
        { title: "Check payouts and wallet activity", description: "Completed payouts appear as wallet credits. Review payout status and wallet transactions to see which funds have actually posted.", href: "/investor/payouts", linkLabel: "View payout history" },
      ] },
    ],
  },
  ADMIN: {
    title: "Administrator user guide",
    intro: "A quick reference for reviewing applications, managing offers, overseeing simulated finances, and keeping an audit trail.",
    sections: [
      { title: "Start with the platform setup", steps: [
        { title: "Review and activate policies", description: "Review proposed versions, approve them, then activate the approved versions when appropriate. Only active policies govern platform workflows.", href: "/admin/policies", linkLabel: "Manage policies" },
        { title: "Review accounts and simulated wallets", description: "Use user and wallet management to check account status and assign approved simulated opening balances. Wallet changes must be recorded through the ledger.", href: "/admin/users", linkLabel: "Manage users" },
      ] },
      { title: "Process borrower applications", steps: [
        { title: "Review an application", description: "Check the submitted application and record an approval or rejection with a clear reason. An approval is not a loan offer." , href: "/admin/applications", linkLabel: "Review applications" },
        { title: "Issue an offer", description: "From an eligible application’s detail page, issue an offer using the active policy terms. The borrower must accept the offer before the loan moves toward funding." },
        { title: "Monitor funding and disbursement", description: "Track funding progress. Disbursement is available only when the required funding and borrower consent conditions are met.", href: "/admin/loans", linkLabel: "View loans" },
      ] },
      { title: "Monitor financial operations", steps: [
        { title: "Review repayments and payouts", description: "Check repayment postings and allocations, then process investor payouts through the supported workflow. Do not edit financial records directly.", href: "/admin/repayments", linkLabel: "Review repayments" },
        { title: "Check reconciliation and the ledger", description: "Use the financial overview to review wallet, clearing, transaction, and reconciliation information. Investigate discrepancies before taking action.", href: "/admin/financial", linkLabel: "Open financial overview" },
        { title: "Review audit records", description: "Administrative and financial actions are recorded for review. Audit records are read-only.", href: "/admin/audit-logs", linkLabel: "Open audit logs" },
      ] },
    ],
  },
};

const ROLE_LABEL: Record<NexusRole, string> = { BORROWER: "Borrower", INVESTOR: "Investor", ADMIN: "Administrator" };

export function RoleUserGuide({ role }: { role: NexusRole }) {
  const guide = GUIDES[role];
  const home = role === "ADMIN" ? "/admin" : role === "BORROWER" ? "/borrower" : "/investor";

  return <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <Link href={home} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-6 -ml-3")}>
      <ArrowLeft className="size-4" aria-hidden="true" /> Back to {ROLE_LABEL[role].toLowerCase()} workspace
    </Link>

    <header className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-primary">
        <BookOpen className="size-4" aria-hidden="true" /> {ROLE_LABEL[role]} help
      </p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{guide.title}</h1>
      <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{guide.intro}</p>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <p>NEXUS uses simulated balances and records. The server confirms eligibility, financial amounts, and transaction results.</p>
      </div>
    </header>

    <div className="grid gap-6 lg:grid-cols-2">
      {guide.sections.map((section, index) => <section key={section.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-3 text-xl font-semibold">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
          {section.title}
        </h2>
        <ol className="mt-5 space-y-5">
          {section.steps.map((step) => <li key={step.title} className="border-l-2 border-border pl-4">
            <h3 className="font-semibold">{step.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
            {step.href && step.linkLabel ? <Link href={step.href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-2 h-auto px-0 py-1 text-primary hover:text-primary")}>
              {step.linkLabel} <ArrowRight className="size-4" aria-hidden="true" />
            </Link> : null}
          </li>)}
        </ol>
      </section>)}
    </div>

    <footer className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-3">
        <CircleHelp className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-sm leading-6 text-muted-foreground">Need help with a record or action? Contact your NEXUS administrator and include the relevant application, loan, or transaction reference.</p>
      </div>
      <Link href={home} className={buttonVariants({ variant: "outline" })}>Return to workspace</Link>
    </footer>
  </main>;
}
