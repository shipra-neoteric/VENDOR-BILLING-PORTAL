// Daily Project Report — dropdown option sets, shared between the public
// (no-login) form and the authenticated DRI-dashboard form so the two never
// drift apart. Mirrors the team's existing Google Form field-for-field.

export const WORK_DELAYED_OPTIONS = [
  "No delay",
  "Yes — Material not available",
  "Yes — Drawing not available",
  "Yes — Labour shortage",
  "Yes — Contractor not on site",
  "Yes — Equipment breakdown",
  "Yes — Weather issue",
  "Yes — Other reason",
];

export const LABOUR_SHORT_OPTIONS = [
  "No — Labour adequate on all teams",
  "Yes — Civil contractor labour short",
  "Yes — Electrical contractor labour short",
  "Yes — Plumbing contractor labour short",
  "Yes — Finishing contractor labour short",
  "Yes — Multiple contractors short",
];

export const ADDITIONAL_LABOUR_OPTIONS = [
  "Not applicable",
  "1–2 additional",
  "3–5 additional",
  "6–10 additional",
  "More than 10",
];

export const MATERIAL_SHORT_OPTIONS = [
  "No — All materials adequate",
  "Yes — Cement",
  "Yes — Steel / Rebar",
  "Yes — Bricks / Blocks",
  "Yes — Sand",
  "Yes — Aggregate / Gitti",
  "Yes — Tiles",
  "Yes — Paint",
  "Yes — Plumbing fittings",
  "Yes — Electrical fittings",
  "Yes — Waterproofing material",
  "Yes — Other material",
];

export const MATERIAL_RUNOUT_OPTIONS = [
  "Not applicable",
  "Today — urgent",
  "1 day",
  "2 days",
  "3 days",
];

export const YES_NO_OPTIONS = ["Yes", "No"];

export const DRAWING_PENDING_OPTIONS = [
  "No — All required drawings available",
  "Yes — Architectural drawing pending",
  "Yes — Structural drawing pending",
  "Yes — Plumbing drawing pending",
  "Yes — Electrical drawing pending",
  "Yes — Landscape drawing pending",
  "Yes — Multiple drawings pending",
];

export const DRAWING_PENDING_DAYS_OPTIONS = [
  "Not applicable",
  "Today — just requested",
  "1–2 days",
  "3–5 days",
  "More than 5 days",
];

export const CHALLENGE_BLOCKING_OPTIONS = [
  "No — Work proceeding smoothly",
  "Yes — Contractor issue",
  "Yes — Material issue",
  "Yes — Drawing issue",
  "Yes — Labour issue",
  "Yes — Payment / financial issue",
  "Yes — Equipment breakdown",
  "Yes — External dependency (government / utility)",
  "Yes — Other",
];

export const ESCALATION_REQUIRED_OPTIONS = [
  "No — I can handle it",
  "Yes — Need decision from leadership today",
  "Yes — Urgent — work stopped, need immediate action",
];

// A response counts as an active alert (not the calm/default "No ..." choice)
// whenever it starts with "Yes" — used to badge report rows red/amber at a
// glance without re-deriving this per screen.
export const isAlert = (value?: string) => !!value && value.trim().toLowerCase().startsWith("yes");

export interface DprFormValues {
  projectId: string;
  projectName?: string;
  driName: string;
  date: string;
  tomorrowsPlan: string;
  workDelayed: string;
  labourShort: string;
  additionalLabourNeeded?: string;
  labourShortageImpact?: string;
  materialShort: string;
  materialRunOutDays?: string;
  materialReceivedOnTime: string;
  materialShortageImpact?: string;
  drawingPending: string;
  drawingReference?: string;
  drawingPendingDays?: string;
  drawingBlockedActivity?: string;
  challengeBlocking: string;
  challengeDescription?: string;
  escalationRequired: string;
  escalationAction?: string;
}
