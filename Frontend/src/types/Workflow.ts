export type WorkflowEntityType = "WorkOrder" | "BillRequest" | "Custom";

export interface WorkflowTemplateStage {
  _id?: string;
  name: string;
  order: number;
  assignedRole: string;
  assignedUserId?: string | null;
  slaHours: number;
  businessHoursOnly: boolean;
  workingDays: string[];
  reminderBeforeMinutes: number;
  escalateAfterMinutes: number;
  escalateToUserId?: string | null;
}

export interface WorkflowTemplate {
  _id: string;
  name: string;
  description?: string;
  entityType: WorkflowEntityType;
  isActive: boolean;
  stages: WorkflowTemplateStage[];
  createdAt?: string;
}

interface PopulatedUser {
  _id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface WorkflowInstanceStage {
  _id: string;
  name: string;
  order: number;
  assignedRole: string;
  assignedUserId?: PopulatedUser | string | null;
  slaHours: number;
  startedAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  completedBy?: PopulatedUser | string | null;
  remarks?: string;
  status: "pending" | "in-progress" | "completed";
  delayMinutes: number;
  breached?: boolean;
}

export interface WorkflowInstance {
  _id: string;
  templateId: string;
  templateName: string;
  entityType: WorkflowEntityType;
  entityId: string;
  entityLabel: string;
  status: "in-progress" | "completed" | "cancelled";
  currentStageIndex: number;
  stages: WorkflowInstanceStage[];
  startedAt: string;
  completedAt?: string | null;
  isBreached?: boolean;
}

export interface MISHealth {
  score: number;
  status: "good" | "warning" | "critical";
  target: number;
  openWorkflows: number;
  overdue: number;
  critical: number;
  completedToday: number;
}

export interface MISBottleneck {
  entityType: WorkflowEntityType;
  stageName: string;
  pendingCount: number;
}

export interface MISPipelineStage {
  name: string;
  reached: number;
  completed: number;
  avgHours: number;
  withinSlaPct: number;
  pending: number;
}

export interface MISPipeline {
  templateName: string;
  entityType: WorkflowEntityType;
  stages: MISPipelineStage[];
}

export interface MISDepartment {
  name: string;
  totalSla: number;
  slaComplete: number;
  slaBreach: number;
  completePct: number;
}

export interface MISProjectHealth {
  projectId: string;
  projectName: string;
  total: number;
  onTimePct: number;
  pending: number;
  delayed: number;
  blockedAmount: number;
}

export interface MISFinancial {
  pendingAmount: number;
  breachedAmount: number;
  byStage: Array<{ stageName: string; amount: number }>;
}

export interface MISContractorDelay {
  vendorName: string;
  totalSla: number;
  slaBreach: number;
  avgBreachMinutes: number;
  pendingAmount: number;
  projectCount: number;
}

export interface MISHeatmapCell {
  projectId: string;
  projectName: string;
  dept: string;
  compliancePct: number;
}

export interface MISActivityEvent {
  time: string;
  text: string;
  type: "completed" | "late" | "breach";
}

export interface MISTrendPoint {
  date: string;
  netSla: number;
  ongoing: number;
  slaBreach: number;
  slaCompleted: number;
  pendingAmount: number;
  breachedAmount: number;
}

export interface MISAssigneeRow {
  key: string;
  label: string;
  totalSla: number;
  slaComplete: number;
  slaBreach: number;
  overdueMinutes: number;
  avgBreachMinutes: number;
}

export interface MISStageRow {
  entityType: WorkflowEntityType;
  stageName: string;
  total: number;
  avgHours: number;
  withinSlaPct: number;
  breachedCount: number;
}

export interface MISAgingBucket {
  label: string;
  count: number;
}

export interface MISDrilldownRow {
  instanceId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  entityLabel: string;
  currentStage: string;
  assignedTo: string;
  dueAt: string | null;
  breached: boolean;
  overdueMinutes: number;
}

export interface WorkflowMISReport {
  health: MISHealth;
  alerts: string[];
  bottlenecks: MISBottleneck[];
  pipeline: MISPipeline[];
  byStage: MISStageRow[];
  byAssignee: MISAssigneeRow[];
  departments: MISDepartment[];
  projectHealth: MISProjectHealth[];
  financial: MISFinancial;
  contractorDelays: MISContractorDelay[];
  agingBuckets: MISAgingBucket[];
  drilldown: MISDrilldownRow[];
  heatmap: MISHeatmapCell[];
  recentActivity: MISActivityEvent[];
  trend: MISTrendPoint[];
}
