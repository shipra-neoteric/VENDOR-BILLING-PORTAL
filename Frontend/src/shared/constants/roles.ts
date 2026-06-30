export const ROLES = {
  OWNER:      'owner',
  GM:         'gm',
  ACCOUNTS:   'accounts',
  ENGINEER:   'engineer',
  CONTRACTOR: 'contractor',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
