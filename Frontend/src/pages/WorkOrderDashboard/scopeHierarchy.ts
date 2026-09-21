// ── Floor → Flat → Room → Work Item hierarchy, derived purely from existing
// scopeItem descriptions (no new data, no API calls). Two real-world
// description formats exist in the data:
//   New granular:  "{Floor} Floor Flat {N} Washroom {W}" / "...Flat {N} Kitchen"
//   Old combined:  "First Floor Flat No. 1/2/3/5/6 Washrooms" (multiple flats,
//                  "/" or "&" separated — never split into fake per-flat rows)
// Anything that doesn't match "Floor" at all renders ungrouped at the top level.

export interface ScopeSubItemLike {
  _id?: string; id?: string; description: string; unit: string;
  plannedQty: number; rate: number; amount: number;
  completedQty?: number; lastBilledQty?: number; status?: string;
  varianceApproved?: boolean;
  progressEntries?: unknown[];
}

export interface ScopeItemLike {
  _id: string; description: string; unit: string;
  plannedQty: number; rate: number; amount: number;
  completedQty: number; lastBilledQty: number; status: string;
  subItems?: ScopeSubItemLike[];
}

export interface RoomNode {
  key: string;
  label: string;
  amount: number;
  scopeItem: ScopeItemLike;
}

export interface FlatNode {
  key: string;
  label: string;
  flatNo: number | null;
  amount: number;
  // Granular format: one or more Room nodes. Old combined format: null,
  // and the flat node itself carries the scopeItem (degrade to 3 levels).
  rooms: RoomNode[] | null;
  scopeItem?: ScopeItemLike; // present only for the old-combined degraded case
}

export interface FloorNode {
  key: string;
  label: string;
  order: number;
  amount: number;
  flats: FlatNode[];
}

export interface ScopeHierarchy {
  floors: FloorNode[];
  ungrouped: ScopeItemLike[];
}

const ORDINAL_ORDER: Record<string, number> = {
  ground: 0, first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
};

function floorOrder(name: string): number {
  const n = ORDINAL_ORDER[name.toLowerCase()];
  return n === undefined ? 999 : n;
}

// "{Floor} Floor ..." — generic, not hardcoded to a fixed ordinal list.
const FLOOR_RE = /^(\w+)\s+Floor\b/i;
// New granular: "...Flat {N} Washroom {W}" / "...Flat {N} Kitchen"
const GRANULAR_RE = /Flat\s+(\d+)\s+(.+)$/i;
// Old combined: "...Flat No. 1/2/3/5/6 Washrooms" or "...Flat No. 9 & 4 Kitchen"
const COMBINED_RE = /Flat\s+No\.?\s*[\d/&\s]+/i;

export function buildScopeHierarchy(scopeItems: ScopeItemLike[]): ScopeHierarchy {
  const floorMap = new Map<string, FloorNode>();
  const ungrouped: ScopeItemLike[] = [];

  for (const si of scopeItems) {
    const floorMatch = si.description.match(FLOOR_RE);
    if (!floorMatch) {
      ungrouped.push(si);
      continue;
    }
    const floorName = floorMatch[1];
    const floorKey = floorName.toLowerCase();
    let floor = floorMap.get(floorKey);
    if (!floor) {
      floor = { key: floorKey, label: `${floorName} Floor`, order: floorOrder(floorName), amount: 0, flats: [] };
      floorMap.set(floorKey, floor);
    }
    floor.amount += si.amount || 0;

    const rest = si.description.slice(floorMatch[0].length).trim();
    const granular = rest.match(GRANULAR_RE);
    const isCombined = COMBINED_RE.test(rest);

    if (granular && !isCombined) {
      const flatNo = parseInt(granular[1], 10);
      const roomLabel = granular[2].trim();
      const flatKey = `flat-${flatNo}`;
      let flat = floor.flats.find(f => f.key === flatKey);
      if (!flat) {
        flat = { key: flatKey, label: `Flat ${flatNo}`, flatNo, amount: 0, rooms: [] };
        floor.flats.push(flat);
      }
      flat.amount += si.amount || 0;
      (flat.rooms as RoomNode[]).push({
        key: si._id, label: roomLabel, amount: si.amount || 0, scopeItem: si,
      });
    } else {
      // Old combined format (or anything under "...Floor" that doesn't match
      // the granular pattern) — one node per scopeItem, no fabricated split.
      floor.flats.push({
        key: si._id, label: si.description, flatNo: null, amount: si.amount || 0,
        rooms: null, scopeItem: si,
      });
    }
  }

  const floors = Array.from(floorMap.values()).sort((a, b) => a.order - b.order);
  for (const floor of floors) {
    floor.flats.sort((a, b) => {
      if (a.flatNo == null && b.flatNo == null) return 0;
      if (a.flatNo == null) return 1;
      if (b.flatNo == null) return -1;
      return a.flatNo - b.flatNo;
    });
  }

  return { floors, ungrouped };
}
