import { useState } from "react";
import { Upload, Button, message } from "antd";
import { UploadOutlined, DeleteOutlined, FileOutlined } from "@ant-design/icons";
import type { UploadProps } from "antd";

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

  const beforeUpload: NonNullable<UploadProps["beforeUpload"]> = async (file) => {
    if (value.length >= MAX_DOCUMENT_FILES) {
      message.error(`You can attach up to ${MAX_DOCUMENT_FILES} documents`);
      return false;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      message.error(`${file.name} is larger than ${MAX_FILE_MB}MB`);
      return false;
    }
    const currentTotalMb = value.reduce((s, d) => s + dataUrlSizeMb(d.url), 0);
    if (currentTotalMb + file.size / (1024 * 1024) > MAX_TOTAL_MB) {
      message.error(`Total attachments can't exceed ${MAX_TOTAL_MB}MB`);
      return false;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange?.([...value, { name: file.name, url: dataUrl }]);
    } catch {
      message.error(`Couldn't read ${file.name}`);
    } finally {
      setUploading(false);
    }
    return false;
  };

  const remove = (idx: number) => onChange?.(value.filter((_, i) => i !== idx));

  const usedMb = value.reduce((s, d) => s + dataUrlSizeMb(d.url), 0);
  const nearLimit = usedMb >= MAX_TOTAL_MB * 0.9;

  return (
    <div>
      <Upload beforeUpload={beforeUpload} showUploadList={false} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={value.length >= MAX_DOCUMENT_FILES}>
        <Button icon={<UploadOutlined />} loading={uploading}>
          Upload PDF / Doc / Image{value.length > 0 ? ` (${value.length}/${MAX_DOCUMENT_FILES})` : ""}
        </Button>
      </Upload>
      <div style={{ fontSize: 11, color: nearLimit ? "#dc2626" : "#9ba3b8", marginTop: 6 }}>
        {usedMb.toFixed(1)} MB of {MAX_TOTAL_MB} MB used · max {MAX_FILE_MB} MB per file, up to {MAX_DOCUMENT_FILES} files
      </div>
      {value.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {value.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, background: "#f5f6f8", border: "1px solid #e4e7ee", borderRadius: 6, padding: "6px 10px" }}>
              <FileOutlined style={{ color: "#f37916" }} />
              <a
                href={d.url} target="_blank" rel="noreferrer" download={d.name}
                style={{ flex: 1, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {d.name}
              </a>
              <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(i)} style={{ padding: 0 }} />
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
