import type { CheckStatus } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/format";

const STYLE: Record<CheckStatus, string> = {
  pass: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  fail: "bg-fail-soft text-fail",
  skipped: "bg-skip-soft text-skip",
};

const ICON: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✕", skipped: "–" };

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STYLE[status]}`}>
      <span aria-hidden="true">{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
