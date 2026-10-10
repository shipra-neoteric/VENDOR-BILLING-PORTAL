// Mongo documents carry `_id`; most of this app's UI code (dropdown options,
// list keys, lookups) expects a plain `id` string instead. This was
// previously reimplemented independently in ~11 files with slightly
// different signatures (`any`, `Record<string, unknown>`, a few without the
// `.toString()` safety for a raw ObjectId) — consolidated here as the one
// shared version so a future fix/tweak only has to happen once.
export function normalizeId<T extends { _id?: unknown; id?: string }>(obj: T): T & { id: string } {
  return { ...obj, id: (obj._id ?? obj.id)?.toString() ?? "" };
}
