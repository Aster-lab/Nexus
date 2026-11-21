const SATANG_INTEGER = /^-?\d+$/;

/** Formats integer satang without converting the amount through floating point. */
export function formatSatang(value: string, currency = "THB"): string {
  if (!SATANG_INTEGER.test(value)) return "—";
  try {
    const amount = BigInt(value);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const whole = new Intl.NumberFormat("en-US").format(absolute / 100n);
    const fraction = (absolute % 100n).toString().padStart(2, "0");
    return `${negative ? "-" : ""}${currency === "THB" ? "฿" : `${currency} `}${whole}.${fraction}`;
  } catch { return "—"; }
}

export function formatFinancialStatus(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
