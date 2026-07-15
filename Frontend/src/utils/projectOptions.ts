export interface ProjectLike {
  id?: string;
  _id?: string;
  name?: string;
  parentId?: string | null;
}

// Parent/container projects (ones that have sub-projects) are organizational
// shells — actual work is always attributed to a specific (sub-)project, so
// they're excluded from any "pick a project" dropdown. Remaining options are
// sorted alphabetically by name.
export function selectableProjects<T extends ProjectLike>(projects: T[]): T[] {
  const parentIds = new Set(projects.map(p => p.parentId).filter(Boolean) as string[]);
  return projects
    .filter(p => !parentIds.has(p.id ?? "") && !parentIds.has(p._id ?? ""))
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

// The work-orders API returns `projectId` populated ({_id, code, name, projectType}),
// not a plain id string — unwrap it so it can be compared against a filter's selected id.
export function getWorkOrderProjectId(projectId: string | { _id: string } | null | undefined): string | undefined {
  if (!projectId) return undefined;
  return typeof projectId === "string" ? projectId : projectId._id;
}
