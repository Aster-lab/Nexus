export function getRepaymentPayableThroughDate(now = new Date()): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)));
}
