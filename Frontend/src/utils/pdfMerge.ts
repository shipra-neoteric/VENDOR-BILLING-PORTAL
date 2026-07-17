import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { WODocument } from "../components/DocumentsUpload";

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 36;

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "";
  const binary = atob(b64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

function extOf(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

async function addPlaceholderPage(pdfDoc: PDFDocument, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, name: string, reason: string) {
  const page = pdfDoc.addPage([A4_W, A4_H]);
  page.drawText("Attached Document (not embeddable)", { x: MARGIN, y: A4_H - MARGIN - 14, size: 13, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(name, { x: MARGIN, y: A4_H - MARGIN - 36, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(reason, { x: MARGIN, y: A4_H - MARGIN - 56, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText("Please request this file separately from the portal.", { x: MARGIN, y: A4_H - MARGIN - 72, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
}

function addImagePage(pdfDoc: PDFDocument, img: { width: number; height: number }, name: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, drawable: Parameters<import("pdf-lib").PDFPage["drawImage"]>[0]) {
  const page = pdfDoc.addPage([A4_W, A4_H]);
  page.drawText(name, { x: MARGIN, y: A4_H - MARGIN, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  const maxW = A4_W - MARGIN * 2;
  const maxH = A4_H - MARGIN * 2 - 24;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(drawable, { x: (A4_W - w) / 2, y: (A4_H - h) / 2 - 12, width: w, height: h });
}

// Appends each attached document as extra pages on the generated work-order
// PDF — actual pages for PDF attachments, a full-page image for photos, and a
// reference page (name + reason) for anything that can't be embedded (e.g.
// .doc/.docx) so the recipient at least knows it exists.
export async function mergeAttachmentsIntoPdf(mainPdfBytes: ArrayBuffer | Uint8Array, documents: WODocument[]): Promise<Uint8Array> {
  const merged = await PDFDocument.load(mainPdfBytes);
  if (documents.length === 0) return merged.save();

  const font = await merged.embedFont(StandardFonts.Helvetica);

  for (const doc of documents) {
    if (!doc.url) {
      await addPlaceholderPage(merged, font, doc.name, "No file data available for this attachment.");
      continue;
    }
    const ext = extOf(doc.name);
    try {
      const { bytes, mime } = dataUrlToBytes(doc.url);
      if (mime.includes("pdf") || ext === "pdf") {
        const src = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      } else if (mime.includes("jpeg") || ["jpg", "jpeg"].includes(ext)) {
        const img = await merged.embedJpg(bytes);
        addImagePage(merged, img, doc.name, font, img);
      } else if (mime.includes("png") || ext === "png") {
        const img = await merged.embedPng(bytes);
        addImagePage(merged, img, doc.name, font, img);
      } else {
        await addPlaceholderPage(merged, font, doc.name, "This file type can't be embedded automatically (only PDF/JPG/PNG are).");
      }
    } catch {
      await addPlaceholderPage(merged, font, doc.name, "This file could not be read/embedded automatically.");
    }
  }

  return merged.save();
}
