interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "h-4 w-full" }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-gray-200 dark:bg-gray-700/50 ${className}`} />;
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 overflow-hidden">
      <div className="bg-gray-50 dark:bg-[#1E293B] px-4 py-3 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3 flex gap-6">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 w-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
