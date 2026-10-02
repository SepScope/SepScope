"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-line bg-surface px-6 py-10 text-center">
      <p className="text-sm font-medium">Could not load results</p>
      <p className="mx-auto mt-1 max-w-md text-sm break-words text-muted">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        Try again
      </button>
    </div>
  );
}
