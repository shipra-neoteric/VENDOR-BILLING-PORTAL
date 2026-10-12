// Shared between the admin Form Builder page and the public forms it
// configures (PublicDailyProgressReportForm today; the shape is generic
// enough for another public form to reuse later).
export interface FormFieldConfig {
  key: string;
  label: string;
  type: "built-in" | "text" | "number" | "date" | "dropdown" | "file";
  required: boolean;
  hidden: boolean;
  locked: boolean;
  options?: string[];
  order: number;
}

export const FIELD_TYPE_LABEL: Record<FormFieldConfig["type"], string> = {
  "built-in": "Built-in",
  text: "Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  file: "Photo / File",
};
