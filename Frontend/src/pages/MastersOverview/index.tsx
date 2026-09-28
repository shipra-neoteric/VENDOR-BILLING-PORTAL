import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Crown } from "lucide-react";
import apiClient from "../../services/apiClient";
import Card from "../../ui/Card";
import { useAuth } from "../../context/AuthContext";
import { MASTERS_ITEMS } from "../../layouts/Sidebar/mastersNav";

// One accent colour per card, cycling — mirrors the reference Settings page
// where each tile's icon box has its own tint instead of everything sharing
// the same primary colour.
const ACCENTS = [
  { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-500" },
  { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-blue-500" },
  { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-500" },
  { bg: "bg-teal-50 dark:bg-teal-500/10", text: "text-teal-500" },
  { bg: "bg-rose-50 dark:bg-rose-500/10", text: "text-rose-500" },
  { bg: "bg-indigo-50 dark:bg-indigo-500/10", text: "text-indigo-500" },
  { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-500" },
];

// Landing page for the "Masters" admin section — one card per master-data
// page (Projects/Companies/Categories/Public Forms/SLA/Users/Backup), each
// just a shortcut into that EXISTING page (same routes as before this
// section existed). Counts are fetched from the same list endpoints those
// pages themselves already use — best-effort only (a failed/slow count
// still renders the card, just without a number) since this is a summary
// view, not something anything else depends on.
const COUNT_ENDPOINTS: Partial<Record<string, { url: string; key: string }>> = {
  "/projects": { url: "/projects", key: "projects" },
  "/companies": { url: "/companies", key: "companies" },
  "/categories": { url: "/categories", key: "categories" },
  "/users": { url: "/auth/users", key: "users" },
  "/sla-settings": { url: "/workflows/templates", key: "templates" },
};

export default function MastersOverview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let cancelled = false;
    MASTERS_ITEMS.forEach(item => {
      const endpoint = COUNT_ENDPOINTS[item.path];
      if (!endpoint) return;
      apiClient.get(endpoint.url)
        .then(res => { if (!cancelled) setCounts(c => ({ ...c, [item.path]: (res.data[endpoint.key] ?? []).length })); })
        .catch(() => { if (!cancelled) setCounts(c => ({ ...c, [item.path]: null })); });
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {user && (
        <Card className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
              {user.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">{user.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{user.email}</div>
            </div>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-wide shrink-0">
              <Crown className="w-3 h-3" /> {user.role}
            </span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MASTERS_ITEMS.map((item, i) => {
          const count = counts[item.path];
          const accent = ACCENTS[i % ACCENTS.length];
          return (
            <Card
              key={item.path}
              onClick={() => navigate(item.path)}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${accent.bg} ${accent.text} flex items-center justify-center shrink-0 [&_svg]:w-5 [&_svg]:h-5`}>
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">{item.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {count === undefined ? "Loading…" : count === null ? "Manage" : `${count} record${count === 1 ? "" : "s"}`}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
