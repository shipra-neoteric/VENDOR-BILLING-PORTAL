import { Plus, X } from "lucide-react";

// A progress entry's remarks used to be one freeform paragraph — fine to
// type, but once several days' worth of these get concatenated onto a bill
// (see collectAndMarkProgressRemarks on the backend), one run-on sentence
// per line reads badly. Collecting them as a list here instead means each
// one already lands on the bill as its own bullet, since they're joined
// with "\n" (same separator the bill display splits back on) rather than
// packed into a single paragraph.
const baseInputClass =
  "w-full h-9 px-2.5 rounded-lg border text-[13px] bg-white dark:bg-[#0F172A] text-[#1A1A2E] dark:text-[#F1F5F9] " +
  "placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:text-[13px] transition-colors " +
  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary border-gray-200 dark:border-gray-700";

export default function RemarksListInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const items = value.length ? value.split("\n") : [""];

  const update = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    onChange(next.join("\n"));
  };
  const add = () => onChange([...items, ""].join("\n"));
  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange((next.length ? next : [""]).join("\n"));
  };

  return (
    <div>
      <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
        Remarks (optional)
      </span>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input
              className={baseInputClass}
              placeholder={`Remark ${i + 1}`}
              value={item}
              onChange={(e) => update(i, e.target.value)}
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-1.5 text-primary text-xs font-semibold inline-flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> Add Remark
      </button>
    </div>
  );
}
