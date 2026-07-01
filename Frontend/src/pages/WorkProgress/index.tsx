import { useState, useEffect, useCallback } from "react";
import {
  Select, Button, Collapse, Table, Modal, Form, Input, InputNumber,
  Progress, Tag, Tabs, Card, Tooltip, message, Spin, Empty, DatePicker, Badge,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined, CheckCircleFilled, ClockCircleOutlined, TrophyFilled,
  CloseCircleFilled, FieldTimeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";

dayjs.extend(isoWeek);

const { Option } = Select;
const { Panel } = Collapse;
const { TabPane } = Tabs;

// ── Types ────────────────────────────────────────────────────────────────────
interface Project  { _id: string; name: string; code: string; }
interface Category { _id: string; name: string; color: string; }
interface WorkOrder { _id: string; workOrderNo: string; vendorName: string; contractValue: number; category: string; }
interface Stage    {
  _id: string; name: string; sequence: number; description?: string;
  progress: number; activityCount: number; categoryId: { _id: string; name: string; color: string } | string;
}
interface Activity {
  _id: string; name: string; unit: string; plannedQty: number; completedQty: number;
  percentage: number; status: string; vendorName?: string; remarks?: string;
  workOrderId: string | { _id: string; workOrderNo: string };
}
interface MilestoneActivity {
  _id: string; name: string; plannedQty: number; completedQty: number;
  unit: string; status: string; requiredPercentage: number;
}
interface Milestone {
  _id: string; name: string; description?: string; paymentAmount: number;
  paymentStatus: string; achieved: boolean; achievedDate?: string;
  currentProgress: number; vendorName?: string;
  billId?: { billNo: string; status: string; amount: number };
  activities: MilestoneActivity[];
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STATUS_COLOR: Record<string, string> = {
  "not-started": "#9CA3AF", "in-progress": "#f59e0b", "completed": "#16a34a", "blocked": "#ef4444", "on-hold": "#6B7280",
};
const STATUS_LABEL: Record<string, string> = {
  "not-started": "Not Started", "in-progress": "In Progress", "completed": "Completed", "blocked": "Blocked", "on-hold": "On Hold",
};
const MILESTONE_STATUS_COLOR: Record<string, string> = {
  "pending": "#9CA3AF", "eligible": "#16a34a", "bill-generated": "#3b82f6", "paid": "#0d9488",
};
const MILESTONE_STATUS_LABEL: Record<string, string> = {
  "pending": "Pending", "eligible": "Eligible", "bill-generated": "Bill Raised", "paid": "Paid",
};

// ── Admin: Construction Progress ─────────────────────────────────────────────
function WorkProgressAdmin() {
  const { user } = useAuth();
  const isEngineer = user?.role === "engineer" || user?.role === "owner" || user?.role === "gm";
  const canManage  = user?.role === "owner" || user?.role === "gm";

  const [projects,   setProjects]   = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selProject,   setSelProject]   = useState<string | undefined>();
  const [selCategory,  setSelCategory]  = useState<string | undefined>();
  const [selWorkOrder, setSelWorkOrder] = useState<string | undefined>();
  const [stages,      setStages]      = useState<Stage[]>([]);
  const [activities,  setActivities]  = useState<Record<string, Activity[]>>({});
  const [milestones,  setMilestones]  = useState<Milestone[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [activeTab,   setActiveTab]   = useState("stages");
  const [stageModal,       setStageModal]       = useState(false);
  const [activityModal,    setActivityModal]    = useState(false);
  const [progressModal,    setProgressModal]    = useState(false);
  const [milestoneModal,   setMilestoneModal]   = useState(false);
  const [linkActModal,     setLinkActModal]     = useState(false);
  const [currentStageId,   setCurrentStageId]   = useState<string | undefined>();
  const [currentActivity,  setCurrentActivity]  = useState<Activity | undefined>();
  const [currentMilestone, setCurrentMilestone] = useState<Milestone | undefined>();
  const [saving,           setSaving]           = useState(false);
  const [stageFormInst]    = Form.useForm();
  const [activityFormInst] = Form.useForm();
  const [progressFormInst] = Form.useForm();
  const [milestoneFormInst]= Form.useForm();
  const [linkActFormInst]  = Form.useForm();

  useEffect(() => {
    apiClient.get("/projects").then(r => setProjects(r.data.projects ?? []));
    apiClient.get("/categories").then(r => setCategories(r.data.categories ?? []));
  }, []);

  useEffect(() => {
    if (!selProject) { setWorkOrders([]); return; }
    apiClient.get(`/work-orders?projectId=${selProject}`)
      .then(r => {
        let wos = r.data.workOrders ?? [];
        if (selCategory) {
          const cat = categories.find(c => c._id === selCategory);
          if (cat) wos = wos.filter((wo: WorkOrder) => wo.category === cat.name);
        }
        setWorkOrders(wos);
      });
  }, [selProject, selCategory, categories]);

  const loadProgress = useCallback(async () => {
    if (!selProject || !selCategory) {
      message.warning("Please select a Project and Category first");
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, string> = { projectId: selProject, categoryId: selCategory };
      const [stageRes, milRes] = await Promise.all([
        apiClient.get("/stages",     { params }),
        apiClient.get("/milestones", { params }),
      ]);
      const fetchedStages: Stage[] = stageRes.data.stages ?? [];
      setStages(fetchedStages);
      setMilestones(milRes.data.milestones ?? []);
      const actMap: Record<string, Activity[]> = {};
      await Promise.all(fetchedStages.map(async (s) => {
        const aRes = await apiClient.get("/activities", { params: { stageId: s._id } });
        actMap[s._id] = aRes.data.activities ?? [];
      }));
      setActivities(actMap);
    } catch { message.error("Failed to load progress data"); }
    finally { setLoading(false); }
  }, [selProject, selCategory]);

  const handleCreateStage = async (vals: { name: string; sequence: number; description?: string }) => {
    setSaving(true);
    try {
      await apiClient.post("/stages", { ...vals, projectId: selProject, categoryId: selCategory });
      toast.success("Stage created");
      setStageModal(false);
      stageFormInst.resetFields();
      loadProgress();
    } catch { } finally { setSaving(false); }
  };

  const handleCreateActivity = async (vals: { name: string; unit: string; plannedQty: number }) => {
    if (!selWorkOrder) { message.error("Please select a Work Order first"); return; }
    setSaving(true);
    try {
      await apiClient.post("/activities", { ...vals, projectId: selProject, categoryId: selCategory, stageId: currentStageId, workOrderId: selWorkOrder });
      toast.success("Activity created");
      setActivityModal(false);
      activityFormInst.resetFields();
      loadProgress();
    } catch { } finally { setSaving(false); }
  };

  const handleUpdateProgress = async (vals: { completedQty: number; remarks?: string }) => {
    if (!currentActivity) return;
    setSaving(true);
    try {
      await apiClient.patch(`/activities/${currentActivity._id}/progress`, vals);
      toast.success("Progress updated");
      setProgressModal(false);
      progressFormInst.resetFields();
      loadProgress();
    } catch { } finally { setSaving(false); }
  };

  const handleCreateMilestone = async (vals: { name: string; description?: string; paymentAmount: number }) => {
    if (!selWorkOrder || !currentStageId) { message.error("Please select a Work Order and expand a stage"); return; }
    setSaving(true);
    try {
      const wo = workOrders.find(w => w._id === selWorkOrder);
      await apiClient.post("/milestones", { ...vals, projectId: selProject, categoryId: selCategory, stageId: currentStageId, workOrderId: selWorkOrder, vendorCode: "", vendorName: wo?.vendorName ?? "" });
      toast.success("Milestone created");
      setMilestoneModal(false);
      milestoneFormInst.resetFields();
      loadProgress();
    } catch { } finally { setSaving(false); }
  };

  const handleLinkActivity = async (vals: { activityId: string; requiredPercentage: number }) => {
    if (!currentMilestone) return;
    setSaving(true);
    try {
      await apiClient.post(`/milestones/${currentMilestone._id}/activities`, vals);
      toast.success("Activity linked");
      setLinkActModal(false);
      linkActFormInst.resetFields();
      loadProgress();
    } catch { } finally { setSaving(false); }
  };

  const activityColumns: ColumnsType<Activity> = [
    { title: "Activity", dataIndex: "name", width: 200, render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: "Unit",    dataIndex: "unit",         width: 70  },
    { title: "Planned", dataIndex: "plannedQty",   width: 90, align: "right" as const },
    { title: "Done",    dataIndex: "completedQty", width: 90, align: "right" as const },
    {
      title: "Progress", width: 140,
      render: (_: unknown, row: Activity) => {
        const pct = row.plannedQty > 0 ? Math.min(100, Math.round((row.completedQty / row.plannedQty) * 100)) : 0;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Progress percent={pct} size="small" style={{ flex: 1, margin: 0 }}
              strokeColor={pct >= 100 ? "#16a34a" : pct > 50 ? "#f59e0b" : "#ef4444"} />
            <span style={{ fontSize: 11, color: "#6B7280", whiteSpace: "nowrap" }}>{pct}%</span>
          </div>
        );
      },
    },
    {
      title: "Status", dataIndex: "status", width: 110,
      render: (s: string) => (
        <Tag style={{ color: STATUS_COLOR[s], background: "#F9FAFB", border: `1px solid ${STATUS_COLOR[s]}`, fontSize: 11, fontWeight: 600 }}>
          {STATUS_LABEL[s] ?? s}
        </Tag>
      ),
    },
    {
      title: "", width: 130,
      render: (_: unknown, row: Activity) => (
        <div style={{ display: "flex", gap: 6 }}>
          {isEngineer && (
            <Button size="small" type="primary" ghost
              onClick={() => { setCurrentActivity(row); progressFormInst.setFieldsValue({ completedQty: row.completedQty, remarks: row.remarks }); setProgressModal(true); }}>
              Update
            </Button>
          )}
          {row.remarks && <Tooltip title={row.remarks}><Button size="small" type="text" style={{ color: "#9CA3AF" }}>💬</Button></Tooltip>}
        </div>
      ),
    },
  ];

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#111827" }}>Construction Progress</h1>
        <p style={{ color: "#6B7280", marginTop: 4, marginBottom: 0 }}>Track execution stages, activities, and milestone-based payments.</p>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>Project *</div>
          <Select showSearch placeholder="Select project" style={{ width: "100%" }} value={selProject}
            onChange={v => { setSelProject(v); setSelWorkOrder(undefined); setStages([]); setMilestones([]); setActivities({}); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {projects.map(p => <Option key={p._id} value={p._id}>{p.name}</Option>)}
          </Select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>Category *</div>
          <Select showSearch placeholder="Select category" style={{ width: "100%" }} value={selCategory}
            onChange={v => { setSelCategory(v); setSelWorkOrder(undefined); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {categories.map(c => <Option key={c._id} value={c._id}>{c.name}</Option>)}
          </Select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>Work Order (optional)</div>
          <Select showSearch placeholder="Filter by work order" style={{ width: "100%" }} allowClear value={selWorkOrder} onChange={setSelWorkOrder}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {workOrders.map(w => <Option key={w._id} value={w._id}>{w.workOrderNo} — {w.vendorName}</Option>)}
          </Select>
        </div>
        <Button type="primary" onClick={loadProgress} style={{ background: "#FF7A00", borderColor: "#FF7A00", height: 32 }}>Load Progress</Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spin size="large" /></div>
      ) : stages.length === 0 && milestones.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No progress data yet</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Select a project and category, then click Load Progress.</div>
        </div>
      ) : (
        <Tabs activeKey={activeTab} onChange={setActiveTab}
          tabBarExtraContent={
            activeTab === "stages" && selProject && selCategory && canManage ? (
              <Button size="small" onClick={() => setStageModal(true)} style={{ background: "#FF7A00", borderColor: "#FF7A00", color: "#fff" }}>+ Add Stage</Button>
            ) : activeTab === "milestones" && selProject && selCategory && canManage ? (
              <Button size="small" onClick={() => { if (!currentStageId) { message.info("Expand a stage first"); return; } setMilestoneModal(true); }}
                style={{ background: "#FF7A00", borderColor: "#FF7A00", color: "#fff" }}>+ Add Milestone</Button>
            ) : null
          }
        >
          <TabPane tab="Stages & Activities" key="stages">
            {stages.length === 0 ? (
              <Empty description="No stages yet." style={{ padding: 48 }} />
            ) : (
              <Collapse accordion onChange={(k) => setCurrentStageId(Array.isArray(k) ? k[0] : (k ?? undefined))} style={{ background: "transparent" }}>
                {stages.map(stage => {
                  const pct = stage.progress;
                  const acts = activities[stage._id] ?? [];
                  return (
                    <Panel key={stage._id}
                      style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, marginBottom: 8 }}
                      header={
                        <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "#111827", fontSize: 14 }}>{stage.name}</div>
                            {stage.description && <div style={{ fontSize: 12, color: "#9CA3AF" }}>{stage.description}</div>}
                          </div>
                          <div style={{ width: 200 }}>
                            <Progress percent={pct} size="small" style={{ margin: 0 }}
                              strokeColor={pct >= 100 ? "#16a34a" : pct > 50 ? "#f59e0b" : "#3b82f6"} />
                          </div>
                          <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>{acts.length} activities</div>
                        </div>
                      }
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Activities</span>
                        {isEngineer && <Button size="small" onClick={() => { setCurrentStageId(stage._id); setActivityModal(true); }}>+ Add Activity</Button>}
                      </div>
                      <Table size="small" dataSource={acts} rowKey="_id" columns={activityColumns} pagination={false}
                        locale={{ emptyText: "No activities yet." }} />
                    </Panel>
                  );
                })}
              </Collapse>
            )}
          </TabPane>

          <TabPane tab={`Milestones (${milestones.length})`} key="milestones">
            {milestones.length === 0 ? (
              <Empty description="No milestones defined yet." style={{ padding: 48 }} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                {milestones.map(m => (
                  <Card key={m._id} size="small"
                    style={{ border: `1px solid ${m.achieved ? "#16a34a" : "#E5E7EB"}`, borderRadius: 12 }}
                    title={
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</span>
                        <Tag style={{ color: MILESTONE_STATUS_COLOR[m.paymentStatus], background: "#F9FAFB", border: `1px solid ${MILESTONE_STATUS_COLOR[m.paymentStatus]}`, fontSize: 11, fontWeight: 600 }}>
                          {MILESTONE_STATUS_LABEL[m.paymentStatus] ?? m.paymentStatus}
                        </Tag>
                      </div>
                    }
                    extra={canManage && <Button size="small" onClick={() => { setCurrentMilestone(m); setLinkActModal(true); }}>Link Activity</Button>}
                  >
                    {m.description && <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 8px" }}>{m.description}</p>}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>Overall Progress</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{m.currentProgress}%</span>
                      </div>
                      <Progress percent={m.currentProgress} size="small" style={{ margin: 0 }}
                        strokeColor={m.achieved ? "#16a34a" : m.currentProgress > 50 ? "#f59e0b" : "#3b82f6"} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#FF7A00", marginBottom: 8 }}>Payment: {fmt(m.paymentAmount)}</div>
                    {m.activities.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Linked Activities:</div>
                        {m.activities.map((a, i) => {
                          const pct = a.plannedQty > 0 ? Math.min(100, Math.round((a.completedQty / a.plannedQty) * 100)) : 0;
                          const done = pct >= (a.requiredPercentage ?? 100);
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: "1px solid #F3F4F6" }}>
                              <span style={{ fontSize: 12 }}>{done ? "✅" : "⏳"} {a.name}</span>
                              <span style={{ fontSize: 11, color: done ? "#16a34a" : "#f59e0b", fontWeight: 600 }}>{pct}% / {a.requiredPercentage ?? 100}% req.</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {m.billId && (
                      <div style={{ marginTop: 8, padding: "6px 8px", background: "#EFF6FF", borderRadius: 6, fontSize: 12 }}>
                        Bill: <b>{m.billId.billNo}</b> — {m.billId.status?.toUpperCase()}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabPane>
        </Tabs>
      )}

      <Modal title="Add Stage" open={stageModal} onCancel={() => setStageModal(false)} footer={null} destroyOnClose>
        <Form form={stageFormInst} layout="vertical" onFinish={handleCreateStage} style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Stage Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sequence" label="Sequence" initialValue={1}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="description" label="Description (optional)"><Input.TextArea rows={2} /></Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setStageModal(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>Create Stage</Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Add Activity" open={activityModal} onCancel={() => setActivityModal(false)} footer={null} destroyOnClose>
        <Form form={activityFormInst} layout="vertical" onFinish={handleCreateActivity} style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Activity Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="unit" label="Unit" rules={[{ required: true }]}>
            <Select>{["Cum","Sqm","Sqft","Rmt","Nos","Kg","MT","LS"].map(u => <Option key={u} value={u}>{u}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="plannedQty" label="Planned Quantity" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setActivityModal(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>Create</Button>
          </div>
        </Form>
      </Modal>

      <Modal title={<>Update Progress — <b>{currentActivity?.name}</b></>} open={progressModal} onCancel={() => setProgressModal(false)} footer={null} destroyOnClose>
        <Form form={progressFormInst} layout="vertical" onFinish={handleUpdateProgress} style={{ marginTop: 8 }}>
          {currentActivity && (
            <div style={{ background: "#F9FAFB", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 12, color: "#6B7280" }}>
              Planned: <b>{currentActivity.plannedQty} {currentActivity.unit}</b> · Current: <b>{currentActivity.completedQty} {currentActivity.unit}</b>
            </div>
          )}
          <Form.Item name="completedQty" label="Completed Quantity" rules={[{ required: true }]}>
            <InputNumber min={0} max={currentActivity?.plannedQty} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks (optional)"><Input.TextArea rows={2} /></Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setProgressModal(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>Save</Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Add Milestone" open={milestoneModal} onCancel={() => setMilestoneModal(false)} footer={null} destroyOnClose>
        <Form form={milestoneFormInst} layout="vertical" onFinish={handleCreateMilestone} style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Milestone Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description (optional)"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="paymentAmount" label="Payment Amount (₹)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} formatter={v => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setMilestoneModal(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>Create</Button>
          </div>
        </Form>
      </Modal>

      <Modal title={<>Link Activity to — <b>{currentMilestone?.name}</b></>} open={linkActModal} onCancel={() => setLinkActModal(false)} footer={null} destroyOnClose>
        <Form form={linkActFormInst} layout="vertical" onFinish={handleLinkActivity} style={{ marginTop: 8 }}>
          <Form.Item name="activityId" label="Select Activity" rules={[{ required: true }]}>
            <Select showSearch filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
              {Object.values(activities).flat().map(a => <Option key={a._id} value={a._id}>{a.name} ({a.plannedQty} {a.unit})</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="requiredPercentage" label="Required % to unlock milestone" initialValue={100}>
            <InputNumber min={1} max={100} style={{ width: "100%" }} />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setLinkActModal(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>Link</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

// ── DRI Types ─────────────────────────────────────────────────────────────────
interface ProgressEntry { _id: string; date: string; qtyAdded: number; remarks?: string; }
interface ScopeItemR {
  _id: string; description: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  rate: number; progressEntries?: ProgressEntry[];
}
interface WOSummary { _id: string; workOrderNo: string; projectName: string; category?: string; subCategory?: string; vendorName?: string; }
interface WODetail  { _id: string; workOrderNo: string; projectName: string; category?: string; subCategory?: string; vendorName?: string; scopeItems: ScopeItemR[]; }
interface BRSummary {
  _id: string; reqNo: string; workOrderId: string;
  stageNo?: number; status: string;
  periodFrom?: string; periodTo?: string;
  items: { description: string; unit: string; billedQty: number }[];
  createdAt: string;
  billId?: { billNo: string } | null;
  milestoneAchieved?: boolean;
}

const fmtN = (n: number) => n.toLocaleString("en-IN");
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

const BR_STATUS_COLOR: Record<string, string> = { pending: "#f59e0b", approved: "#16a34a", rejected: "#ef4444" };
const BR_STATUS_LABEL: Record<string, string> = { pending: "Pending Review", approved: "Approved", rejected: "Rejected" };

// ── DRI Dashboard ─────────────────────────────────────────────────────────────
function DRIDashboard() {
  const { user } = useAuth();

  const [workOrders, setWorkOrders] = useState<WOSummary[]>([]);
  const [selWOId,    setSelWOId]    = useState<string | undefined>();
  const [woDetail,   setWODetail]   = useState<WODetail | null>(null);
  const [billReqs,   setBillReqs]   = useState<BRSummary[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [woLoading,  setWOLoading]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  const [progModal,    setProgModal]    = useState(false);
  const [progItem,     setProgItem]     = useState<ScopeItemR | null>(null);
  const [progForm]                      = Form.useForm();
  const [billModal,    setBillModal]    = useState(false);
  const [billRemarks,  setBillRemarks]  = useState("");

  // Load my work orders on mount
  useEffect(() => {
    setLoading(true);
    apiClient.get("/work-orders")
      .then(r => setWorkOrders(r.data.workOrders ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Load WO detail + bill requests when WO is selected
  useEffect(() => {
    if (!selWOId) { setWODetail(null); setBillReqs([]); return; }
    setWOLoading(true);
    Promise.all([
      apiClient.get(`/work-orders/${selWOId}`),
      apiClient.get(`/bill-requests?workOrderId=${selWOId}`),
    ]).then(([woR, brR]) => {
      setWODetail(woR.data.workOrder);
      setBillReqs(brR.data.billRequests ?? []);
    }).finally(() => setWOLoading(false));
  }, [selWOId]);

  const reloadData = async () => {
    if (!selWOId) return;
    const [woR, brR] = await Promise.all([
      apiClient.get(`/work-orders/${selWOId}`),
      apiClient.get(`/bill-requests?workOrderId=${selWOId}`),
    ]);
    setWODetail(woR.data.workOrder);
    setBillReqs(brR.data.billRequests ?? []);
  };

  // Computed stats
  const todayStr = dayjs().format("YYYY-MM-DD");
  const weekStart = dayjs().startOf("isoWeek");

  const allEntries = (woDetail?.scopeItems ?? []).flatMap(si =>
    (si.progressEntries ?? []).map(pe => ({
      ...pe,
      unit:        si.unit,
      description: si.description,
      scopeId:     si._id,
    }))
  ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  const todayQty = allEntries
    .filter(e => dayjs(e.date).format("YYYY-MM-DD") === todayStr)
    .reduce((s, e) => s + e.qtyAdded, 0);

  const weekQty = allEntries
    .filter(e => !dayjs(e.date).isBefore(weekStart))
    .reduce((s, e) => s + e.qtyAdded, 0);

  const pendingBillingQty = (woDetail?.scopeItems ?? [])
    .reduce((s, si) => s + Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)), 0);

  const pendingBillItems = (woDetail?.scopeItems ?? [])
    .map(si => ({
      ...si,
      billedQty: Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)),
    }))
    .filter(si => si.billedQty > 0);

  const hasPendingRequest = billReqs.some(br => br.status === "pending");

  const handleAddProgress = async () => {
    if (!woDetail || !progItem) return;
    const vals = await progForm.validateFields();
    setSaving(true);
    try {
      await apiClient.post(`/work-orders/${woDetail._id}/scope-items/${progItem._id}/progress`, {
        date:     vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        qtyAdded: vals.qtyAdded,
        remarks:  vals.remarks || "",
      });
      message.success(`Progress recorded: +${fmtN(vals.qtyAdded)} ${progItem.unit}`);
      setProgModal(false);
      progForm.resetFields();
      await reloadData();
    } catch { }
    finally { setSaving(false); }
  };

  const handleBillRequest = async () => {
    if (!woDetail) return;
    if (!pendingBillItems.length) { message.error("No new progress to bill."); return; }
    setSaving(true);
    try {
      const res = await apiClient.post("/bill-requests", { workOrderId: woDetail._id, remarks: billRemarks });
      message.success(res.data?.message || "Bill request submitted successfully");
      setBillModal(false);
      setBillRemarks("");
      await reloadData();
    } catch { }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}><Spin size="large" /></div>;

  return (
    <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>Welcome, {user?.name}</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Site Progress Dashboard — track your work and submit bill requests</div>
      </div>

      {/* Work Order Selector */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Select Work Order</div>
        <Select
          style={{ width: "100%" }} size="large" showSearch placeholder="Select your assigned work order..."
          value={selWOId} onChange={setSelWOId}
          filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
          options={workOrders.map(wo => ({
            label: `${wo.workOrderNo} — ${wo.projectName}${wo.category ? " (" + wo.category + ")" : ""}`,
            value: wo._id,
          }))}
        />
        {workOrders.length === 0 && (
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>No work orders assigned yet.</div>
        )}
      </div>

      {/* Stats Strip */}
      {selWOId && woDetail && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Today's Progress", value: `${fmtN(todayQty)}`, unit: todayQty > 0 ? (woDetail.scopeItems[0]?.unit || "") : "", color: "#3b82f6", icon: "📅" },
            { label: "This Week", value: `${fmtN(weekQty)}`, unit: weekQty > 0 ? (woDetail.scopeItems[0]?.unit || "") : "", color: "#8b5cf6", icon: "📊" },
            { label: "Pending Billing", value: `${fmtN(pendingBillingQty)}`, unit: "", color: pendingBillingQty > 0 ? "#FF7A00" : "#16a34a", icon: pendingBillingQty > 0 ? "⏳" : "✓" },
            { label: "Stages Submitted", value: `${billReqs.length}`, unit: billReqs.filter(b => b.status === "approved").length + " approved", color: "#16a34a", icon: "🏗" },
          ].map(({ label, value, unit, color, icon }) => (
            <div key={label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
              {unit && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>{unit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Scope Items Progress */}
      {selWOId && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ background: "#1F2937", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{woDetail?.workOrderNo ?? "..."}</div>
              <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                {woDetail?.projectName}{woDetail?.category ? ` · ${woDetail.category}` : ""}{woDetail?.subCategory ? ` › ${woDetail.subCategory}` : ""}
              </div>
            </div>
            <Tooltip title={
              hasPendingRequest ? "A bill request is pending admin review" :
              pendingBillItems.length === 0 ? "Record new progress before generating a bill" : ""
            }>
              <Button
                onClick={() => { setBillRemarks(""); setBillModal(true); }}
                disabled={hasPendingRequest || pendingBillItems.length === 0 || !woDetail}
                style={
                  !hasPendingRequest && pendingBillItems.length > 0
                    ? { background: "#FF7A00", borderColor: "#FF7A00", color: "#fff", fontWeight: 600 }
                    : {}
                }
              >
                {hasPendingRequest ? "⏳ Pending Review" : `Generate Bill Request${billReqs.length > 0 ? ` — Stage ${billReqs.length + 1}` : ""}`}
              </Button>
            </Tooltip>
          </div>

          {woLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>
          ) : !woDetail?.scopeItems?.length ? (
            <div style={{ padding: 40 }}><Empty description="No scope items defined" /></div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F3F4F6" }}>
                      {["#", "Description", "Unit", "Planned", "Done", "Billed", "Unbilled", "Remaining", "Progress", ""].map(h => (
                        <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#374151", textAlign: h === "Progress" ? "center" : "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {woDetail.scopeItems.map((si, idx) => {
                      const p = pctOf(si.completedQty, si.plannedQty);
                      const billed = si.lastBilledQty || 0;
                      const unbilled = Math.max(0, si.completedQty - billed);
                      const rem = Math.max(0, si.plannedQty - si.completedQty);
                      const isComplete = p >= 100;
                      return (
                        <tr key={si._id} style={{ borderBottom: "1px solid #F3F4F6", background: idx % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <td style={{ padding: "10px 12px", color: "#9CA3AF", fontSize: 12 }}>{idx + 1}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827", fontSize: 13 }}>{si.description}</td>
                          <td style={{ padding: "10px 12px", color: "#6B7280", fontSize: 12 }}>{si.unit}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>{fmtN(si.plannedQty)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: si.completedQty > 0 ? "#16a34a" : "#9CA3AF", fontSize: 13 }}>{fmtN(si.completedQty)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#6B7280", fontSize: 13 }}>{fmtN(billed)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>
                            {unbilled > 0 ? (
                              <span style={{ color: "#FF7A00", fontWeight: 700 }}>{fmtN(unbilled)}</span>
                            ) : (
                              <span style={{ color: "#9CA3AF" }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: rem > 0 ? "#374151" : "#16a34a", fontSize: 13 }}>{rem > 0 ? fmtN(rem) : "✓ Complete"}</td>
                          <td style={{ padding: "10px 12px", minWidth: 120 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 8, background: "#E5E7EB", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${p}%`, height: "100%", background: isComplete ? "#16a34a" : "#FF7A00", borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? "#16a34a" : "#FF7A00", minWidth: 30 }}>{p}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <Button
                              size="small" disabled={isComplete}
                              onClick={() => { setProgItem(si); progForm.resetFields(); progForm.setFieldsValue({ date: dayjs() }); setProgModal(true); }}
                              style={!isComplete ? { background: "#FF7A00", borderColor: "#FF7A00", color: "#fff", fontWeight: 600 } : {}}
                            >
                              {isComplete ? "Done" : "+ Progress"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer summary */}
              <div style={{ padding: "14px 20px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", gap: 32, flexWrap: "wrap" }}>
                {(() => {
                  const its = woDetail.scopeItems;
                  const done = its.filter(si => pctOf(si.completedQty, si.plannedQty) >= 100).length;
                  const avgPct = Math.round(its.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / (its.length || 1));
                  const totalUnbilled = its.reduce((s, si) => s + Math.max(0, si.completedQty - (si.lastBilledQty || 0)), 0);
                  return [
                    { label: "Overall Progress", value: `${avgPct}%` },
                    { label: "Items Complete",   value: `${done} / ${its.length}` },
                    { label: "Total Unbilled",   value: totalUnbilled > 0 ? fmtN(totalUnbilled) : "All billed ✓" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginTop: 2 }}>{value}</div>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Recent Progress Entries */}
      {selWOId && allEntries.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 14, color: "#111827" }}>
            Recent Progress Entries
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Date", "Scope Item", "Qty Added", "Remarks"].map(h => (
                    <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allEntries.slice(0, 15).map((e, i) => (
                  <tr key={e._id + i} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "9px 16px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                      {dayjs(e.date).format("DD MMM YYYY")}
                      {dayjs(e.date).format("YYYY-MM-DD") === todayStr && (
                        <Badge count="Today" style={{ background: "#3b82f6", marginLeft: 8, fontSize: 10 }} />
                      )}
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "#111827" }}>{e.description}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                      +{fmtN(e.qtyAdded)} {e.unit}
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{e.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allEntries.length > 15 && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: "#9CA3AF", borderTop: "1px solid #F3F4F6" }}>
              Showing last 15 of {allEntries.length} entries.
            </div>
          )}
        </div>
      )}

      {/* Stage History */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
            {selWOId ? "Stage History" : "My Bill Requests"}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>{billReqs.length} stage{billReqs.length !== 1 ? "s" : ""}</div>
        </div>
        {billReqs.length === 0 ? (
          <div style={{ padding: 40 }}><Empty description={selWOId ? "No stages submitted yet for this work order." : "Select a work order to see stages."} /></div>
        ) : (
          billReqs.map((br) => {
            const stageNum = br.stageNo ?? 1;
            const color = BR_STATUS_COLOR[br.status] ?? "#9CA3AF";
            const isMilestone = br.milestoneAchieved;
            const stageIcon = isMilestone ? "🏆" : br.status === "approved" ? "✅" : br.status === "rejected" ? "❌" : "⏳";
            return (
              <div key={br._id} style={{ padding: "18px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "flex-start", gap: 16 }}>
                {/* Stage badge */}
                <div style={{
                  background: isMilestone ? "#FFF4E8" : br.status === "approved" ? "#f0fdf4" : br.status === "rejected" ? "#fef2f2" : "#FFF4E8",
                  border: `2px solid ${isMilestone ? "#FF7A00" : color}`,
                  borderRadius: 10, padding: "10px 14px", minWidth: 76, textAlign: "center", flexShrink: 0,
                }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{stageIcon}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>Stage</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: isMilestone ? "#FF7A00" : color }}>{stageNum}</div>
                </div>

                {/* Stage info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111827", fontFamily: "monospace" }}>{br.reqNo}</span>
                    <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase" }}>
                      {BR_STATUS_LABEL[br.status] ?? br.status}
                    </span>
                    {br.status === "approved" && br.billId && (
                      <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                        Bill: {br.billId.billNo}
                      </span>
                    )}
                    {isMilestone && (
                      <span style={{ background: "#FF7A00", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                        🏆 Payment Released
                      </span>
                    )}
                  </div>

                  {/* Period */}
                  {br.periodFrom && (
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                      📅 {dayjs(br.periodFrom).format("DD MMM YYYY")} → {dayjs(br.periodTo ?? br.createdAt).format("DD MMM YYYY")}
                    </div>
                  )}

                  {/* Items */}
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {br.items.map(it => `${it.description}: ${fmtN(it.billedQty)} ${it.unit}`).join(" · ")}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Progress Modal */}
      <Modal
        open={progModal} onCancel={() => { setProgModal(false); progForm.resetFields(); }}
        title={`Add Progress — ${progItem?.description}`}
        onOk={handleAddProgress} okText="Save Progress"
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <Form form={progForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Date" name="date" rules={[{ required: true, message: "Select date" }]}>
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
          </Form.Item>
          <Form.Item
            label={`Quantity Added (${progItem?.unit})`}
            name="qtyAdded"
            rules={[{ required: true, type: "number", min: 0.01 }]}
          >
            <InputNumber
              style={{ width: "100%" }} min={0.01}
              max={progItem ? Math.max(0, progItem.plannedQty - progItem.completedQty) : undefined}
              placeholder="e.g. 500"
            />
          </Form.Item>
          <Form.Item label="Remarks (optional)" name="remarks">
            <Input.TextArea rows={2} placeholder="Notes for today's work..." />
          </Form.Item>
          {progItem && (
            <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6B7280" }}>Planned</span>
                <strong>{fmtN(progItem.plannedQty)} {progItem.unit}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ color: "#6B7280" }}>Done</span>
                <strong style={{ color: "#16a34a" }}>{fmtN(progItem.completedQty)} {progItem.unit}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ color: "#6B7280" }}>Remaining</span>
                <strong style={{ color: "#FF7A00" }}>{fmtN(Math.max(0, progItem.plannedQty - progItem.completedQty))} {progItem.unit}</strong>
              </div>
            </div>
          )}
        </Form>
      </Modal>

      {/* Bill Request Modal — Auto-Calculated */}
      <Modal
        open={billModal}
        onCancel={() => setBillModal(false)}
        title={`Generate Bill Request — Stage ${billReqs.length + 1}`}
        onOk={handleBillRequest}
        okText={`Submit Stage ${billReqs.length + 1} Bill Request`}
        width={640}
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" }, disabled: pendingBillItems.length === 0 }}
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          {/* Period info */}
          {billReqs.length > 0 && billReqs[billReqs.length - 1]?.periodTo && (
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
              Period: <strong>{dayjs(billReqs[billReqs.length - 1].periodTo).format("DD MMM YYYY")}</strong> → <strong>{dayjs().format("DD MMM YYYY")}</strong>
            </div>
          )}

          {/* Auto-calc info */}
          <div style={{ padding: 12, background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#92400e" }}>
            <strong>Auto-calculated</strong> — quantities are computed from your work progress since the last billing. You cannot modify these values.
          </div>

          {pendingBillItems.length === 0 ? (
            <Empty description="No new progress to bill. Record progress first." />
          ) : (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: "#1F2937", color: "#fff" }}>
                    {["Scope Item", "Unit", "Last Billed", "Total Done", "Billing Now"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, textAlign: "left", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingBillItems.map((si, i) => (
                    <tr key={si._id} style={{ borderBottom: "1px solid #E5E7EB", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: 13, color: "#111827" }}>{si.description}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, color: "#6B7280" }}>{si.unit}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 13, color: "#6B7280" }}>{fmtN(si.lastBilledQty || 0)}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{fmtN(si.completedQty)}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 14, color: "#FF7A00", fontWeight: 800 }}>{fmtN(si.billedQty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F9FAFB", borderTop: "2px solid #FF7A00" }}>
                    <td colSpan={4} style={{ padding: "8px 12px", fontWeight: 700, color: "#374151", fontSize: 12 }}>Total items: {pendingBillItems.length}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 800, color: "#FF7A00", fontSize: 14 }}>
                      {fmtN(pendingBillItems.reduce((s, si) => s + si.billedQty, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Remarks (optional)</div>
                <Input.TextArea
                  rows={2} placeholder="Any notes for this bill request..."
                  value={billRemarks} onChange={e => setBillRemarks(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Router wrapper ────────────────────────────────────────────────────────────
export default function WorkProgress() {
  const { user } = useAuth();
  return user?.role === "dri" ? <DRIDashboard /> : <WorkProgressAdmin />;
}
