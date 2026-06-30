import { Table } from "antd";
import dayjs from "dayjs";
import StatusTag from "../../../shared/components/StatusTag";
import type { BillRow } from "../utils";
import { getRecentBills, fmt } from "../utils";

interface Props { bills: BillRow[]; }

const columns = [
  {
    title: "Bill No", dataIndex: "billNo",
    render: (v: string) => <span style={{ fontFamily: "monospace", color: "#FF7A00", fontWeight: 600 }}>{v}</span>,
  },
  { title: "Vendor", dataIndex: "vendorName", ellipsis: true },
  {
    title: "Amount", dataIndex: "amount",
    render: (v: number) => <span style={{ fontFamily: "monospace" }}>{fmt(v ?? 0)}</span>,
  },
  {
    title: "Date", dataIndex: "billDate",
    render: (v: string) => v ? dayjs(v).format("DD MMM YYYY") : "—",
  },
  {
    title: "Status", dataIndex: "status",
    render: (s: string) => <StatusTag status={s} />,
  },
];

export function RecentBillsTable({ bills }: Props) {
  const recent = getRecentBills(bills);
  return (
    <Table
      pagination={false}
      dataSource={recent}
      rowKey="_id"
      size="small"
      columns={columns}
      locale={{ emptyText: "No bills raised yet" }}
    />
  );
}
