export function formatCurrency(amount: string | number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(Number(amount));
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(new Date(`${date}T00:00:00`));
}

export function formatDateTime(date: string | null) {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
