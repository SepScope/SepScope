import { HEALTH_LABEL, type Health } from "@/lib/format";

const COLOR: Record<Health, string> = {
  healthy: "bg-ok",
  degraded: "bg-warn",
  down: "bg-fail",
  unknown: "bg-skip",
};

export function StatusDot({ health }: { health: Health }) {
  return (
    <span
      role="img"
      aria-label={HEALTH_LABEL[health]}
      title={HEALTH_LABEL[health]}
      className={`inline-block size-2.5 shrink-0 rounded-full ${COLOR[health]}`}
    />
  );
}
