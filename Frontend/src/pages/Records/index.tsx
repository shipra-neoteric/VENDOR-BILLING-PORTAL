import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Archive } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../ui/PageHeader";
import RecycleBinPanel from "../RecycleBin";
import { ArchivedPanel, CancelledPanel, RejectedPanel } from "./panels";

type Tab = "deleted" | "archived" | "cancelled" | "rejected";
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "deleted",   label: "Deleted",   hint: "Deleted work orders, contractors, advance slips, bills and bill requests — restore any of them." },
  { key: "archived",  label: "Archived",  hint: "Archived bills, bill requests and advance slips — bring them back to the normal lists." },
  { key: "cancelled", label: "Cancelled", hint: "Cancelled work orders — reactivate one if it was cancelled by mistake." },
  { key: "rejected",  label: "Rejected",  hint: "Rejected bills and bill requests — delete the ones nobody needs (a copy stays in Deleted)." },
];

// Masters → Records: one Admin-only place to manage everything that has been taken out of the
// normal lists. Admin/owner only: RequireModule("recycle-bin") gates the route, this check is
// defense in depth, and every /api/records + /api/recycle-bin route is owner-only server-side.
export default function Records() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as Tab) || "deleted";
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initial) ? initial : "deleted");
  // Bumped when something is deleted from the Rejected tab so the Deleted tab reloads when opened.
  const [deletedVersion, setDeletedVersion] = useState(0);
  if (user?.role !== "owner") return <Navigate to="/" replace />;

  const pick = (t: Tab) => { setTab(t); setParams({ tab: t }, { replace: true }); };
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div>
      <PageHeader icon={Archive} title="Records" subtitle={active.hint} />
      <div className="mb-4 overflow-x-auto">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700/40 overflow-hidden" role="tablist" aria-label="Records">
          {TABS.map((t) => (
            <button
              key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => pick(t.key)}
              className={`px-4 py-2 text-[12.5px] font-semibold whitespace-nowrap ${tab === t.key ? "bg-primary text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "deleted"   && <RecycleBinPanel key={deletedVersion} />}
      {tab === "archived"  && <ArchivedPanel />}
      {tab === "cancelled" && <CancelledPanel />}
      {tab === "rejected"  && <RejectedPanel onDeleted={() => setDeletedVersion((v) => v + 1)} />}
    </div>
  );
}
