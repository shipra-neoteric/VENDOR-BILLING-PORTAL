import { useEffect, useRef } from "react";
import type { ReactNode, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  // Optional — extends the wrapping scroll container's own className (e.g.
  // a fixed height + overflow-y-auto). Combining it on THIS div (which
  // already carries overflow-x-auto) gives one container that handles both
  // scroll axes, instead of nesting a second overflow wrapper around it —
  // a nested wrapper puts the horizontal scrollbar at the bottom of the
  // table's own (shorter) content instead of the bottom of the fixed-height
  // box, making it appear to float mid-container. Empty by default: every
  // existing caller's layout is unaffected.
  containerClassName?: string;
}

// Phone card view (see the `table[data-cards="on"]` rules in index.css): each
// body/footer cell gets its column's header text as `data-label`, which the CSS
// shows as a small caption so a row can render as a stacked card instead of a
// 10-column strip. Only tables with ONE plain header row qualify — anything
// with multi-row headers or rowSpan keeps the normal (horizontally scrolling)
// table, since a card can't represent those. Desktop is never affected.
function applyCardLabels(table: HTMLTableElement) {
  const headRows = table.tHead?.rows;
  const hasRowSpan = table.querySelector("th[rowspan], td[rowspan]") !== null;
  if (!headRows || headRows.length !== 1 || hasRowSpan) { table.dataset.cards = "off"; return; }
  const labels: string[] = [];
  Array.from(headRows[0].cells).forEach((c) => {
    for (let i = 0; i < (c.colSpan || 1); i++) labels.push((c.textContent || "").trim());
  });
  const rows = [...Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)), ...(table.tFoot ? Array.from(table.tFoot.rows) : [])];
  rows.forEach((row) => {
    let col = 0;
    Array.from(row.cells).forEach((cell) => {
      // A header like "Select all" belongs to the header checkbox, not to each row's.
      cell.dataset.label = cell.querySelector("input[type=checkbox]") ? "Select" : (labels[col] || "");
      col += cell.colSpan || 1;
    });
  });
  table.dataset.cards = "on";
}

export function Table({ children, className = "", containerClassName = "", ...rest }: TableProps) {
  // table-fixed + w-full splits the width equally, so on a phone every column
  // gets squeezed into a sliver. Unless the caller already set its own min-w-*,
  // give the table a floor below the sm breakpoint — the wrapper's
  // overflow-x-auto then scrolls sideways instead of crushing the columns.
  // (Tables that qualify for the phone card view ignore this floor.)
  const phoneFloor = /\bmin-w-/.test(className) ? "" : "min-w-[640px] sm:min-w-0";
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    applyCardLabels(table);
    // Rows come and go (filters, pagination, loaded data) — relabel on change.
    // childList only (not attributes), so labelling itself can't retrigger this.
    const observer = new MutationObserver(() => applyCardLabels(table));
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div className={["w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/40", containerClassName].join(" ")}>
      <table ref={tableRef} className={["w-full table-fixed border-collapse text-sm", phoneFloor, className].join(" ")} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children, className = "", ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={["bg-gray-50 dark:bg-[#1E293B]", className].join(" ")} {...rest}>
      {children}
    </thead>
  );
}

export function Tbody({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40" {...rest}>
      {children}
    </tbody>
  );
}

export function Tfoot({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot className="border-t-2 border-gray-200 dark:border-gray-700/40" {...rest}>
      {children}
    </tfoot>
  );
}

export function Tr({ children, className = "", ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={["hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors", className].join(" ")} {...rest}>
      {children}
    </tr>
  );
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Pins this column while the table scrolls horizontally — only needed for
   *  a wide table's leftmost column (see WorkItems' Monthly Report tab). */
  stickyLeft?: boolean;
  /** Tighter cell padding for dense, ERP-style tables (e.g. the Projects
   *  Overview dashboard). Opt-in — every existing caller is unaffected. */
  dense?: boolean;
}

export function Th({ children, className = "", stickyLeft = false, dense = false, ...rest }: ThProps) {
  return (
    <th
      className={[
        dense ? "px-2.5 py-1.5" : "px-4 py-3",
        "text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis",
        stickyLeft ? "sticky left-0 z-10 bg-gray-50 dark:bg-[#1E293B]" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  stickyLeft?: boolean;
  /** Tighter cell padding for dense, ERP-style tables. Opt-in. */
  dense?: boolean;
}

export function Td({ children, className = "", stickyLeft = false, dense = false, ...rest }: TdProps) {
  return (
    <td
      className={[
        dense ? "px-2.5 py-1 text-xs" : "px-4 py-3",
        "align-middle",
        stickyLeft ? "sticky left-0 z-10 bg-white dark:bg-[#0F172A]" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </td>
  );
}

export function TdText({ children }: { children: ReactNode }) {
  return <span className="text-[#1A1A2E] dark:text-[#F1F5F9]">{children}</span>;
}
