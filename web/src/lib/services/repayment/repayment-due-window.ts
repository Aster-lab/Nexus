/**
 * Repayments may cover installments due up to one calendar month ahead.
 * The cutoff is a UTC calendar date, matching the schedule's date semantics.
 */
export function getRepaymentPayableThroughDate(now = new Date()): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)));
}
