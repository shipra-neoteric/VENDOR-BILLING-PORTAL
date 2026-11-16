import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";
import dayjs from "dayjs";
import type { Performance, UserRow } from "../MisPerformance/shared";

// "IMS SLA MIS Report" layout: header band, 3 summary tiles, SLA by User, Weekly Breakdown (on-time vs late/breached, by user).
const NAVY = "#1F2937", ORANGE = "#FF7A00", GRAY = "#6B7280", BORDER = "#E5E7EB", HEAD = "#F3F4F6", ZEBRA = "#F9FAFB", DARK = "#111827";

const S = StyleSheet.create({
  page: { paddingTop: 30, paddingHorizontal: 30, paddingBottom: 46, fontSize: 9, fontFamily: "Helvetica", color: DARK, backgroundColor: "#fff" },
  band: { backgroundColor: NAVY, borderBottomWidth: 3, borderBottomColor: ORANGE, paddingVertical: 9, alignItems: "center" },
  bandText: { color: "#fff", fontSize: 9.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 14 },
  gen: { fontSize: 8.5, color: GRAY, textAlign: "center", marginTop: 4, marginBottom: 12 },
  tiles: { flexDirection: "row", borderWidth: 1, borderColor: BORDER, borderLeftWidth: 4, borderLeftColor: ORANGE, backgroundColor: ZEBRA, marginBottom: 16 },
  tile: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 1, borderRightColor: BORDER },
  tileLabel: { fontSize: 7.5, color: GRAY, letterSpacing: 0.3 },
  tileVal: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 3 },
  sec: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginBottom: 7 },
  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 18 },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  thead: { flexDirection: "row", backgroundColor: HEAD },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", paddingVertical: 7, paddingHorizontal: 6 },
  td: { fontSize: 8.5, paddingVertical: 7, paddingHorizontal: 6 },
  footer: { position: "absolute", left: 30, right: 30, bottom: 18, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: GRAY, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 5 },
});

const pct = (n: number, of: number) => (of > 0 ? `${(Math.round((n / of) * 1000) / 10).toFixed(1)}%` : "0.0%");
const dmy = (d: dayjs.Dayjs) => d.format("D/M/YYYY");

// ISO week number of a date (Monday-based; same numbering the reference report uses)
function isoWeek(d: dayjs.Dayjs): number {
  const t = new Date(Date.UTC(d.year(), d.month(), d.date()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - y0) / 86400000 + 1) / 7);
}

function Row({ cells, widths, zebra, head }: { cells: string[]; widths: number[]; zebra?: boolean; head?: boolean }) {
  return (
    <View style={[head ? S.thead : S.tr, zebra ? { backgroundColor: ZEBRA } : {}]} wrap={false}>
      {cells.map((c, i) => <Text key={i} style={[head ? S.th : S.td, { width: `${widths[i]}%` }]}>{c}</Text>)}
    </View>
  );
}

// Shared by the PDF and the on-screen MIS Report page so both show the same numbers.
export function buildSlaReport(d: Performance, perBlock = 4) {
  const users: UserRow[] = d.users.filter(u => u.userId !== "unassigned" && u.planned > 0).sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  const total = users.reduce((s, u) => s + u.planned, 0);
  const completed = users.reduce((s, u) => s + u.onTime, 0);
  const breached = total - completed;
  // SLA by User: Done On Time / Done Late are shares of Work Done, Work Not Done is a share of Total, Rate % = (On Time − Total) ÷ Total
  const slaRows = users.map(u => [
    u.name, String(u.planned), String(u.done),
    `${u.onTime} (${pct(u.onTime, u.done)})`, `${u.late} (${pct(u.late, u.done)})`, `${u.notDone} (${pct(u.notDone, u.planned)})`,
    u.planned ? `${(Math.round(((u.onTime - u.planned) / u.planned) * 1000) / 10).toFixed(1)}%` : "—",
  ]);
  // Weekly Breakdown: weeks that have any work, split into blocks so the columns stay readable
  const weekKeys = [...new Set(users.flatMap(u => Object.keys(u.weeks || {})))].sort();
  const blocks: string[][] = [];
  for (let i = 0; i < Math.max(1, weekKeys.length); i += perBlock) blocks.push(weekKeys.slice(i, i + perBlock));
  const wkLabel = (k: string) => { const s = dayjs(k); return `Week ${isoWeek(s)} (${dmy(s)} – ${dmy(s.add(6, "day"))})`; };
  const byName = [...users].sort((a, b) => a.name.localeCompare(b.name));
  return { users, total, completed, breached, slaRows, blocks, wkLabel, byName };
}

export function MisReportDocument({ d }: { d: Performance; preparedBy: string }) {
  const gen = dayjs(d.meta.generatedAt).format("DD/MM/YYYY, HH:mm");
  const { total, completed, breached, slaRows, blocks, wkLabel, byName } = buildSlaReport(d);
  const SW = [22, 10, 12, 17, 15, 14, 10];

  return (
    <Document title="SLA MIS Report">
      <Page size="A4" style={S.page} wrap>
        <View style={S.band}><Text style={S.bandText}>VENDOR MANAGEMENT SYSTEM</Text></View>
        <Text style={S.title}>VMS SLA MIS Report</Text>
        <Text style={S.gen}>Generated: {gen}</Text>

        <View style={S.tiles} wrap={false}>
          <View style={S.tile}><Text style={S.tileLabel}>TOTAL CASES</Text><Text style={S.tileVal}>{total}</Text></View>
          <View style={S.tile}><Text style={S.tileLabel}>COMPLETED</Text><Text style={S.tileVal}>{completed}</Text></View>
          <View style={[S.tile, { borderRightWidth: 0 }]}><Text style={S.tileLabel}>BREACHED</Text><Text style={S.tileVal}>{breached}</Text></View>
        </View>

        <Text style={S.sec}>SLA by User</Text>
        <View style={S.table}>
          <Row head widths={SW} cells={["User", "Total", "Work Done", "Done On Time", "Done Late", "Work Not Done", "Rate %"]} />
          {slaRows.map((r, i) => <Row key={i} widths={SW} cells={r} zebra={i % 2 === 1} />)}
        </View>

        <Text style={S.sec}>Weekly Breakdown — On-Time vs Late/Breached (by User)</Text>
        {blocks.map((blk, bi) => {
          const last = bi === blocks.length - 1;
          const nCols = blk.length * 2 + (last ? 2 : 0);
          const first = 16, w = (100 - first) / Math.max(1, nCols);
          const widths = [first, ...Array.from({ length: nCols }, () => w)];
          const heads = ["Executive", ...blk.flatMap(k => [`${wkLabel(k)} — On-Time`, `${wkLabel(k)} — Late/Breached`]), ...(last ? ["Total On-Time", "Total Late/ Breached"] : [])];
          return (
            <View key={bi} style={S.table}>
              <Row head widths={widths} cells={heads} />
              {byName.map((u, i) => {
                const cells = [u.name, ...blk.flatMap(k => { const x = u.weeks?.[k]; return [String(x?.onTime || 0), String((x?.planned || 0) - (x?.onTime || 0))]; })];
                if (last) cells.push(String(u.onTime), String(u.planned - u.onTime));
                return <Row key={u.userId} widths={widths} cells={cells} zebra={i % 2 === 1} />;
              })}
            </View>
          );
        })}

        <View style={S.footer} fixed>
          <Text>Generated: {gen}</Text>
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
  a.download = `vms-sla-mis-report-${d.meta.from}-to-${d.meta.to}.pdf`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
