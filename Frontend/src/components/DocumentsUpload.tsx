import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";

export interface WODocument { name: string; url: string; }

export const MAX_DOCUMENT_FILES = 5;
const MAX_FILE_MB = 5;
const MAX_TOTAL_MB = 8; // keeps combined base64 payload well under Mongo's 16MB document limit

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Data URLs are ~4/3 the size of the raw bytes they encode.
function dataUrlSizeMb(dataUrl: string): number {
  return (dataUrl.length * 0.75) / (1024 * 1024);
}

export default function DocumentsUpload({
  value = [], onChange,
}: {
  value?: WODocument[];
  onChange?: (docs: WODocument[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
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
    const currentTotalMb = value.reduce((s, d) => s + dataUrlSizeMb(d.url), 0);
    if (currentTotalMb + file.size / (1024 * 1024) > MAX_TOTAL_MB) {
      toast.error(`Total attachments can't exceed ${MAX_TOTAL_MB}MB`);
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange?.([...value, { name: file.name, url: dataUrl }]);
    } catch {
      toast.error(`Couldn't read ${file.name}`);
    } finally {
      setUploading(false);
    }
  }

  const remove = (idx: number) => onChange?.(value.filter((_, i) => i !== idx));

  const usedMb = value.reduce((s, d) => s + dataUrlSizeMb(d.url), 0);
  const nearLimit = usedMb >= MAX_TOTAL_MB * 0.9;
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
      <div className={`text-[11px] mt-1.5 ${nearLimit ? "text-red-600" : "text-gray-400"}`}>
        {usedMb.toFixed(1)} MB of {MAX_TOTAL_MB} MB used · max {MAX_FILE_MB} MB per file, up to {MAX_DOCUMENT_FILES} files
      </div>
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
