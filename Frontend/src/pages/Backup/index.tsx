import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { DatabaseBackup, Download, AlertTriangle, Upload } from "lucide-react";
import toast from "react-hot-toast";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../ui/PageHeader";
import Card from "../../ui/Card";
import NxBtn from "../../ui/nexora/Btn";
import Field from "../../ui/Field";

const CONFIRM_WORD = "RESTORE";

// Triggers a browser download from an already-fetched blob — same
// createObjectURL/synthetic-<a>/revokeObjectURL pattern already used
// elsewhere in this app (see features/dashboard/utils/dprExport.ts).
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Owner-only, full-database export/wipe-and-replace — see the backend
// routes/backup.js for the matching authorize('owner') gate. This page-level
// check is defense-in-depth on top of that, not a substitute for it: even if
// someone reached this route directly, every request below still hits the
// same owner-only API and would be rejected server-side regardless.
export default function Backup() {
  const { user } = useAuth();
  if (user?.role !== "owner") return <Navigate to="/" replace />;

  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadBackup = async () => {
    setDownloading(true);
    try {
      const res = await apiClient.get("/backup/export", { responseType: "blob" });
      saveBlob(res.data as Blob, `vbp-backup-${timestampForFilename()}.zip`);
      toast.success("Backup downloaded");
    } catch {
      // apiClient's response interceptor already toasts the error.
    } finally {
      setDownloading(false);
    }
  };

  const canRestore = confirmText === CONFIRM_WORD && !!selectedFile && !restoring;

  const restoreNow = async () => {
    if (!selectedFile || confirmText !== CONFIRM_WORD) return;
    setRestoring(true);
    try {
      // Safety snapshot first — same export the "Download Backup" button uses,
      // saved to the browser's own downloads before anything gets touched, so
      // there's a way back even though the server has nowhere durable to keep
      // one itself (Render's filesystem doesn't survive a redeploy/restart).
      toast.loading("Saving a safety snapshot of current data before restoring…", { id: "restore" });
      const snapshotRes = await apiClient.get("/backup/export", { responseType: "blob" });
      saveBlob(snapshotRes.data as Blob, `pre-restore-safety-backup-${timestampForFilename()}.zip`);

      toast.loading("Restoring — this will take a moment…", { id: "restore" });
      const fileBuffer = await selectedFile.arrayBuffer();
      const res = await apiClient.post("/backup/import", fileBuffer, {
        headers: { "Content-Type": "application/zip", "X-Confirm-Restore": CONFIRM_WORD },
      });

      const results = (res.data?.results ?? []) as { model: string; restored?: number; error?: string }[];
      const failed = results.filter((r) => r.error);
      toast.dismiss("restore");
      if (failed.length > 0) {
        toast.error(`Restore finished with ${failed.length} collection(s) failed — check details`);
      } else {
        toast.success(`Restore complete — ${results.length} collections replaced`);
      }
      setConfirmText("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast.dismiss("restore");
      // apiClient's response interceptor already toasts the error.
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Backup" subtitle="Download a full backup of every record in the database, or restore from a previously downloaded backup." icon={DatabaseBackup} />

      <Card className="mb-5">
        <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-1.5">Create Backup</div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Downloads a single .zip file containing every record from every collection in the database. Files hosted on Cloudinary (e.g. work order documents) are referenced by URL only, not included as files in this archive.
        </p>
        <NxBtn color="primary" icon={Download} label="Download Backup" loading={downloading} onClick={downloadBackup} />
      </Card>

      <Card className="border-red-300 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <div className="font-bold text-[15px] text-red-700 dark:text-red-400">Restore from Backup</div>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300 mb-4">
          Warning: restoring will <strong>PERMANENTLY DELETE</strong> all current data and replace it with what's in the uploaded file. This cannot be undone. A safety snapshot of the current data is downloaded automatically before the restore begins.
        </p>

        <div className="mb-3.5">
          <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Backup file (.zip)</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-gray-100 dark:file:bg-gray-700/50 file:text-gray-700 dark:file:text-gray-200 file:text-sm file:font-semibold"
          />
        </div>

        <div className="mb-4">
          <Field
            label={`Type ${CONFIRM_WORD} to confirm`}
            placeholder={CONFIRM_WORD}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>

        <NxBtn color="danger" icon={Upload} label="Restore Now" disabled={!canRestore} loading={restoring} onClick={restoreNow} />
      </Card>
    </div>
  );
}
