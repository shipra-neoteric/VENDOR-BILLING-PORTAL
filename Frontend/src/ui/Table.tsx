import type { ReactNode, HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({ children, className = "", ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700/40">
      <table className={["w-full border-collapse text-sm", className].join(" ")} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className="bg-gray-50 dark:bg-[#1E293B]" {...rest}>
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

export function Th({ children, className = "", ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={[
        "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "", ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={["px-4 py-3 align-middle", className].join(" ")} {...rest}>
      {children}
    </td>
  );
}

export function TdText({ children }: { children: ReactNode }) {
  return <span className="text-[#1A1A2E] dark:text-[#F1F5F9]">{children}</span>;
}
