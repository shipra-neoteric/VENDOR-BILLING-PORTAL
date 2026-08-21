import toast from "react-hot-toast";
import { Copy, ExternalLink, FileText, Users, ClipboardList, GitCompare, BookOpen, PenTool, Link2, Share2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import Card from "../../ui/Card";
import NxBadge from "../../ui/nexora/Badge";

interface PublicFormDef {
  key: string;
  name: string;
  description: string;
  path: string;
  icon: LucideIcon;
  color: string;
  // True for links scoped to one record (e.g. a single work order) rather than
  // a single fixed generic URL — there's nothing to copy/open here, the actual
  // link is generated per-record from its own page instead.
  perRecord?: boolean;
}

const FORMS: PublicFormDef[] = [
  {
    key: "work-order",
    name: "New Work Order",
    description: "Lets anyone with the link submit a new work order request — no login required. Submissions land directly in Work Orders.",
    path: "/public/work-order",
    icon: FileText,
    color: "#2563eb",
  },
  {
    key: "contractor",
    name: "Contractor Registration",
    description: "Lets a new vendor register themselves — no login required. Submissions land directly in Contractors with an auto-assigned vendor code.",
    path: "/public/contractor",
    icon: Users,
    color: "#16a34a",
  },
  {
    key: "consultant",
    name: "Consultant Registration",
    description: "Lets a new architect, designer, or professional-services firm register themselves — no login required. Submissions land directly in Consultants with an auto-assigned consultant code.",
    path: "/public/consultant",
    icon: BookOpen,
    color: "#7c3aed",
  },
  {
    key: "daily-progress-report",
    name: "Daily Progress Report",
    description: "End-of-day site report — work-type checklist with photo evidence per category, contractor, shift, and labour count. No login required; DRIs can also submit this from their own dashboard.",
    path: "/public/daily-progress-report",
    icon: ClipboardList,
    color: "#4f46e5",
  },
  {
    key: "drawing-request",
    name: "Drawing Request",
    description: "Lets anyone on site ask Planning/Design for a drawing — no login required. Submissions land directly in Drawing Requests with an auto-assigned ticket number.",
    path: "/public/drawing-request",
    icon: PenTool,
    color: "#7c3aed",
  },
  {
    key: "quotation",
    name: "Contractor Quotation",
    description: "Lets a contractor submit a competing quote against one specific draft work order — no login required. Each link is scoped to a single work order; generate one from Quotation Comparison.",
    path: "/quotation-comparison",
    icon: GitCompare,
    color: "#7c3aed",
    perRecord: true,
  },
];

export default function PublicForms() {
  const origin = window.location.origin;

  const copyLink = async (path: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy — copy it manually from the address bar");
    }
  };

  return (
    <div>
      <PageHeader
        title="Public Forms"
        subtitle="Shareable, no-login forms that write straight into this system — send the link to anyone outside your team."
        icon={Share2}
      />

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {FORMS.map(f => {
          const Icon = f.icon;
          return (
            <Card key={f.key} className="relative overflow-hidden hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: f.color }} />

              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: `${f.color}15`, color: f.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <NxBadge color="green">● Live</NxBadge>
              </div>

              <div className="font-bold text-[17px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-1.5">{f.name}</div>
              <div className="text-[13px] text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                {f.description}
              </div>

              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 mb-4">
                <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">
                  {f.perRecord ? `${origin}/public/quotation/<work order id>` : `${origin}${f.path}`}
                </span>
              </div>

              {f.perRecord ? (
                <NxBtn
                  color="primary"
                  label="Go to Quotation Comparison"
                  icon={ExternalLink}
                  className="w-full"
                  style={{ backgroundColor: f.color }}
                  onClick={() => window.open(f.path, "_blank", "noopener,noreferrer")}
                />
              ) : (
                <div className="flex gap-2">
                  <NxBtn
                    color="primary"
                    label="Copy Link"
                    icon={Copy}
                    className="flex-[2_1_auto]"
                    style={{ backgroundColor: f.color }}
                    onClick={() => copyLink(f.path)}
                  />
                  <NxBtn
                    color="secondary"
                    label="Open"
                    icon={ExternalLink}
                    className="flex-[1_1_auto]"
                    onClick={() => window.open(f.path, "_blank", "noopener,noreferrer")}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
