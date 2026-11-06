import { Document, Page, View, Text, Svg, G, Rect, Line, Polyline, StyleSheet, pdf } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import dayjs from "dayjs";
import { fmtDuration, fmtGap, fmtNum, fmtPct, type Performance, type Stats } from "../MisPerformance/shared";

const ORANGE = "#FF7A00", DARK = "#111827", GRAY = "#6B7280", BORDER = "#E5E7EB", SOFT = "#FFF3E6", HEAD = "#F3F4F6", RED = "#DC2626", GREEN = "#16A34A";

const S = StyleSheet.create({
  page: { paddingTop: 30, paddingHorizontal: 30, paddingBottom: 46, fontSize: 8.5, fontFamily: "Helvetica", color: DARK, backgroundColor: "#fff" },
  kicker: { fontSize: 8, color: ORANGE, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 3 },
  period: { fontSize: 10, color: GRAY, marginTop: 3, marginBottom: 12 },
  metaRow: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER, paddingVertical: 7, marginBottom: 12 },
  metaCell: { flex: 1, paddingRight: 8 },
  metaLabel: { fontSize: 6.5, color: GRAY, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  metaVal: { fontSize: 8.5, marginTop: 2 },
  tiles: { flexDirection: "row", marginBottom: 14 },
  tile: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 9, marginRight: 8 },
  tileLabel: { fontSize: 6.5, color: GRAY, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  tileVal: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 3 },
  tileSub: { fontSize: 7, color: GRAY, marginTop: 2 },
  secRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 5, marginTop: 4 },
  secTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.8 },
  secHint: { fontSize: 7.5, color: GRAY },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3, marginBottom: 12 },
  thead: { flexDirection: "row", backgroundColor: HEAD },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  trSub: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: SOFT },
  trTotal: { flexDirection: "row", borderTopWidth: 1.5, borderTopColor: DARK, backgroundColor: HEAD },
  th: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: GRAY, paddingVertical: 5, paddingHorizontal: 4, textTransform: "uppercase" },
  td: { fontSize: 8, paddingVertical: 4, paddingHorizontal: 4 },
  notes: { borderWidth: 1, borderColor: BORDER, borderRadius: 3, backgroundColor: "#FAFAFA", padding: 8, marginTop: 4 },
  notesTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 3 },
  notesText: { fontSize: 7.5, color: GRAY, lineHeight: 1.45 },
  footer: { position: "absolute", left: 30, right: 30, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: GRAY, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 5 },
});

const left = { textAlign: "left" as const }, right = { textAlign: "right" as const };
const gapColor = (g: number | null) => (g === null ? GRAY : g >= 0 ? GREEN : RED);

function Cells({ widths, cells, style, bold }: { widths: number[]; cells: (string | number)[]; style: Style; bold?: boolean }) {
  return (
    <View style={style} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={[S.td, { width: `${widths[i]}%` }, i < 2 ? left : right, bold ? { fontFamily: "Helvetica-Bold" } : {}]}>{String(c)}</Text>
      ))}
    </View>
  );
}
const statCells = (x: Stats) => [fmtNum(x.planned), fmtNum(x.done), fmtNum(x.notDone), fmtNum(x.onTime), fmtNum(x.late), fmtPct(x.completionPct), fmtNum(x.difference), fmtGap(x.gapPct)];

function Head({ widths, labels }: { widths: number[]; labels: string[] }) {
  return (
    <View style={S.thead} fixed>
      {labels.map((l, i) => <Text key={i} style={[S.th, { width: `${widths[i]}%` }, i < 2 ? left : right]}>{l}</Text>)}
    </View>
  );
}

