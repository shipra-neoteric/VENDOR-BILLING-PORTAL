import dayjs from "dayjs";
import type { DPRReport } from "../../../types/DPR";

// Shared label formatting so the on-screen header, PDF, and CSV export all
// describe the selected period identically.
export function formatDprDateRange(meta: DPRReport["meta"]): string {
  const to = dayjs(meta.dateTo).format("DD MMM YYYY");
  if (!meta.dateFrom) return `All Time (through ${to})`;
  if (meta.isSingleDay) return to;
  const from = dayjs(meta.dateFrom).format("DD MMM YYYY");
  return `${from} – ${to}`;
}
