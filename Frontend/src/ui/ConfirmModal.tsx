import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle } from "lucide-react";
import Btn from "./Btn";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// The one deliberate exception to Modal's right-drawer shape — a small
// centered dialog, matching the UI.md spec's confirm-dialog pattern.
export default function ConfirmModal({
  title, message, confirmLabel = "Confirm", danger = false, loading = false, onConfirm, onCancel,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-[#0F172A]/60 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      >
        <motion.div
          className="w-full max-w-sm bg-white dark:bg-[#1E293B] rounded-xl shadow-2xl p-5"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-red-50 dark:bg-red-500/10" : "bg-primary/10"}`}>
              <AlertTriangle className={`w-5 h-5 ${danger ? "text-red-500" : "text-primary"}`} />
            </div>
            <div>
              <div className="text-[15px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{title}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{message}</div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn label="Cancel" outline onClick={onCancel} disabled={loading} />
            <Btn label={confirmLabel} color={danger ? "red" : "primary"} onClick={onConfirm} loading={loading} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
