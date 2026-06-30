export const PROJECT_STATUS = {
  ACTIVE:    'active',
  COMPLETED: 'completed',
  ON_HOLD:   'on-hold',
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_COLOR: Record<string, string> = {
  active:    'green',
  completed: 'blue',
  'on-hold': 'orange',
};

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  active:    'Active',
  completed: 'Completed',
  'on-hold': 'On Hold',
};
