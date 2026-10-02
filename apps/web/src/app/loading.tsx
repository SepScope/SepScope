export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading anchors">
      <div className="mb-4 h-7 w-28 skeleton" />
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="h-9 bg-surface-2" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-line px-4 py-3">
            <div className="size-2.5 rounded-full skeleton" />
            <div className="h-4 flex-1 skeleton" />
            <div className="h-4 w-12 skeleton" />
            <div className="h-4 w-12 skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}
