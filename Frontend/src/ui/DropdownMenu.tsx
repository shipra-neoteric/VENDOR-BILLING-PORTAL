import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useClickOutside } from "./useClickOutside";
import { usePopupAlign } from "./usePopupAlign";

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  // Tooltip explaining why an item is disabled (e.g. "Locked — unlock to edit").
  title?: string;
  onClick: () => void;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  trigger?: ReactNode;
}

// Row-action popover menu — antd's <Dropdown menu={{items}}> replacement.
// Reuses useClickOutside/usePopupAlign exactly as those hooks' own doc
// comments intend for new popover-style components.
export default function DropdownMenu({ items, trigger }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useClickOutside(rootRef, () => setOpen(false), open);
  const { align, measure } = usePopupAlign();

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); measure(btnRef, 180); setOpen((o) => !o); }}
        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
      >
        {trigger ?? <MoreHorizontal className="w-4 h-4" />}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-30 mt-1 w-[180px] bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg overflow-hidden py-1 ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={[
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left disabled:opacity-40 disabled:cursor-not-allowed",
                item.danger ? "text-red-600! hover:bg-red-50 dark:hover:bg-red-500/10" : "text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40",
              ].join(" ")}
            >
              {item.icon && <item.icon className="w-3.5 h-3.5 shrink-0" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
