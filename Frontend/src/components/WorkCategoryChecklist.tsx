import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Camera, Loader2, X } from "lucide-react";
import Checkbox from "../ui/Checkbox";
import { WORK_TYPE_OPTIONS, MIN_IMAGES_PER_CATEGORY } from "../shared/constants/dailyProgressReportOptions";
import type { WorkEntry } from "../shared/constants/dailyProgressReportOptions";

const MAX_IMAGES_PER_CATEGORY = 10;
const MAX_TOTAL_MB = 12; // stays under the server's 14MB cap with headroom for the rest of the payload
const COMPRESS_MAX_DIM = 1280;
const COMPRESS_QUALITY = 0.7;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > COMPRESS_MAX_DIM || height > COMPRESS_MAX_DIM) {
          const scale = COMPRESS_MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", COMPRESS_QUALITY));
      };
      img.onerror = () => reject(new Error("Couldn't read image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.readAsDataURL(file);
  });
}

const dataUrlMb = (url: string) => (url.length * 0.75) / (1024 * 1024);

interface Props {
  entries: WorkEntry[];
  onChange: (entries: WorkEntry[]) => void;
}

export default function WorkCategoryChecklist({ entries, onChange }: Props) {
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const totalMb = entries.flatMap(e => e.images).reduce((s, img) => s + dataUrlMb(img.url), 0);

  function toggle(workType: string) {
    const exists = entries.some(e => e.workType === workType);
    onChange(exists ? entries.filter(e => e.workType !== workType) : [...entries, { workType, images: [] }]);
  }

  async function handleFiles(workType: string, files: FileList) {
    const entry = entries.find(e => e.workType === workType);
    if (!entry) return;
    const remaining = MAX_IMAGES_PER_CATEGORY - entry.images.length;
    if (remaining <= 0) return toast.error(`"${workType}" already has the maximum of ${MAX_IMAGES_PER_CATEGORY} photos`);

    setUploadingFor(workType);
    try {
      const picked = Array.from(files).slice(0, remaining);
      const compressed: { name: string; url: string }[] = [];
      for (const file of picked) {
        if (totalMb + compressed.reduce((s, i) => s + dataUrlMb(i.url), 0) > MAX_TOTAL_MB) {
          toast.error(`Total photos would exceed ${MAX_TOTAL_MB}MB — remove some first`);
          break;
        }
        const url = await compressImage(file);
        compressed.push({ name: file.name, url });
      }
      if (compressed.length > 0) {
        onChange(entries.map(e => e.workType === workType ? { ...e, images: [...e.images, ...compressed] } : e));
      }
    } catch {
      toast.error("Couldn't process one or more photos");
    } finally {
      setUploadingFor(null);
    }
  }

  function removeImage(workType: string, idx: number) {
    onChange(entries.map(e => e.workType === workType ? { ...e, images: e.images.filter((_, i) => i !== idx) } : e));
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {WORK_TYPE_OPTIONS.map(wt => (
          <Checkbox key={wt} checked={entries.some(e => e.workType === wt)} onChange={() => toggle(wt)} label={wt} />
        ))}
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-3 mt-4">
          {entries.map(entry => {
            const short = entry.images.length < MIN_IMAGES_PER_CATEGORY;
            return (
              <div key={entry.workType} className={`border rounded-lg p-3 ${short ? "border-amber-300 dark:border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/5" : "border-gray-200 dark:border-gray-700/40"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{entry.workType}</span>
                  <span className={`text-xs font-semibold ${short ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {entry.images.length}/{MIN_IMAGES_PER_CATEGORY} min photos
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {entry.images.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(entry.workType, i)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}

                  {entry.images.length < MAX_IMAGES_PER_CATEGORY && (
                    <button
                      type="button"
                      disabled={uploadingFor === entry.workType}
                      onClick={() => inputRefs.current[entry.workType]?.click()}
                      className="w-16 h-16 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-primary hover:text-primary disabled:opacity-50 shrink-0"
                    >
                      {uploadingFor === entry.workType ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    </button>
                  )}
                  <input
                    ref={el => { inputRefs.current[entry.workType] = el; }}
                    type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files?.length) handleFiles(entry.workType, e.target.files); e.target.value = ""; }}
                  />
                </div>
              </div>
            );
          })}
          <div className="text-[11px] text-gray-400">{totalMb.toFixed(1)} MB of {MAX_TOTAL_MB} MB used across all categories</div>
        </div>
      )}
    </div>
  );
}
