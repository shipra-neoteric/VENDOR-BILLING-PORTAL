// Daily Contractor / Labour Report (All Sites) — mirrors the team's existing
// Google Form field-for-field, shared between the public and DRI-dashboard
// submission pages.

export const WORK_TYPE_OPTIONS = [
  "Civil", "RCC", "Electrical", "Painter", "Plumbing", "Wooden", "Floor Grinding",
  "Core Cutting", "Fire", "Waterproofing", "Carpenter", "Fabrication", "UPVC",
  "Material Lifting", "Excavation", "Plantation", "Scaffolding", "POP", "Aluminium",
  "AC", "Texture", "Camera", "Road", "Termite treatment", "Lift", "Material Shifting",
  "Stone", "Tiles", "Epoxy", "Ceiling", "Welding", "Railing", "Other",
];

export const SHIFT_TYPE_OPTIONS = ["Day", "Night"];

export interface LabourReportFormValues {
  vendorCode: string;
  projectId: string;
  date: string;
  workType: string;
  shiftType: string;
  labourCount: number;
}
