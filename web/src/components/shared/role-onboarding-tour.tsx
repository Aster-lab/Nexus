"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
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
      detail: "Your figures and statuses come from your account. Each section loads separately, so you can retry just the part that needs attention.",
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
      description: "After you accept an offer, the loan can move into funding and disbursement. Your loan page shows the repayment schedule and amounts paid so far.",
      detail: "You can make a partial repayment when an installment is due. NEXUS applies it to the oldest unpaid installment, interest first. Review the amount before you submit.",
      target: "borrower-loans",
      href: "/borrower/loans",
      linkLabel: "View loans",
    },
    {
      title: "History and receipts",
      description: "Use repayment history to review confirmed repayments and open available receipts.",
      detail: "A repayment is complete only after NEXUS confirms it. Wallet balances are simulated THB funds, not bank deposits.",
      target: "borrower-history",
      href: "/borrower/repayments",
      linkLabel: "Open repayment history",
    },
  ],
  INVESTOR: [
    {
      title: "Your simulated wallet",
      description: "Your wallet shows the simulated THB balance available to invest.",
      detail: "New wallets start at zero. An administrator can add simulated funds to your balance. NEXUS does not connect to a bank account.",
      target: "investor-wallet-summary",
      href: "/investor/wallet",
      linkLabel: "Open wallet",
    },
    {
      title: "Marketplace",
      description: "Browse loans that are open for funding and still have room for investment.",
      detail: "An approved application won't appear here right away. An administrator must issue an offer and the borrower must accept it first. The loan can then open for funding until its deadline.",
      target: "investor-marketplace",
      href: "/investor/marketplace",
      linkLabel: "Browse marketplace",
    },
    {
      title: "Review before investing",
      description: "Open an opportunity to review the terms and remaining capacity before deciding whether to invest.",
      detail: "NEXUS checks eligibility and your available balance when you submit. Returns are not guaranteed. This link opens the marketplace without making an investment.",
      target: "investor-marketplace",
      href: "/investor/marketplace",
      linkLabel: "Review opportunities",
    },
    {
      title: "Portfolio and allocations",
      description: "Your portfolio shows investments and repayment allocations associated with them.",
      detail: "Repayment allocations are tracked separately from your wallet. They become wallet credits only after the payout is complete.",
      target: "investor-portfolio",
      href: "/investor/portfolio",
      linkLabel: "View portfolio",
    },
    {
      title: "Payout history",
      description: "Payout history shows processing status and completed credits.",
      detail: "Check each payout's status and transaction details to see what has completed. All balances and transactions in NEXUS are simulated.",
      target: "investor-payouts",
      href: "/investor/payouts",
      linkLabel: "View payout history",
    },
    {
      title: "Wallet activity",
      description: "See the confirmed credits and debits that changed your simulated THB balance.",
      detail: "A payout adds funds to your wallet only when it is complete. Allocations and estimated returns are not spendable balance.",
      target: "investor-wallet-activity",
      href: "/investor/wallet",
      linkLabel: "Open wallet activity",
    },
  ],
  ADMIN: [
    {
      title: "Operations overview",
      description: "Use this dashboard to monitor users, applications, loans, payouts, repayments, and recent administrative activity.",
      detail: "Use these summaries to spot items that need attention, then open the underlying records before taking action.",
      target: "admin-summary",
    },
    {
      title: "Platform policies",
      description: "Review proposed platform rules, approve them, then activate the approved versions when ready.",
      detail: "A policy takes effect only after it has been approved and activated. Each change is recorded. Keep loan interest and repayment rates consistent; the current repayment policy uses 12%.",
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
      detail: "Disburse only after the loan is fully funded and the borrower has given consent. Each disbursement is recorded in the financial ledger.",
      target: "admin-loans",
      href: "/admin/loans",
      linkLabel: "Open loans",
    },
    {
      title: "Repayment monitoring",
      description: "Review repayments, their installment breakdowns, and receipt details.",
      detail: "NEXUS confirms the posted amount and installment allocation. Use the repayment record and receipt to verify the result.",
      target: "admin-repayments",
      href: "/admin/repayments",
      linkLabel: "Review repayments",
    },
    {
      title: "Investor payouts",
      description: "Review eligible allocations and process payouts when funds and account status allow.",
      detail: "An investor receives a wallet credit only after the payout and its ledger posting are complete. A pending allocation is not yet a payment.",
      target: "admin-payouts",
      href: "/admin/payouts",
      linkLabel: "Review payouts",
    },
    {
      title: "Financial reconciliation",
      description: "Run read-only checks across ledger entries, wallets, repayments, installments, and payouts.",
      detail: "This report flags discrepancies but never changes financial records. Investigate each issue and resolve it through the appropriate administrative process.",
      target: "admin-nav-financial",
      href: "/admin/financial",
      linkLabel: "Open reconciliation",
    },
    {
      title: "Users and audit history",
      description: "Review account status and inspect the audit trail for important administrative and financial actions.",
      detail: "Use the audit history to see who took an action, what changed, and when. NEXUS balances and transactions are simulated platform records.",
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
    {ready && open && userId ? createPortal(<aside
      aria-label={`${role === "BORROWER" ? "Borrower" : role === "INVESTOR" ? "Investor" : "Administrator"} interactive tour`}
      aria-live="polite"
      className="fixed left-1/2 top-1/2 z-[100] max-h-[min(86dvh,48rem)] w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
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
    </aside>, document.body) : null}
  </>;
}
