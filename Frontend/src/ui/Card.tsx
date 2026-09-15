import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
  /** "sm" gives tighter padding for dense, ERP-style layouts (e.g. the
   *  Projects Overview dashboard). Defaults to "md" (the original p-5) so
   *  every existing caller is unaffected. */
  size?: "sm" | "md";
}

export default function Card({ children, padded = true, size = "md", className = "", ...rest }: CardProps) {
  return (
    <div
      className={[
        "bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-sm",
        padded ? (size === "sm" ? "p-3" : "p-5") : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
