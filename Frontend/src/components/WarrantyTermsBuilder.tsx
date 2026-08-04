import { Plus, Trash2 } from "lucide-react";
import Btn from "../ui/Btn";

export default function WarrantyTermsBuilder({
  items, onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">Special Terms and Conditions</div>
        <Btn small outline icon={Plus} label="Add Term" onClick={() => onChange([...items, ""])} />
      </div>

      {items.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg py-5 text-center text-gray-400 text-xs mb-3">
          No special terms yet — e.g. "5-year structural warranty on RCC work".
        </div>
      )}

      {items.map((t, i) => (
        <div key={i} className="flex gap-2 items-start mb-2">
          <span className="text-[11px] text-gray-400 min-w-[18px] mt-2 font-semibold">{i + 1}.</span>
          <textarea
            rows={2}
            placeholder="e.g. Contractor provides a 2-year warranty against workmanship defects"
            value={t}
            onChange={e => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="mt-2 text-red-500 hover:text-red-600 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
