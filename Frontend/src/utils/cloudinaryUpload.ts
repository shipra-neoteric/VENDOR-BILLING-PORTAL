import type { AxiosInstance } from "axios";

interface SignResponse {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
}

// Cloudinary blocks direct delivery of PDF/ZIP files uploaded as resource_type
// "image" by default (a security restriction against a past PDF/SVG exploit,
// only liftable from the account's own dashboard settings) — which is exactly
// what the catch-all /auto/upload endpoint picks for a PDF, since Cloudinary
// treats PDFs as image-like for thumbnailing. Uploading non-image files as
// resource_type "raw" instead sidesteps that restriction entirely (raw
// resources are just opaque byte delivery, not the image pipeline the
// restriction targets), with no dashboard change needed. This only affects
// which Cloudinary endpoint the file is POSTed to — the signature itself
// (see Backend/src/utils/cloudinary.js) covers only {timestamp, folder}, so
// it's valid against any resource-type endpoint.
function resourceTypeFor(file: File | Blob, fileName?: string): "image" | "raw" {
  const mime = file instanceof File ? file.type : "";
  const name = fileName ?? (file instanceof File ? file.name : "");
  const isImage = mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
  return isImage ? "image" : "raw";
}

// Uploads a single file straight from the browser to Cloudinary — the file
// itself never passes through our own backend (there's no multer/multipart
// handling there, and this keeps it that way). `client` decides which
// backend route signs the request: the authenticated `/uploads/sign` for
// logged-in flows (DPR photos, Work Order documents), or the public forms'
// own `pub` client pointed at `/public/uploads/sign` for the two no-login
// forms — see Backend/src/routes/uploads.js and routes/public.js.
export async function uploadToCloudinary(
  client: AxiosInstance,
  file: File | Blob,
  folder: string,
  fileName?: string
): Promise<string> {
  const sign = await client.post<SignResponse>("/uploads/sign", { folder });
  const { signature, timestamp, apiKey, cloudName, folder: signedFolder } = sign.data;

  const form = new FormData();
  form.append("file", file, fileName);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", signedFolder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceTypeFor(file, fileName)}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || "Upload to Cloudinary failed");
  }
  const data = await res.json();
  return data.secure_url as string;
}

// Resizes/compresses an image client-side before upload — same dimension/
// quality budget as before, just producing a Blob to upload instead of a
// data URL to store inline.
export function compressImageToBlob(file: File, maxDim = 1280, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't compress image"))), "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Couldn't read image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Couldn't read file"));
    reader.readAsDataURL(file);
  });
}
