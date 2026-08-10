import { humanize } from "../format";

const statusStyles: Record<string, string> = {
  archived: "border-zinc-700 bg-zinc-900 text-zinc-300",
  cancelled: "border-red-900/70 bg-red-950/40 text-red-300",
  completed: "border-sky-900/70 bg-sky-950/40 text-sky-300",
  confirmed: "border-emerald-900/70 bg-emerald-950/40 text-emerald-300",
  draft: "border-amber-900/70 bg-amber-950/40 text-amber-300",
  maintenance: "border-amber-900/70 bg-amber-950/40 text-amber-300",
  operational: "border-emerald-900/70 bg-emerald-950/40 text-emerald-300",
  out_of_service: "border-red-900/70 bg-red-950/40 text-red-300",
  pending: "border-amber-900/70 bg-amber-950/40 text-amber-300",
  published: "border-emerald-900/70 bg-emerald-950/40 text-emerald-300",
  retired: "border-zinc-700 bg-zinc-900 text-zinc-300",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
        statusStyles[status] ?? "border-border bg-background text-muted"
      }`}
    >
      {humanize(status)}
    </span>
  );
}