// Planned (light) vs Work Done (orange) per period, with the completion % line — drawn with SVG primitives so it prints crisply.
function PdfChart({ rows }: { rows: Performance["rows"] }) {
  const W = 535, H = 150, padL = 26, padB = 28, padT = 8, padR = 8;
  const max = Math.max(1, ...rows.flatMap(r => [r.planned, r.done]));
  const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(max))) / (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 1 : 2));
  const top = Math.ceil(max / step) * step;
  const iw = W - padL - padR, ih = H - padT - padB;
  const slot = iw / Math.max(1, rows.length);
  const bw = Math.min(14, slot / 2.6);
  const y = (v: number) => padT + ih - (v / top) * ih;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const line = rows.map((r, i) => (r.completionPct === null ? null : `${padL + slot * i + slot / 2},${padT + ih - (r.completionPct / 100) * ih}`)).filter(Boolean).join(" ");
  return (
    <Svg width={W} height={H}>
      {ticks.map(t => (
        <G key={t}>
          <Line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={BORDER} strokeWidth={0.5} />
        </G>
      ))}
      {rows.map((r, i) => {
        const cx = padL + slot * i + slot / 2;
        return (
          <G key={r.key}>
            <Rect x={cx - bw - 1} y={y(r.planned)} width={bw} height={Math.max(0, padT + ih - y(r.planned))} fill="#FDD7B0" />
            <Rect x={cx + 1} y={y(r.done)} width={bw} height={Math.max(0, padT + ih - y(r.done))} fill={ORANGE} />
          </G>
        );
      })}
      {line && <Polyline points={line} stroke={DARK} strokeWidth={1.2} fill="none" />}
    </Svg>
  );
}

function Labels({ rows, groupBy }: { rows: Performance["rows"]; groupBy: "week" | "month" }) {
  const padL = 26, W = 535, padR = 8, slot = (W - padL - padR) / Math.max(1, rows.length);
  return (
    <View style={{ flexDirection: "row", marginLeft: padL, marginTop: -26, marginBottom: 6 }}>
      {rows.map(r => (
        <Text key={r.key} style={{ width: slot, fontSize: rows.length > 14 ? 5.5 : 6.5, color: GRAY, textAlign: "center" }}>
          {groupBy === "month" ? r.label.slice(0, 3) + " " + r.label.slice(-2) : `${r.monthLabel.slice(0, 3)} W${r.weekNo}`}
        </Text>
      ))}
    </View>
  );
}

