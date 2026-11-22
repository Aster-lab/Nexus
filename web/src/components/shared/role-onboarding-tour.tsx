"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "../ui/button";

type TourRole = "BORROWER" | "INVESTOR" | "ADMIN";
type TourStep = { title: string; description: string; detail: string; target: string; href?: string; linkLabel?: string };
type TourProgress = { complete: boolean; stepIndex: number };

const TOUR_STEPS: Record<TourRole, TourStep[]> = {
  BORROWER: [
    {
      title: "Your dashboard",
      description: "This is your overview for applications, offers, active loans, and repayments.",
      detail: "Figures and statuses come from NEXUS records. A section can load independently, so use its retry action if it is temporarily unavailable.",
      target: "borrower-summary",
    },
    {
      title: "Applications",
      description: "Create an application, save it as a draft, review the details, and submit it when ready.",
      detail: "The review team updates the application status. Approval is not a loan or a funding commitment by itself.",
      target: "borrower-applications",
      href: "/borrower/applications",
      linkLabel: "Open applications",
    },
    {
      title: "Offers",
      description: "After approval, an administrator may issue an offer for you to review.",
      detail: "Check the principal, rate, term, fee disclosure, and expiry. The loan enters the investor marketplace only after you accept an available offer.",
      target: "borrower-offers",
      href: "/borrower/offers",
      linkLabel: "Review offers",
    },
    {
      title: "Loans and repayments",
      description: "Accepted offers can proceed to funding and disbursement. Your loan page shows the backend schedule and amounts already paid.",
      detail: "Partial repayment is supported when payable. NEXUS checks the current payable amount and applies repayments to the oldest outstanding installment, interest first. Review the confirmation before submitting.",
      target: "borrower-loans",
      href: "/borrower/loans",
      linkLabel: "View loans",
    },
    {
      title: "History and receipts",
      description: "Use repayment history to review confirmed repayments and open available receipts.",
      detail: "A repayment is successful only after NEXUS confirms the posted transaction. Wallet balances are simulated THB records, not bank deposits.",
      target: "borrower-history",
      href: "/borrower/repayments",
      linkLabel: "Open repayment history",
    },
  ],
  INVESTOR: [
    {
      title: "Your simulated wallet",
      description: "Your wallet displays the THB balance recorded for your investor account.",
      detail: "New accounts start at zero. An administrator assigns simulated initial funds through a ledger posting; NEXUS does not connect to a bank account.",
      target: "investor-wallet-summary",
      href: "/investor/wallet",
      linkLabel: "Open wallet",
    },
    {
      title: "Marketplace",
      description: "Review loans that are currently open for funding and have remaining capacity.",
      detail: "An approved borrower application is not listed yet. An administrator issues an offer, then the borrower accepts it; the resulting funding loan can appear here before its funding deadline.",
      target: "investor-marketplace",
      href: "/investor/marketplace",
      linkLabel: "Browse marketplace",
    },
    {
      title: "Review before investing",
      description: "Open an opportunity to review the terms and remaining capacity before deciding whether to invest.",
      detail: "The backend rechecks eligibility and available funds when you submit. Returns are not guaranteed. The tour will take you to the read-only marketplace; it will not submit an investment.",
      target: "investor-marketplace",
      href: "/investor/marketplace",
      linkLabel: "Review opportunities",
    },
    {
      title: "Portfolio and allocations",
      description: "Your portfolio shows investments and repayment allocations associated with them.",
      detail: "An allocation is not yet a wallet credit. The payout process must complete before the investor wallet receives the credit.",
      target: "investor-portfolio",
      href: "/investor/portfolio",
      linkLabel: "View portfolio",
    },
    {
      title: "Payout history",
      description: "Payout history shows processing status and completed credits.",
      detail: "Use persisted transaction and payout details to understand what has completed. All balances and transactions in this MVP are simulated.",
      target: "investor-payouts",
      href: "/investor/payouts",
      linkLabel: "View payout history",
    },
    {
      title: "Wallet activity",
      description: "Wallet activity lists posted credits and debits for your simulated THB balance.",
      detail: "Only a completed payout becomes a wallet credit. Allocations and estimated returns are not available balance.",
      target: "investor-wallet-activity",
      href: "/investor/wallet",
      linkLabel: "Open wallet activity",
    },
  ],
  ADMIN: [
    {
      title: "Operations overview",
      description: "Use this dashboard to monitor users, applications, loans, payouts, repayments, and recent administrative activity.",
      detail: "Each section loads from an authorized backend API. A dashboard count is an operational summary, not a replacement for reviewing the underlying records.",
      target: "admin-summary",
    },
    {
      title: "Platform policies",
      description: "Review proposed platform rules, approve them, then activate the approved versions when ready.",
      detail: "Approval alone does not make a policy effective. Activations are audited. Keep the loan interest and repayment rates consistent; the current repayment policy uses 12%.",
      target: "admin-nav-policies",
      href: "/admin/policies",
      linkLabel: "Review policies",
    },
    {
      title: "Application review",
      description: "Inspect submitted borrower applications and record an approved or rejected decision with a reason.",
      detail: "An approval is not a loan offer. After approval, issue an offer from the application details page; the borrower must accept it before a funding loan is created.",
      target: "admin-applications",
      href: "/admin/applications",
      linkLabel: "Open applications",
    },
    {
      title: "Loans and disbursement",
      description: "Monitor funding progress and inspect loan details and repayment schedules.",
      detail: "Disburse only after funding and borrower consent requirements are met. Disbursement is a confirmed financial action and is recorded through the ledger workflow.",
      target: "admin-loans",
      href: "/admin/loans",
      linkLabel: "Open loans",
    },
    {
      title: "Repayment monitoring",
      description: "Review persisted repayment records and their installment breakdowns.",
      detail: "The backend determines posted repayment amounts and allocations. Use the records and receipt details to confirm outcomes.",
      target: "admin-repayments",
      href: "/admin/repayments",
      linkLabel: "Review repayments",
    },
    {
      title: "Investor payouts",
      description: "Review eligible allocations and process payouts when their backend status and clearing balance permit it.",
      detail: "A completed payout credits an investor wallet only after its ledger posting succeeds. Review the confirmation and resulting status; do not treat a pending allocation as a completed credit.",
      target: "admin-payouts",
      href: "/admin/payouts",
      linkLabel: "Review payouts",
    },
    {
      title: "Financial reconciliation",
      description: "Run read-only checks across ledger entries, wallets, repayments, installments, and payouts.",
      detail: "The reconciliation report identifies discrepancies; it never repairs financial records. Investigate and resolve issues through supported workflows.",
      target: "admin-nav-financial",
      href: "/admin/financial",
      linkLabel: "Open reconciliation",
    },
    {
      title: "Users and audit history",
      description: "Review account status and inspect the audit trail for important administrative and financial actions.",
      detail: "Audit history is append-only. Use it to verify who performed an action and what resource changed. NEXUS balances and transactions are simulated platform records.",
      target: "admin-audit-logs",
      href: "/admin/audit-logs",
      linkLabel: "Open audit logs",
    },
  ],
};

