// Triggers a browser download for an already-fetched Blob (e.g. a server-
// generated CSV). Shared here so new callers don't hand-roll their own copy —
// ProjectsList/index.tsx and WorkItems/index.tsx each still carry their own
// pre-existing local copy of this exact function; left alone rather than
// migrated, out of scope for this change.
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