export function MisReportDocument({ d, preparedBy }: { d: Performance; preparedBy: string }) {
  const unit = d.meta.groupBy === "month" ? "Month" : "Week";
  const f = d.meta.filters;
  const k = d.kpis;
  const gen = dayjs(d.meta.generatedAt).format("DD MMM YYYY, hh:mm a");
  const periodText = `${dayjs(d.meta.from).format("DD-MMM-YYYY")} – ${dayjs(d.meta.to).format("DD-MMM-YYYY")}`;
  const BW = [13, 25, 8, 9, 8, 8, 7, 9, 8, 9];
  const heads = ["Month", unit, "Planned", "Work Done", "Not Done", "On Time", "Late", "Completion", "Difference", "MIS (Gap)"];
  const DW = [30, 7, 9, 9, 9, 8, 8, 10, 10];
  const UW = [12.5, 8, 7, 7, 7, 7.5, 8, 7.5, 8.5, 8.5, 8.5, 10];
  const sumW = (a: number, b: number) => UW.slice(a, b).reduce((x, y) => x + y, 0);
  const userGroups = [{ label: "User Details", width: sumW(0, 2) }, { label: "Work Summary", width: sumW(2, 5) }, { label: "SLA Breakdown", width: sumW(5, 8) }, { label: "Performance", width: sumW(8, 11) }, { label: "Productivity", width: sumW(11, 12) }];
  return (
    <Document title={`${unit}ly MIS Report`}>
      <Page size="A4" style={S.page} wrap>
        <Text style={S.kicker}>MIS REPORT · USER PERFORMANCE</Text>
        <Text style={S.title}>{unit}ly MIS Reports</Text>
        <Text style={S.period}>{periodText}</Text>

        <View style={S.metaRow}>
          {[["REPORTING PERIOD", periodText], ["GROUPED BY", unit], ["DEPARTMENT", f.department || "All"], ["USER / ROLE", `${f.userName || "All users"} / ${f.role || "All roles"}`], ["PREPARED BY", preparedBy], ["GENERATED ON", gen]].map(([l, v]) => (
            <View key={l} style={S.metaCell}><Text style={S.metaLabel}>{l}</Text><Text style={S.metaVal}>{v}</Text></View>
          ))}
        </View>

        <View style={S.tiles} wrap={false}>
          <View style={S.tile}><Text style={S.tileLabel}>PLANNED</Text><Text style={S.tileVal}>{fmtNum(k.planned)}</Text><Text style={S.tileSub}>Stages due in the period</Text></View>
          <View style={S.tile}><Text style={S.tileLabel}>WORK DONE</Text><Text style={[S.tileVal, { color: GREEN }]}>{fmtNum(k.done)}</Text><Text style={S.tileSub}>{fmtPct(k.completionPct)} completion · {fmtNum(k.onTime)} on time, {fmtNum(k.late)} late</Text></View>
          <View style={S.tile}><Text style={S.tileLabel}>DIFFERENCE</Text><Text style={S.tileVal}>{fmtNum(k.difference)}</Text><Text style={S.tileSub}>Not done · {fmtNum(k.overdue)} overdue, {fmtNum(k.breached)} SLA breached</Text></View>
          <View style={[S.tile, { marginRight: 0 }]}><Text style={S.tileLabel}>MIS (GAP)</Text><Text style={[S.tileVal, { color: gapColor(k.gapPct) }]}>{fmtGap(k.gapPct)}</Text><Text style={S.tileSub}>{k.planned ? `Achieved ${fmtPct(k.completionPct)} of plan` : "No planned work"}</Text></View>
        </View>

        <View wrap={false}>
          <View style={S.secRow}><Text style={S.secTitle}>WORK DONE VS PLAN</Text><Text style={S.secHint}>{d.rows.length} {unit.toLowerCase()}s · light = planned, orange = work done, line = completion %</Text></View>
          <PdfChart rows={d.rows} />
          <Labels rows={d.rows} groupBy={d.meta.groupBy} />
        </View>

        <View style={S.secRow}><Text style={S.secTitle}>DETAILED BREAKDOWN</Text><Text style={S.secHint}>Totals in the last row</Text></View>
        <View style={S.table}>
          <Head widths={BW} labels={heads} />
          {d.meta.groupBy === "week"
            ? d.groups.map(g => (
              <View key={g.monthKey}>
                {g.rows.map((r, i) => <Cells key={r.key} widths={BW} style={S.tr} cells={[i === 0 ? g.monthLabel : "", r.label, ...statCells(r)]} />)}
                <Cells widths={BW} style={S.trSub} bold cells={["", `${g.monthLabel} total`, ...statCells(g.total)]} />
              </View>
            ))
            : d.rows.map(r => <Cells key={r.key} widths={BW} style={S.tr} cells={["", r.label, ...statCells(r)]} />)}
          <Cells widths={BW} style={S.trTotal} bold cells={["", `Total ${unit}s`, ...statCells(d.total)]} />
        </View>

        <View break>
          <View style={S.secRow}><Text style={S.secTitle}>DEPARTMENT-WISE PERFORMANCE</Text><Text style={S.secHint}>Overall completion {fmtPct(d.departmentAverage.weightedCompletionPct)} weighted · {fmtPct(d.departmentAverage.meanCompletionPct)} mean</Text></View>
          <View style={S.table}>
            <Head widths={DW} labels={["Department", "Users", "Planned", "Work Done", "Not Done", "On Time", "Late", "Completion", "MIS (Gap)"]} />
            {d.departments.map(r => <Cells key={r.name} widths={DW} style={S.tr} cells={[r.name, r.users || "—", fmtNum(r.planned), fmtNum(r.done), fmtNum(r.notDone), fmtNum(r.onTime), fmtNum(r.late), fmtPct(r.completionPct), fmtGap(r.gapPct)]} />)}
            <Cells widths={DW} style={S.trTotal} bold cells={["Overall average", fmtNum(d.departmentAverage.avgUsersPerDept), fmtNum(d.departmentAverage.avgPlanned), fmtNum(d.departmentAverage.avgDone), "", "", "", fmtPct(d.departmentAverage.weightedCompletionPct), ""]} />
          </View>

          <View style={S.secRow}><Text style={S.secTitle}>USER-WISE PERFORMANCE</Text><Text style={S.secHint}>Average per user: {fmtNum(d.userAverage.avgPlanned)} planned · {fmtNum(d.userAverage.avgDone)} done · avg TAT {fmtDuration(d.userAverage.avgTatMinutes)}</Text></View>
          <View style={S.table}>
            <View style={[S.thead, { backgroundColor: SOFT }]} fixed>
              {userGroups.map(g => <Text key={g.label} style={[S.th, { width: `${g.width}%`, textAlign: "center", color: DARK }]}>{g.label}</Text>)}
            </View>
            <Head widths={UW} labels={["User", "Role", "Planned", "Work Done", "Not Done", "Done On Time", "Done Not On Time", "SLA Breached", "% Not Done", "% On Time", "% Not On Time", "Avg TAT"]} />
            {d.users.filter(r => r.userId !== "unassigned").map(r => <Cells key={r.userId} widths={UW} style={S.tr} cells={[r.name, r.role || "—", fmtNum(r.planned), fmtNum(r.done), fmtNum(r.notDone), fmtNum(r.onTime), fmtNum(r.late), fmtNum(r.breached), fmtPct(r.notDonePct), fmtPct(r.onTimePct), fmtPct(r.latePct), fmtDuration(r.avgTatMinutes)]} />)}
            <Cells widths={UW} style={S.trTotal} bold cells={["Average per user", "", fmtNum(d.userAverage.avgPlanned), fmtNum(d.userAverage.avgDone), fmtNum(d.userAverage.avgNotDone), fmtNum(d.userAverage.avgOnTime), fmtNum(d.userAverage.avgLate), fmtNum(d.userAverage.avgBreached), fmtPct(d.userAverage.weightedNotDonePct), fmtPct(d.userAverage.weightedOnTimePct), fmtPct(d.userAverage.weightedLatePct), fmtDuration(d.userAverage.avgTatMinutes)]} />
            {d.users.some(r => r.userId === "unassigned") && (
              <View>
                <View style={[S.tr, { backgroundColor: HEAD }]} wrap={false}><Text style={[S.td, { fontSize: 7, color: GRAY, fontFamily: "Helvetica-Bold" }]}>UNASSIGNED — stages assigned to a role only (not part of the averages above)</Text></View>
                {d.users.filter(r => r.userId === "unassigned").map(r => <Cells key={r.userId} widths={UW} style={S.tr} cells={[r.name, r.role || "—", fmtNum(r.planned), fmtNum(r.done), fmtNum(r.notDone), fmtNum(r.onTime), fmtNum(r.late), fmtNum(r.breached), fmtPct(r.notDonePct), fmtPct(r.onTimePct), fmtPct(r.latePct), fmtDuration(r.avgTatMinutes)]} />)}
              </View>
            )}
          </View>

          <View style={S.notes} wrap={false}>
            <Text style={S.notesTitle}>NOTES · HOW TO READ THIS REPORT</Text>
            <Text style={S.notesText}>
              Planned = approval stages (Work Order / Bill Request workflows) whose SLA due time falls in the {unit.toLowerCase()}; only stages already due are counted against the plan.
              Work Done = those stages that were completed; Not Done = Planned − Work Done. On Time = completed within the SLA; Late = completed after the due time;
              SLA Breached = Late + still open past the due time. Completion % = Work Done ÷ Planned. Difference = Planned − Work Done.
              MIS (Gap) = (Work Done − Planned) ÷ Planned — a minus sign means behind plan, a plus sign ahead.
              A week belongs to the month its Monday falls in. Dates are IST. Admin and DRI 1 accounts are left out; stages assigned to a role only appear as Unassigned.
            </Text>
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text>Neoteric Properties · Confidential — for internal use only</Text>
          <Text>Generated {gen} by {preparedBy}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadMisReportPdf(d: Performance, preparedBy: string) {
  const blob = await pdf(<MisReportDocument d={d} preparedBy={preparedBy} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mis-${d.meta.groupBy}ly-report-${d.meta.from}-to-${d.meta.to}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
