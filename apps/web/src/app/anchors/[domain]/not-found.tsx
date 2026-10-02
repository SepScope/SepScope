import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

export default function AnchorNotFound() {
  return (
    <EmptyState title="Anchor not found">
      <p>SEPscope does not monitor this domain.</p>
      <Link href="/" className="mt-2 inline-block text-accent hover:underline">
        Back to all anchors
      </Link>
    </EmptyState>
  );
}
