import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Users, UserMinus } from "lucide-react";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import type { Contractor, Project, VendorGroup } from "../../types/VendorBilling";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Badge from "../../ui/Badge";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import MultiSelect from "../../ui/MultiSelect";
import Modal from "../../ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { SkeletonTable } from "../../ui/Skeleton";
import Spinner from "../../ui/Spinner";

const normalizeId = <T extends { _id?: string; id?: string }>(obj: T) => ({ ...obj, id: obj._id || obj.id });
const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

interface GroupMember {
  id: string;
  vendorCode: string;
  companyName: string;
  ownerName: string;
  mobile: string;
  status: string;
}

interface MemberProgress {
  vendorCode: string;
  companyName: string;
  workOrderCount: number;
  contractValue: number;
  billed: number;
  paid: number;
}

interface ProgressSummary {
  workOrderCount: number;
  contractValue: number;
  billed: number;
  paid: number;
}

export default function VendorGroups() {
  const [groups, setGroups] = useState<VendorGroup[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");

  const [viewOpen, setViewOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<VendorGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [progressLoading, setProgressLoading] = useState(false);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [perMember, setPerMember] = useState<MemberProgress[]>([]);

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiClient.get<{ groups: VendorGroup[] }>("/vendor-groups")
      .then((r) => setGroups(r.data.groups.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    apiClient.get<{ projects: (Project & { _id?: string })[] }>("/projects")
      .then((r) => setProjects(r.data.projects.map(normalizeId)))
      .catch(() => {});
    apiClient.get<{ contractors: (Contractor & { _id?: string })[] }>("/contractors")
      .then((r) => setContractors(r.data.contractors.map(normalizeId)))
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!groupName.trim()) return toast.error("Group name is required");
    setSaving(true);
    try {
      const res = await apiClient.post<{ group: VendorGroup }>("/vendor-groups", { name: groupName });
      setGroups((prev) => [normalizeId(res.data.group), ...prev]);
      toast.success(`Vendor group ${res.data.group.groupCode} created`);
      setGroupName("");
      setCreateOpen(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to create vendor group";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function loadMembers(groupId: string) {
    return apiClient.get<{ members: (GroupMember & { _id?: string })[] }>(`/vendor-groups/${groupId}`)
      .then((r) => setMembers((r.data.members || []).map(normalizeId)))
      .catch(() => setMembers([]));
  }

  function openGroup(group: VendorGroup) {
    setSelectedGroup(group);
    setViewOpen(true);
    setProjectId("");
    setSummary(null);
    setPerMember([]);
    setAddMemberIds([]);
    loadMembers(group.id);
    loadProgress(group.id, "");
  }

  async function addMembers() {
    if (!selectedGroup || addMemberIds.length === 0) return;
    setAddingMembers(true);
    try {
      await Promise.all(addMemberIds.map((id) => apiClient.put(`/contractors/${id}`, { groupId: selectedGroup.id })));
      setContractors((prev) => prev.map((c) => (addMemberIds.includes(c.id) ? { ...c, groupId: selectedGroup.id } : c)));
      setAddMemberIds([]);
      await loadMembers(selectedGroup.id);
      setGroups((prev) => prev.map((g) => (g.id === selectedGroup.id ? { ...g, memberCount: (g.memberCount || 0) + addMemberIds.length } : g)));
      toast.success(`${addMemberIds.length} member${addMemberIds.length !== 1 ? "s" : ""} added`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to add members";
      toast.error(msg);
    } finally {
      setAddingMembers(false);
    }
  }

  async function removeMember(member: GroupMember) {
    if (!selectedGroup) return;
    setRemovingId(member.id);
    try {
      await apiClient.put(`/contractors/${member.id}`, { groupId: null });
      setContractors((prev) => prev.map((c) => (c.id === member.id ? { ...c, groupId: null } : c)));
      await loadMembers(selectedGroup.id);
      setGroups((prev) => prev.map((g) => (g.id === selectedGroup.id ? { ...g, memberCount: Math.max(0, (g.memberCount || 0) - 1) } : g)));
      toast.success(`${member.companyName} removed from the group`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to remove member";
      toast.error(msg);
    } finally {
      setRemovingId(null);
    }
  }

  function loadProgress(groupId: string, forProjectId: string) {
    setProgressLoading(true);
    apiClient.get<{ summary: ProgressSummary; perMember: MemberProgress[] }>(
      `/vendor-groups/${groupId}/progress`, { params: forProjectId ? { projectId: forProjectId } : {} }
    )
      .then((r) => { setSummary(r.data.summary); setPerMember(r.data.perMember || []); })
      .catch(() => { setSummary(null); setPerMember([]); })
      .finally(() => setProgressLoading(false));
  }

  return (
    <div>
      <PageHeader
        title="Vendor Groups"
        subtitle="Internal grouping only — several individually-registered vendor codes belonging to the same real business, so a bill can be paid into any member's account regardless of whose work order it's under."
        icon={Users}
        actions={<Btn label="New Vendor Group" icon={Plus} style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={() => { setGroupName(""); setCreateOpen(true); }} />}
      />

      {loading ? (
        <Card padded={false} className="p-4"><SkeletonTable rows={5} cols={3} /></Card>
      ) : groups.length === 0 ? (
        <Card className="text-center py-14 text-gray-400">
          <Users className="w-9 h-9 mx-auto mb-3" />
          <div className="font-bold text-gray-600 dark:text-gray-300">No vendor groups yet</div>
          <div className="text-sm mt-1">Click "New Vendor Group" to create one, then add members from inside it.</div>
        </Card>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Group Code</Th>
              <Th>Name</Th>
              <Th>Members</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {groups.map(g => (
              <Tr key={g.id}>
                <Td><span className="font-mono font-bold text-purple-600 dark:text-purple-400">{g.groupCode}</span></Td>
                <Td><TdText>{g.name}</TdText></Td>
                <Td><Badge color={(g.memberCount ?? 0) > 0 ? "purple" : "gray"}>{g.memberCount ?? 0}</Badge></Td>
                <Td><button type="button" onClick={() => openGroup(g)} className="text-xs font-semibold text-primary hover:underline">View</button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* ── Create Modal ─────────────────────────────────────── */}
      {createOpen && (
        <Modal
          title="New Vendor Group" onClose={() => setCreateOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => setCreateOpen(false)} />
              <Btn label="Create" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} loading={saving} onClick={handleCreate} />
            </div>
          }
        >
          <Field label="Group Name" required placeholder="e.g. Ambika Construction Group" value={groupName} onChange={e => setGroupName(e.target.value)} />
          <div className="text-xs text-gray-400 mt-3">
            You can add members right after creating the group — open it and search for contractors to add.
          </div>
        </Modal>
      )}

      {/* ── Group Detail / Progress Modal ────────────────────── */}
      {viewOpen && selectedGroup && (
        <Modal
          title={selectedGroup.name} subtitle={selectedGroup.groupCode} icon={Users}
          extraWide
          onClose={() => setViewOpen(false)}
          footer={<Btn label="Close" outline onClick={() => setViewOpen(false)} />}
        >
          <div className="font-bold text-[13px] text-gray-700 dark:text-gray-300 mb-2">Members</div>

          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <MultiSelect
                placeholder="Search contractors by name or vendor code to add…"
                values={addMemberIds}
                onChange={setAddMemberIds}
                options={contractors
                  .filter((c) => !members.some((m) => m.id === c.id))
                  .map((c) => ({
                    label: `${vendorLabel(c.companyName, c.shortCode)} (${c.vendorCode})${c.groupId && c.groupId !== selectedGroup?.id ? " — currently in another group" : ""}`,
                    value: c.id,
                  }))}
              />
            </div>
            <Btn label="Add" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} loading={addingMembers} disabled={addMemberIds.length === 0} onClick={addMembers} />
          </div>

          {members.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm mb-6">No members yet — search and add contractors above</div>
          ) : (
            <Table className="mb-6">
              <Thead>
                <Tr>
                  <Th>Vendor Code</Th>
                  <Th>Company</Th>
                  <Th>Owner</Th>
                  <Th>Mobile</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {members.map(m => (
                  <Tr key={m.id}>
                    <Td><span className="font-mono font-bold text-primary">{m.vendorCode}</span></Td>
                    <Td><TdText>{m.companyName}</TdText></Td>
                    <Td><TdText>{m.ownerName}</TdText></Td>
                    <Td><TdText>{m.mobile}</TdText></Td>
                    <Td>
                      <Btn small color="red" icon={UserMinus} label="Remove" loading={removingId === m.id} onClick={() => removeMember(m)} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-[13px] text-gray-700 dark:text-gray-300">Progress</div>
            <div className="w-60">
              <SField
                placeholder="All Projects"
                value={projectId || null}
                options={selectableProjects(projects).map((p) => ({ label: p.name, value: p.id }))}
                onChange={(v) => {
                  setProjectId(v);
                  if (selectedGroup) loadProgress(selectedGroup.id, v);
                }}
              />
            </div>
          </div>

          {progressLoading ? (
            <Spinner label="Loading progress…" />
          ) : (
            <>
              {summary && (
                <div className="flex gap-3 mb-4">
                  {[
                    { label: "Work Orders", value: summary.workOrderCount, color: "text-gray-700 dark:text-gray-300" },
                    { label: "Contract Value", value: fmt(summary.contractValue), color: "text-gray-700 dark:text-gray-300" },
                    { label: "Billed", value: fmt(summary.billed), color: "text-amber-600 dark:text-amber-400" },
                    { label: "Paid", value: fmt(summary.paid), color: "text-emerald-600 dark:text-emerald-400" },
                  ].map((s) => (
                    <div key={s.label} className="flex-1 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg px-3.5 py-2.5">
                      <div className="text-[11px] text-gray-400 uppercase tracking-wide">{s.label}</div>
                      <div className={`text-[15px] font-bold mt-0.5 ${s.color}`}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {perMember.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No work orders for this group yet</div>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Vendor Code</Th>
                      <Th>Company</Th>
                      <Th className="text-right">Work Orders</Th>
                      <Th className="text-right">Contract Value</Th>
                      <Th className="text-right">Billed</Th>
                      <Th className="text-right">Paid</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {perMember.map(m => (
                      <Tr key={m.vendorCode}>
                        <Td><span className="font-mono font-bold text-primary">{m.vendorCode}</span></Td>
                        <Td><TdText>{m.companyName}</TdText></Td>
                        <Td className="text-right"><TdText>{m.workOrderCount}</TdText></Td>
                        <Td className="text-right"><TdText>{fmt(m.contractValue)}</TdText></Td>
                        <Td className="text-right"><TdText>{fmt(m.billed)}</TdText></Td>
                        <Td className="text-right"><span className="text-emerald-600 dark:text-emerald-400 font-semibold">{fmt(m.paid)}</span></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
