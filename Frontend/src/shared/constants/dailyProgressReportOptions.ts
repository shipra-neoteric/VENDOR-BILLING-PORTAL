// The combined Daily Progress Report — merges what used to be two separate
// submissions (Daily Project Report + Daily Contractor/Labour Report) into
// one form, shared between the public (no-login) and authenticated pages so
// the two can never drift apart.
export { WORK_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "./labourReportOptions";

export interface WorkImage {
  name: string;
  url: string;
}

export interface WorkEntry {
  workType: string;
  images: WorkImage[];
  // Distinct from `images` (general work-in-progress shots) — one snapshot
  // of the same spot before work started and after it finished, so a
  // reviewer can see the actual change without digging through the whole
  // day's photos.
  beforeImages: WorkImage[];
  afterImages: WorkImage[];
}

export interface DailyProgressReportFormValues {
  projectId: string;
  projectName?: string;
  driName: string;
  date: string;
  vendorCode: string;
  vendorName?: string;
  shiftType: string;
  labourCount: number | "";
  workEntries: WorkEntry[];
}

export const MIN_IMAGES_PER_CATEGORY = 1;
export const MIN_BEFORE_AFTER_IMAGES = 1;

export function firstMissingProgressField(values: {
  projectId?: string; driName?: string; date?: string; vendorCode?: string;
  shiftType?: string; labourCount?: number | "";
}): string | null {
  if (!values.projectId) return "a project";
  if (!values.driName) return "the DRI name";
  if (!values.date) return "a date";
  if (!values.vendorCode) return "a contractor";
  if (!values.shiftType) return "a shift type";
  if (values.labourCount === "" || values.labourCount === undefined || values.labourCount === null) return "the number of labourers";
  return null;
}
