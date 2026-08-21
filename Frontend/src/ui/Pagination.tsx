import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500! dark:text-gray-400! hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1 text-gray-400 text-sm">…</span>}
          <button
            type="button"
            onClick={() => onChange(p)}
            className={[
              "w-8 h-8 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              // Trailing `!` forces !important — see Btn.tsx for why.
              p === page
                ? "bg-primary text-white!"
                : "text-gray-600! dark:text-gray-300! hover:bg-gray-100 dark:hover:bg-gray-700/50",
            ].join(" ")}
          >
            {p}
          </button>
        </span>
      ))}

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500! dark:text-gray-400! hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
