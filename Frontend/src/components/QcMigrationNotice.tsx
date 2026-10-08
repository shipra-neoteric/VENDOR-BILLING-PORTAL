import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExternalLink, X, ArrowRightLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Btn from "../ui/Btn";

const QC_URL = "https://quality-control-xs1t.vercel.app";

// Shown only to DRIs, on the Daily Progress Report and Drawing Request
// pages — DPR/Drawing Request submission is moving to the new Quality
// Control system. Deliberately shown every time a DRI opens either page
// (not a dismiss-once notice) until the migration is actually complete,
// since this is a temporary, time-sensitive heads-up, not routine UI chrome.
// Centered dialog (not the usual right-drawer Modal) — an announcement,
// not a detail/edit view, so it follows ConfirmModal's centered convention.
export default function QcMigrationNotice() {
  const { user } = useAuth();
  const [open, setOpen] = useState(user?.role === "site-dri");
  if (!open) return null;

  const close = () => setOpen(false);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-[#0F172A]/60 flex items-center justify-center p-4"
        style={{ zIndex: 200 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      >
        <motion.div
          className="w-full max-w-md bg-white dark:bg-[#1E293B] rounded-xl shadow-2xl p-5"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">We're moving to a new system</div>
            </div>
            <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-4 text-[13px] text-gray-600 dark:text-gray-300 mb-5">
            <p>
              We are soon getting shifted to the following system — please log in there
              and submit your Daily Progress Reports and Drawing Requests on it going forward.
            </p>
            <a
              href={QC_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline break-all"
            >
              {QC_URL}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
            <p className="text-gray-500 dark:text-gray-400">
              If you run into any issue, contact <strong>Poorva Jain (MDO)</strong>.
            </p>
          </div>

          <div className="flex gap-2">
            <Btn label="Continue here" outline className="flex-1" onClick={close} />
            <Btn
              label="Go to QC"
              color="primary"
              className="flex-1"
              onClick={() => { window.open(QC_URL, "_blank", "noopener,noreferrer"); close(); }}
            />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
