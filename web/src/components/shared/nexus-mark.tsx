export function NexusMark({ className = "", size = 28 }: { className?: string; size?: number }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
    <path d="M12 12 20 20 28 12M12 28 20 20 28 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="11" cy="11" r="6" fill="#0A3C6E" stroke="currentColor" strokeWidth="2" />
    <circle cx="29" cy="11" r="6" fill="#1783C1" stroke="currentColor" strokeWidth="2" />
    <circle cx="11" cy="29" r="6" fill="#1783C1" stroke="currentColor" strokeWidth="2" />
    <circle cx="29" cy="29" r="6" fill="#333333" stroke="currentColor" strokeWidth="2" />
    <circle cx="20" cy="20" r="4" fill="currentColor" />
  </svg>;
}
