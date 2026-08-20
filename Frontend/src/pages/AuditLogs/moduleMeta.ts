import type { LucideIcon } from "lucide-react";
import {
  LogIn, UserPlus, Building2, Users, Ruler, Landmark, Tags, Network,
  FileText, GitCompare, FileSearch, Wallet, PenLine, CalendarClock,
  Flag, Layers, Receipt, Workflow, Clock, Database,
} from "lucide-react";

export interface ModuleMeta {
  key: string;
  label: string;
  icon: LucideIcon;
  subtitle: string;
}

// The canonical list of every module that can appear in the audit trail —
// including ones with zero logs so far. The flashcard grid renders one card
// per entry here and merges in counts from GET /audit-logs/summary by key,
// rather than only showing modules that already happen to have data.
export const AUDIT_MODULES: ModuleMeta[] = [
  { key: "auth", label: "Authentication", icon: LogIn, subtitle: "Logins and account switching" },
  { key: "user-management", label: "Users", icon: UserPlus, subtitle: "User accounts, roles, permissions" },
  { key: "projects", label: "Projects", icon: Building2, subtitle: "Project creation and edits" },
  { key: "contractors", label: "Contractors", icon: Users, subtitle: "Contractor records and KYC" },
  { key: "consultants", label: "Consultants", icon: Ruler, subtitle: "Consultant records" },
  { key: "companies", label: "Companies", icon: Landmark, subtitle: "Company master data" },
  { key: "categories", label: "Categories", icon: Tags, subtitle: "Category master data" },
  { key: "vendor-groups", label: "Vendor Groups", icon: Network, subtitle: "Vendor grouping" },
  { key: "work-orders", label: "Work Orders", icon: FileText, subtitle: "Work order lifecycle and approvals" },
  { key: "quotations", label: "Quotations", icon: GitCompare, subtitle: "Contractor quotation approvals" },
  { key: "bill-requests", label: "Bill Requests", icon: FileSearch, subtitle: "Bill request approval chain" },
  { key: "accounts-payment", label: "Accounts Payment", icon: Wallet, subtitle: "Bill verification, approval, payment" },
  { key: "drawing-requests", label: "Drawing Requests", icon: PenLine, subtitle: "Drawing request review chain" },
  { key: "daily-progress-reports", label: "Daily Progress Reports", icon: CalendarClock, subtitle: "Site DPR submissions" },
  { key: "milestones", label: "Milestones", icon: Flag, subtitle: "Milestones and linked activities" },
  { key: "stages", label: "Stages", icon: Layers, subtitle: "Stages and activities configuration" },
  { key: "advance-slips", label: "Advance Slips", icon: Receipt, subtitle: "Advance payment slips" },
  { key: "workflows", label: "Workflows", icon: Workflow, subtitle: "Workflow templates and instances" },
  { key: "report-schedules", label: "Report Schedules", icon: Clock, subtitle: "Scheduled report configuration" },
  { key: "backup", label: "Backup & Restore", icon: Database, subtitle: "Manual and automatic backups, restores" },
];
