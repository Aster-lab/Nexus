import { Info } from "lucide-react";

export function DemoEnvironmentBanner() {
  return (
    <aside
      role="note"
      aria-label="Demo environment notice"
      className="flex items-start gap-3 border-b border-sky-300/50 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100 sm:items-center sm:px-6"
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 sm:mt-0" />
      <p><strong>Demo environment.</strong> All balances, investments, and transactions here are simulated.</p>
    </aside>
  );
}
