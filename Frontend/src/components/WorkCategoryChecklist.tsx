import { useRef, useState } from "react";
import type { AxiosInstance } from "axios";
import toast from "react-hot-toast";
import { Camera, Check, Loader2, X } from "lucide-react";
import apiClient from "../services/apiClient";
import { uploadToCloudinary, compressImageToBlob } from "../utils/cloudinaryUpload";
import { WORK_TYPE_OPTIONS, MIN_IMAGES_PER_CATEGORY, MIN_BEFORE_AFTER_IMAGES } from "../shared/constants/dailyProgressReportOptions";
import type { WorkEntry, WorkImage } from "../shared/constants/dailyProgressReportOptions";

const MAX_IMAGES_PER_CATEGORY = 5;
const MAX_BEFORE_AFTER_IMAGES = 5;

type PhotoKind = "images" | "beforeImages" | "afterImages";

interface Props {
  entries: WorkEntry[];
  onChange: (entries: WorkEntry[]) => void;
  // Defaults to the authenticated apiClient — the public (no-login) Daily
  // Progress Report form passes its own `pub` client instead, since there's
  // no session token to sign an upload with otherwise (see
  // Backend/src/routes/uploads.js vs routes/public.js's separate signer).
  uploadClient?: AxiosInstance;
}

export default function WorkCategoryChecklist({ entries, onChange, uploadClient = apiClient }: Props) {
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function toggle(workType: string) {
    const exists = entries.some(e => e.workType === workType);
    onChange(exists ? entries.filter(e => e.workType !== workType) : [...entries, { workType, images: [], beforeImages: [], afterImages: [] }]);
  }

  async function handleFiles(workType: string, kind: PhotoKind, max: number, label: string, files: FileList) {
    const entry = entries.find(e => e.workType === workType);
    if (!entry) return;
    const remaining = max - entry[kind].length;
    if (remaining <= 0) return toast.error(`"${workType}" ${label} already has the maximum of ${max} photos`);

    const uploadKey = `${workType}:${kind}`;
    setUploadingFor(uploadKey);
    try {
      const picked = Array.from(files).slice(0, remaining);
      const uploaded: WorkImage[] = [];
      for (const file of picked) {
        const blob = await compressImageToBlob(file);
        const url = await uploadToCloudinary(uploadClient, blob, "daily-progress-reports", file.name);
        uploaded.push({ name: file.name, url });
      }
      if (uploaded.length > 0) {
        onChange(entries.map(e => e.workType === workType ? { ...e, [kind]: [...e[kind], ...uploaded] } : e));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload one or more photos");
    } finally {
      setUploadingFor(null);
    }
  }

  function removeImage(workType: string, kind: PhotoKind, idx: number) {
    onChange(entries.map(e => e.workType === workType ? { ...e, [kind]: e[kind].filter((_, i) => i !== idx) } : e));
  }

  function PhotoRow({ entry, kind, label, min, max }: { entry: WorkEntry; kind: PhotoKind; label: string; min: number; max: number }) {
    const images = entry[kind];
    const short = images.length < min;
    const uploadKey = `${entry.workType}:${kind}`;
    return (
      <div className="mt-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</span>
          {min > 0 ? (
            <span className={`text-[11px] font-semibold ${short ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {images.length}/{min} min
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">optional</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
              <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(entry.workType, kind, i)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}

          {images.length < max && (
            <button
              type="button"
              disabled={uploadingFor === uploadKey}
              onClick={() => inputRefs.current[uploadKey]?.click()}
              className="w-16 h-16 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-primary hover:text-primary disabled:opacity-50 shrink-0"
            >
              {uploadingFor === uploadKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
          )}
          <input
            ref={el => { inputRefs.current[uploadKey] = el; }}
            type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(entry.workType, kind, max, label, e.target.files); e.target.value = ""; }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {WORK_TYPE_OPTIONS.map(wt => {
          const checked = entries.some(e => e.workType === wt);
          return (
            <button
              key={wt}
              type="button"
              onClick={() => toggle(wt)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                checked
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <span
                className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 ${
                  checked ? "bg-primary border-primary" : "bg-white dark:bg-transparent border-gray-300 dark:border-gray-600"
                }`}
              >
                {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </span>
              <span className={`text-sm font-medium ${checked ? "text-primary" : "text-gray-600 dark:text-gray-300"}`}>{wt}</span>
            </button>
          );
        })}
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-3 mt-5">
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-t border-gray-100 dark:border-gray-700/40 pt-4">
            {entries.length} categor{entries.length === 1 ? "y" : "ies"} selected — add at least {MIN_IMAGES_PER_CATEGORY} work photo{MIN_IMAGES_PER_CATEGORY === 1 ? "" : "s"} to each (before &amp; after photos are optional)
          </div>
          {entries.map(entry => (
            <div key={entry.workType} className="border rounded-lg p-3 border-gray-200 dark:border-gray-700/40">
              <span className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{entry.workType}</span>
              <PhotoRow entry={entry} kind="images" label="Work Photos" min={MIN_IMAGES_PER_CATEGORY} max={MAX_IMAGES_PER_CATEGORY} />
              <PhotoRow entry={entry} kind="beforeImages" label="Before Photo" min={MIN_BEFORE_AFTER_IMAGES} max={MAX_BEFORE_AFTER_IMAGES} />
              <PhotoRow entry={entry} kind="afterImages" label="After Photo" min={MIN_BEFORE_AFTER_IMAGES} max={MAX_BEFORE_AFTER_IMAGES} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
