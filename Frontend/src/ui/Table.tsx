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

export function Table({ children, className = "", containerClassName = "", ...rest }: TableProps) {
  return (
    <div className={["w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/40", containerClassName].join(" ")}>
      <table className={["w-full table-fixed border-collapse text-sm", className].join(" ")} {...rest}>
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
}

export function Th({ children, className = "", stickyLeft = false, ...rest }: ThProps) {
  return (
    <th
      className={[
        "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap",
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
}

export function Td({ children, className = "", stickyLeft = false, ...rest }: TdProps) {
  return (
    <td
      className={[
        "px-4 py-3 align-middle",
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
