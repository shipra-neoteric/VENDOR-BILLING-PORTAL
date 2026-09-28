export interface UnitOption {
  label: string;
  value: string;
}

export const UNIT_OPTIONS: UnitOption[] = [
  { label: "Sq.Ft (Square Feet)",  value: "sq.ft" },
  { label: "Sq.M (Square Meter)",  value: "sq.m" },
  { label: "Cu.M (Cubic Meter)",   value: "cu.m" },
  { label: "Cu.Ft (Cubic Feet)",   value: "cu.ft" },
  { label: "RMT (Running Meter)",  value: "rmt" },
  { label: "Kg (Kilogram)",        value: "kg" },
  { label: "Litre",                value: "litre" },
  { label: "MT (Metric Ton)",      value: "mt" },
  { label: "Nos (Numbers)",        value: "nos" },
  { label: "Daily Wage",           value: "daily-wage" },
  { label: "Per Day",              value: "per-day" },
  { label: "Per Person",           value: "per-person" },
  { label: "Per Hour",             value: "per-hr" },
  { label: "Per Trip",             value: "per-trip" },
  { label: "RFT (Running Foot)",   value: "rft" },
  { label: "Lump Sum",             value: "lump-sum" },
  { label: "Strip",                value: "strip" },
  { label: "Custom...",            value: "custom" },
];

export const isKnownUnit = (unit: string): boolean =>
  UNIT_OPTIONS.some((u) => u.value === unit && u.value !== "custom");

export const resolveUnit = (unit: string, customUnit: string): string =>
  unit === "custom" ? (customUnit.trim() || "unit") : unit;
