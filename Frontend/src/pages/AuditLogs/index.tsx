import { useEffect, useState } from "react";
import { Select, DatePicker, Table, Tag, Input, Empty } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";

// ── Types ─────────────────────────────────────────────────────────────────────
type Action = "LOGIN" | "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT";

interface LogRow {
  _id: string;
  action: Action;
  module: string;
  userName?: string;
  userEmail?: string;
  description: string;
  entityLabel?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  ip?: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ACTION_CFG: Record<Action, string> = {
  LOGIN:   "default",
  CREATE:  "green",
  UPDATE:  "blue",
  DELETE:  "red",
  APPROVE: "gold",
  REJECT:  "volcano",
};

const MODULE_LABELS: Record<string, string> = {
  auth: "Auth",
  "work-orders": "Work Orders",
  "bill-requests": "Bill Requests",
  "billing-payments": "Billing & Payments",
  "user-management": "Users",
  "advance-payments": "Advance Payments",
};

const fmtVal = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export default function AuditLogs() {
  const [logs, setLogs]       = useState<LogRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [modules, setModules] = useState<string[]>([]);

  const [moduleFilter, setModuleFilter] = useState<string | undefined>(undefined);
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo,   setDateTo]   = useState<dayjs.Dayjs | null>(null);
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const pageSize = 50;

  useEffect(() => {
    apiClient.get("/audit-logs/modules").then(res => setModules(res.data.modules ?? [])).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    apiClient
      .get("/audit-logs", {
        params: {
          module: moduleFilter,
          action: actionFilter,
          dateFrom: dateFrom ? dateFrom.format("YYYY-MM-DD") : undefined,
          dateTo:   dateTo   ? dateTo.format("YYYY-MM-DD")   : undefined,
          search: search || undefined,
          page,
          limit: pageSize,
        },
      })
      .then(res => {
        setLogs(res.data.logs ?? []);
        setTotal(res.data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [moduleFilter, actionFilter, dateFrom, dateTo, search, page]);

  const columns: ColumnsType<LogRow> = [
    {
      title: "Action", dataIndex: "action", width: 110,
      render: (a: Action) => <Tag color={ACTION_CFG[a]} style={{ fontWeight: 700, fontSize: 11 }}>{a}</Tag>,
    },
    {
      title: "Module", dataIndex: "module", width: 150,
      render: (m: string) => <span style={{ fontSize: 12.5, color: "var(--nx-text-2)" }}>{MODULE_LABELS[m] || m}</span>,
    },
    {
      title: "User", dataIndex: "userName", width: 190,
      render: (_: unknown, row: LogRow) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.userName || "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--nx-text-muted)" }}>{row.userEmail}</div>
        </div>
      ),
    },
    {
      title: "Description", dataIndex: "description",
      render: (d: string) => <span style={{ fontSize: 13, color: "var(--nx-text)" }}>{d}</span>,
    },
    {
      title: "Date / IP", dataIndex: "createdAt", width: 170,
      render: (d: string, row: LogRow) => (
        <div>
          <div style={{ fontSize: 12.5 }}>{dayjs(d).format("DD MMM YYYY, hh:mm a")}</div>
          <div style={{ fontSize: 11, color: "var(--nx-text-muted)", fontFamily: "monospace" }}>{row.ip || "—"}</div>
        </div>
      ),
    },
  ];

  return (
    <PageShell title="Audit Logs" description="Complete record of who did what, and when — every approval, edit, and login across the system.">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <Select
          allowClear placeholder="All Modules" style={{ width: 170 }}
          value={moduleFilter} onChange={v => { setModuleFilter(v); setPage(1); }}
          options={modules.map(m => ({ label: MODULE_LABELS[m] || m, value: m }))}
        />
        <Select
          allowClear placeholder="All Actions" style={{ width: 150 }}
          value={actionFilter} onChange={v => { setActionFilter(v); setPage(1); }}
          options={(Object.keys(ACTION_CFG) as Action[]).map(a => ({ label: a, value: a }))}
        />
        <DatePicker placeholder="From date" format="DD/MM/YYYY" value={dateFrom} onChange={d => { setDateFrom(d); setPage(1); }} />
        <DatePicker placeholder="To date" format="DD/MM/YYYY" value={dateTo} onChange={d => { setDateTo(d); setPage(1); }} />
        <Input.Search
          placeholder="Search description, user, or record…" style={{ width: 260 }}
          allowClear onSearch={v => { setSearch(v); setPage(1); }}
        />
      </div>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={logs}
        loading={loading}
        locale={{ emptyText: <Empty description="No audit log entries match these filters" /> }}
        expandable={{
          rowExpandable: row => !!row.changes,
          expandedRowRender: row => (
            <div style={{ padding: "4px 12px", fontSize: 12.5 }}>
              {Object.entries(row.changes || {}).map(([field, c]) => (
                <div key={field} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <strong style={{ minWidth: 140 }}>{field}</strong>
                  <span style={{ color: "var(--nx-text-muted)" }}>{fmtVal(c.from)}</span>
                  <span>→</span>
                  <span style={{ color: "var(--nx-text)", fontWeight: 600 }}>{fmtVal(c.to)}</span>
                </div>
              ))}
            </div>
          ),
        }}
        pagination={{
          current: page, pageSize, total,
          onChange: setPage,
          showTotal: t => `${t} log entries`,
        }}
        style={{ background: "var(--nx-white)", borderRadius: 12, overflow: "hidden" }}
      />
    </PageShell>
  );
}
