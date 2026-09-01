import { useRef, useState } from "react";
import type { AxiosInstance } from "axios";
import toast from "react-hot-toast";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";
import apiClient from "../services/apiClient";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";

export interface WODocument { name: string; url: string; }

export const MAX_DOCUMENT_FILES = 5;
const MAX_FILE_MB = 5;

export default function DocumentsUpload({
  value = [], onChange, uploadClient = apiClient, onUploadingChange,
}: {
  value?: WODocument[];
  onChange?: (docs: WODocument[]) => void;
  // Defaults to the authenticated apiClient — the public (no-login) Work
  // Order form passes its own `pub` client instead, since there's no session
  // token to sign an upload with otherwise (see Backend/src/routes/
  // uploads.js vs routes/public.js's separate signer).
  uploadClient?: AxiosInstance;
  // Lets the parent form know an upload is in flight, so it can disable its
  // own Save/Submit button — otherwise a user who saves (or closes the form)
  // before an upload finishes ends up with a document entry that has a name
  // but no file behind it (the entry is only added once the upload actually
  // succeeds, so nothing gets silently corrupted — but the save itself would
  // go through without that file ever being attached, with no indication
  // anything was missed).
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploading, setUploadingState] = useState(false);
  const setUploading = (u: boolean) => { setUploadingState(u); onUploadingChange?.(u); };
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (value.length >= MAX_DOCUMENT_FILES) {
      toast.error(`You can attach up to ${MAX_DOCUMENT_FILES} documents`);
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`${file.name} is larger than ${MAX_FILE_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToCloudinary(uploadClient, file, "work-orders", file.name);
      if (!url) {
        toast.error(`Upload of ${file.name} didn't return a file link — please try again`);
        return;
      }
      onChange?.([...value, { name: file.name, url }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Couldn't upload ${file.name}`);
    } finally {
      setUploading(false);
    }
  }

  const remove = (idx: number) => onChange?.(value.filter((_, i) => i !== idx));

  const atLimit = value.length >= MAX_DOCUMENT_FILES;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <button
        type="button"
        disabled={atLimit || uploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[13px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-transparent text-gray-700 dark:text-[#F1F5F9] hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:pointer-events-none"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Upload PDF / Doc / Image{value.length > 0 ? ` (${value.length}/${MAX_DOCUMENT_FILES})` : ""}
      </button>
      <div className="text-[11px] mt-1.5 text-gray-400">
        max {MAX_FILE_MB} MB per file, up to {MAX_DOCUMENT_FILES} files
      </div>
      {uploading && (
        <div className="text-[11px] mt-1 text-amber-600 dark:text-amber-400 font-medium">
          Uploading — please wait before saving or closing this form.
        </div>
      )}
      {value.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {value.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px] bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-1.5">
              <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
              <a
                href={d.url} target="_blank" rel="noreferrer" download={d.name}
                className="flex-1 text-gray-700 dark:text-gray-200 overflow-hidden truncate"
              >
                {d.name}
              </a>
              <button type="button" onClick={() => remove(i)} className="text-red-500 hover:text-red-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Normalizes a work order's document(s) to a single list — old records saved
// via the public form before multi-document support have a single
// documentUrl/documentName pair instead of a `documents` array.
export function getWorkOrderDocuments(wo: { documents?: WODocument[]; documentName?: string; documentUrl?: string }): WODocument[] {
  if (wo.documents?.length) return wo.documents;
  if (wo.documentName) return [{ name: wo.documentName, url: wo.documentUrl || "" }];
  return [];
}
