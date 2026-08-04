import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ModalProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  onClose: () => void;
  wide?: boolean;
  extraWide?: boolean;
  ultraWide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

// Right-side drawer — the only "modal" shape this design system uses (see
// ConfirmModal for the one deliberate exception, a centered confirm dialog).
export default function Modal({
  title, subtitle, icon: Icon, onClose, wide, extraWide, ultraWide, footer, children,
}: ModalProps) {
  const widthClass = ultraWide ? "max-w-6xl" : extraWide ? "max-w-4xl" : wide ? "max-w-2xl" : "max-w-lg";
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-[#0F172A]/60 z-[200] flex justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={`relative w-full ${widthClass} h-full bg-white dark:bg-[#0F172A] shadow-2xl flex flex-col`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700/40 bg-gray-50 dark:bg-[#1E293B]">
            <div className="flex items-center gap-3 min-w-0">
              {Icon && (
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{title}</div>
                {subtitle && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</div>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>

          {footer && (
            <div className="sticky bottom-0 bg-gray-50 dark:bg-[#1E293B] border-t border-gray-100 dark:border-gray-700/40 px-4 sm:px-6 py-3 sm:py-4">
              {footer}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
