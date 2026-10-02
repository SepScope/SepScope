export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading anchor">
      <div className="mb-4 h-3 w-24 skeleton" />
      <div className="mb-2 h-6 w-48 skeleton" />
      <div className="mb-6 h-4 w-64 skeleton" />
      <div className="mb-6 h-16 skeleton" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-32 rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 h-4 w-2/3 skeleton" />
            <div className="h-3 w-1/3 skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}
