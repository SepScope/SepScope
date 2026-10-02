import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <EmptyState title="Page not found">
      <Link href="/" className="text-accent hover:underline">
        Back to all anchors
      </Link>
    </EmptyState>
  );
}
