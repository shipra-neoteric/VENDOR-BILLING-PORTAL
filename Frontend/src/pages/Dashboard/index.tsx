import { Card, Col, Row, Statistic, Table, Tag } from "antd";
import {
  dashboardStats,
  bills,
  projects,
} from "../../services/mockData";

const currencyFormatter = (value: number) =>
  `₹${(value / 10000000).toFixed(2)} Cr`;

export default function Dashboard() {
  const recentBills = bills.map((bill) => ({
    key: bill.id,
    billNumber: bill.billNumber,
    amount: bill.amount,
    status: bill.status,
    billDate: bill.billDate,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Vendor Billing Dashboard
        </h1>

        <p className="text-gray-500 mt-2">
          Overview of contract value, bills,
          approvals and payments.
        </p>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Contract Value"
              value={currencyFormatter(
                dashboardStats.contractValue
              )}
            />
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Certified Amount"
              value={currencyFormatter(
                dashboardStats.certifiedAmount
              )}
            />
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Approved Amount"
              value={currencyFormatter(
                dashboardStats.approvedAmount
              )}
            />
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Paid Amount"
              value={currencyFormatter(
                dashboardStats.paidAmount
              )}
            />
          </Card>
        </Col>

        <Col xs={24} md={12} lg={8} xl={4}>
          <Card>
            <Statistic
              title="Outstanding"
              value={currencyFormatter(
                dashboardStats.outstandingAmount
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Projects Summary">
            <Table
              pagination={false}
              dataSource={projects}
              rowKey="id"
              columns={[
                {
                  title: "Project",
                  dataIndex: "name",
                },
                {
                  title: "Location",
                  dataIndex: "location",
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  render: (status: string) => (
                    <Tag color="green">
                      {status.toUpperCase()}
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Recent Bills">
            <Table
              pagination={false}
              dataSource={recentBills}
              rowKey="key"
              columns={[
                {
                  title: "Bill No",
                  dataIndex: "billNumber",
                },
                {
                  title: "Amount",
                  dataIndex: "amount",
                  render: (value: number) =>
                    `₹${value.toLocaleString()}`,
                },
                {
                  title: "Date",
                  dataIndex: "billDate",
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  render: (status: string) => {
                    const colors = {
                      submitted: "orange",
                      verified: "blue",
                      approved: "green",
                      paid: "cyan",
                      rejected: "red",
                      draft: "default",
                    };

                    return (
                      <Tag
                        color={
                          colors[
                          status as keyof typeof colors
                          ]
                        }
                      >
                        {status.toUpperCase()}
                      </Tag>
                    );
                  },
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
