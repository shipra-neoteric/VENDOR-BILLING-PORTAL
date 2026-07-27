import { Descriptions, Tag } from "antd";
import { LinkOutlined, LockOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import WorkOrderApprovalWorkflow from "./WorkOrderApprovalWorkflow";
import { getWorkOrderDocuments } from "./DocumentsUpload";
import type { WorkOrder, WorkOrderStatus } from "../types/VendorBilling";

const STATUS_CFG: Record<WorkOrderStatus, { color: string; label: string }> = {
  draft:         { color: "default", label: "Draft" },
  issued:        { color: "blue",    label: "Issued" },
  "in-progress": { color: "orange",  label: "In Progress" },
  completed:     { color: "green",   label: "Completed" },
  cancelled:     { color: "red",     label: "Cancelled" },
};

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

// The complete read side of a Work Order — Live Workflow, summary, billing
// tape, scope of work, payment milestones, warranty terms — shared verbatim
// between WorkItems' own quick-View drawer and any other place (e.g. Accounts
// Payment's WO quick-view) that needs the exact same detail, not a trimmed-down
// re-implementation that can drift out of sync with it.
export default function WorkOrderDetailView({
  workOrder, bills = [], onUpdated, readOnly = false,
}: {
  workOrder: WorkOrder;
  bills?: { status: string; amount: number }[];
  onUpdated?: (updated: WorkOrder) => void;
  readOnly?: boolean;
}) {
  const wo = workOrder;
  const contractVal = wo.contractValue ?? 0;
  const certifiedAmt = bills.filter(b => b.status === "approved" || b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const pendingAmt   = bills.filter(b => b.status === "submitted" || b.status === "verified").reduce((s, b) => s + b.amount, 0);
  const remaining    = Math.max(0, contractVal - certifiedAmt - pendingAmt);
  const certPct = contractVal > 0 ? (certifiedAmt / contractVal) * 100 : 0;
  const pendPct = contractVal > 0 ? (pendingAmt / contractVal) * 100 : 0;

  return (
    <>
      {/* ── Live Workflow — the same 4-level approval chain as the full page ── */}
      <div style={{ marginBottom: 20 }}>
        <WorkOrderApprovalWorkflow
          workOrder={{ ...wo, _id: wo.id }}
          onUpdated={(updated) => onUpdated?.(updated as unknown as WorkOrder)}
          readOnly={readOnly}
        />
      </div>

      <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
        <Descriptions.Item label="Work Order No">
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>
            {wo.workOrderNo}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Issue Date">
          {dayjs(wo.issueDate).format("DD MMM YYYY")}
        </Descriptions.Item>
        <Descriptions.Item label="Project">{wo.projectName}</Descriptions.Item>
        {wo.projectLocation && (
          <Descriptions.Item label="Location">{wo.projectLocation}</Descriptions.Item>
        )}
        <Descriptions.Item label="Status">
          <Tag color={STATUS_CFG[wo.status]?.color}>
            {STATUS_CFG[wo.status]?.label}
          </Tag>
          {wo.isLocked && (
            <Tag color="gold" icon={<LockOutlined />} style={{ marginLeft: 6 }}>Locked</Tag>
          )}
        </Descriptions.Item>
        {wo.isLocked && (
          <Descriptions.Item label="Locked" span={2}>
            <span style={{ color: "#9ba3b8", fontSize: 12 }}>
              Rates, scope items, milestones, and contract value cannot be edited until unlocked.
              {wo.lockedAt && ` (${dayjs(wo.lockedAt).format("DD MMM YYYY, hh:mm a")})`}
            </span>
          </Descriptions.Item>
        )}
        {wo.status === "cancelled" && (
          <Descriptions.Item label="Cancellation Remark" span={2}>
            <span style={{ color: "#cf1322" }}>{wo.cancelReason || "—"}</span>
            {wo.cancelledAt && (
              <span style={{ color: "#9ba3b8", marginLeft: 8, fontSize: 12 }}>
                ({dayjs(wo.cancelledAt).format("DD MMM YYYY, hh:mm a")})
              </span>
            )}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Vendor Code">
          <span style={{ fontFamily: "monospace", background: "#eff4ff", color: "#2563eb", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>
            {wo.vendorCode}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Company">{wo.vendorName}</Descriptions.Item>
        <Descriptions.Item label="Owner">{wo.ownerName}</Descriptions.Item>
        <Descriptions.Item label="Mobile">{wo.mobile}</Descriptions.Item>
        <Descriptions.Item label="Contract Value" span={2}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00", fontSize: 15 }}>
            {fmt(wo.contractValue)}
          </span>
        </Descriptions.Item>
        {getWorkOrderDocuments(wo).length > 0 && (
          <Descriptions.Item label="Documents" span={2}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {getWorkOrderDocuments(wo).map((d, i) => (
                <a key={i} href={d.url} target="_blank" rel="noreferrer" download={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <LinkOutlined /> {d.name}
                </a>
              ))}
            </div>
          </Descriptions.Item>
        )}
      </Descriptions>

      {/* ── Billing Summary ─────────────────────────────── */}
      <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 12 }}>Billing Summary</div>
        <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "#E5E7EB", marginBottom: 14 }}>
          {certPct > 0 && <div style={{ width: `${certPct}%`, background: "#16a34a" }} title={`Certified: ${fmt(certifiedAmt)}`} />}
          {pendPct > 0 && <div style={{ width: `${pendPct}%`, background: "#f59e0b" }} title={`Pending: ${fmt(pendingAmt)}`} />}
        </div>
        <div style={{ display: "flex", gap: 0, borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
          {[
            { label: "Contract Value", value: fmt(contractVal), color: "#374151", dot: "#6B7280" },
            { label: "Certified ✓", value: fmt(certifiedAmt), color: "#16a34a", dot: "#16a34a" },
            { label: "Pending ⏳", value: fmt(pendingAmt), color: "#d97706", dot: "#f59e0b" },
            { label: "Remaining", value: fmt(remaining), color: "#6B7280", dot: "#D1D5DB" },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : "center", borderRight: i < 3 ? "1px solid #E5E7EB" : "none", paddingRight: 12, paddingLeft: i > 0 ? 12 : 0 }}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3, display: "flex", alignItems: "center", gap: 5, justifyContent: i === 0 ? "flex-start" : "center" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
                {s.label}
              </div>
              <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scope of Work ────────────────────────────── */}
      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 13, color: "#374151" }}>
          Scope of Work
        </div>
        {wo.scopeItems.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No scope items defined</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Description", "Unit", "Planned Qty", "Rate", "Amount"].map(h => (
                    <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wo.scopeItems.map((si, i) => (
                  <tr key={si.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#111827" }}>{si.description}</td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{si.unit}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{si.plannedQty.toLocaleString("en-IN")}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{fmt(si.rate || 0)}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#FF7A00" }}>{fmt(si.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Payment Milestones ──────────────────────── */}
      {(wo.paymentMilestones?.length ?? 0) > 0 && (
        <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", marginTop: 16 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 13, color: "#374151" }}>
            Payment Milestones
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Type", "Date", "Mode", "Amount", "GST", "Payable"].map(h => (
                    <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wo.paymentMilestones!.map((m, i) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "9px 16px", fontSize: 13, color: "#111827" }}>{m.type}</td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{m.date ? dayjs(m.date).format("DD MMM YYYY") : "—"}</td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{m.mode}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{fmt(m.amount || 0)}</td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{m.gstPercent}%</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#FF7A00" }}>{fmt(m.payable || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Warranty Terms ──────────────────────────── */}
      {(wo.warrantyTerms?.length ?? 0) > 0 && (
        <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px", marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>Special Terms and Conditions</div>
          {wo.warrantyTerms!.map((t, i) => (
            <div key={i} style={{ fontSize: 13, color: "#374151", marginBottom: 4, display: "flex", gap: 6 }}>
              <span style={{ color: "#9CA3AF" }}>{i + 1}.</span> {t}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
