export const ROLES = {
  OWNER:      'owner',
  GM:         'gm',
  AGM:        'agm',
  ACCOUNTS:   'accounts',
  SITE_DRI:   'site-dri',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
