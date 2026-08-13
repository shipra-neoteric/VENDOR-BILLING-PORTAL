import { FolderOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Btn from "./Btn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

// The one shared "no records" block — every list page was previously
// hand-rolling its own version of this (3 different visual styles across
// the app). Reuse this instead of adding a 4th.
export default function EmptyState({ icon: Icon = FolderOpen, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <Icon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
      <div className="font-bold text-gray-600 dark:text-gray-300">{title}</div>
      {message && <div className="text-sm text-gray-400 mt-1 max-w-sm">{message}</div>}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Btn small color="primary" label={actionLabel} onClick={onAction} />
        </div>
      )}
    </div>
  );
}
