import type { ReactNode, HTMLAttributes } from "react";

interface NxCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

// Guide §8/§16: cards use rounded-xl (12px) + a visible border, not just a
// shadow — distinct from buttons/inputs, which stay at rounded-lg.
export default function NxCard({ children, padded = true, className = "", ...rest }: NxCardProps) {
  return (
    <div
      className={[
        "bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700",
        padded ? "p-4 sm:p-5" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