function storageKey(userId: string, role: TourRole) {
  return `nexus:onboarding:v1:${userId}:${role.toLowerCase()}`;
}

function readProgress(userId: string, role: TourRole): TourProgress {
  try {
    const value = window.localStorage.getItem(storageKey(userId, role));
    if (value === "complete") return { complete: true, stepIndex: 0 };
    if (!value) return { complete: false, stepIndex: 0 };
    const progress = JSON.parse(value) as Partial<TourProgress>;
    return {
      complete: progress.complete === true,
      stepIndex: Number.isInteger(progress.stepIndex) ? Math.max(0, progress.stepIndex as number) : 0,
    };
  } catch {
    return { complete: false, stepIndex: 0 };
  }
}

function saveProgress(userId: string, role: TourRole, progress: TourProgress) {
  try {
    window.localStorage.setItem(storageKey(userId, role), JSON.stringify(progress));
  } catch {
    // The guide remains usable for this session when storage is unavailable.
  }
}

export function RoleOnboardingTour({ userId, role }: { userId: string | null; role: TourRole }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = TOUR_STEPS[role];
  const currentStep = steps[stepIndex];

  useEffect(() => {
    if (!userId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const progress = readProgress(userId, role);
      setStepIndex(Math.min(progress.stepIndex, steps.length - 1));
      setCompleted(progress.complete);
      setReady(true);
      setOpen(!progress.complete);
    });
    return () => { active = false; };
  }, [role, steps.length, userId]);

  useEffect(() => {
    if (!open) return;
    let target: HTMLElement | null = null;
    const frame = window.requestAnimationFrame(() => {
      target = document.querySelector<HTMLElement>(`[data-tour-target="${currentStep.target}"]`);
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      target?.scrollIntoView({ behavior, block: "start" });
      target?.setAttribute("data-tour-highlighted", "true");
    });
    return () => {
      window.cancelAnimationFrame(frame);
      target?.removeAttribute("data-tour-highlighted");
    };
  }, [currentStep.target, open]);

  function startTour() {
    if (!userId) return;
    const nextIndex = completed ? 0 : stepIndex;
    setStepIndex(nextIndex);
    setOpen(true);
    setCompleted(false);
    saveProgress(userId, role, { complete: false, stepIndex: nextIndex });
  }

  function goToStep(nextIndex: number) {
    if (!userId) return;
    const boundedIndex = Math.max(0, Math.min(steps.length - 1, nextIndex));
    setStepIndex(boundedIndex);
    saveProgress(userId, role, { complete: false, stepIndex: boundedIndex });
  }

  function finishTour() {
    if (userId) saveProgress(userId, role, { complete: true, stepIndex: 0 });
    setCompleted(true);
    setOpen(false);
  }

  function pauseTour() {
    if (userId) saveProgress(userId, role, { complete: false, stepIndex });
    setOpen(false);
  }

  return <>
    {userId ? <Button type="button" variant="outline" size="sm" onClick={startTour}>
      <BookOpen className="size-4" aria-hidden="true" /> {completed || stepIndex === 0 ? "Take the tour" : "Resume tour"}
    </Button> : null}
    {ready && open && userId ? <aside
      aria-label={`${role === "BORROWER" ? "Borrower" : role === "INVESTOR" ? "Investor" : "Administrator"} interactive tour`}
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[48vh] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-h-[min(75vh,38rem)] sm:w-[min(36rem,calc(100vw-3rem))]"
    >
      <section className="grid gap-4 p-4 sm:gap-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{role === "BORROWER" ? "Borrower guide" : role === "INVESTOR" ? "Investor guide" : "Administrator guide"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Step {stepIndex + 1} of {steps.length} · Highlighted section on your dashboard</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={pauseTour}>Pause tour</Button>
        </header>

        <div className="grid gap-2">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{currentStep.title}</h2>
          <p className="text-sm leading-6 sm:text-base sm:leading-7">{currentStep.description}</p>
          <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm leading-6 text-muted-foreground sm:p-4">{currentStep.detail}</p>
        </div>

        <div className="flex gap-1.5" aria-hidden="true">
          {steps.map((item, index) => <span key={item.title} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-primary" : "bg-muted"}`} />)}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 sm:gap-3 sm:pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0}>
            <ChevronLeft className="size-4" aria-hidden="true" /> Back
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {currentStep.href && currentStep.linkLabel ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={currentStep.href}>
              {currentStep.linkLabel} <ArrowRight className="size-4" aria-hidden="true" />
            </Link> : null}
            {stepIndex < steps.length - 1
              ? <Button type="button" size="sm" onClick={() => goToStep(stepIndex + 1)}>Next <ChevronRight className="size-4" aria-hidden="true" /></Button>
              : <Button type="button" size="sm" onClick={finishTour}><Check className="size-4" aria-hidden="true" /> Finish tour</Button>}
          </div>
        </footer>
      </section>
    </aside> : null}
  </>;
}
