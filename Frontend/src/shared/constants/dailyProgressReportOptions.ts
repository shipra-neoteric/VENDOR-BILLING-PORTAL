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
  // JCB: owner + hours worked. Tractor: number of trips. Only used on those work types.
  ownerName?: string;
  hours?: number | "";
  tractorTrips?: number | "";
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

// First missing machine detail across the ticked work types — JCB needs the owner and hours, Tractor the trips.
export function machineDetailMissing(entries: WorkEntry[]): string | null {
  for (const e of entries) {
    if (e.workType === "JCB") {
      if (!e.ownerName?.trim()) return "JCB: enter the owner";
      if (!(Number(e.hours) > 0) || Number(e.hours) > 24) return "JCB: enter the number of hours it worked (up to 24)";
    }
    if (e.workType === "Tractor" && !(Number(e.tractorTrips) > 0)) return "Tractor: enter the number of tractor trips";
  }
  return null;
}

export const MIN_IMAGES_PER_CATEGORY = 1;
// Optional for now — Work Photos are the only mandatory evidence per category.
export const MIN_BEFORE_AFTER_IMAGES = 0;

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
