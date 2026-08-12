import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export default function Card({ children, padded = true, className = "", ...rest }: CardProps) {
  return (
    <div
      className={[
        "bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-sm",
        padded ? "p-5" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
