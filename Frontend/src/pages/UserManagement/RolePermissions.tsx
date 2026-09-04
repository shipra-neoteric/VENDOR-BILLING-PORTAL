import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import apiClient from "../../services/apiClient";
import Btn from "../../ui/Btn";
import NxBadge from "../../ui/nexora/Badge";
import Spinner from "../../ui/Spinner";
import Field from "../../ui/Field";
import {
  ModulePermsGrid, ROLE_CFG, permsToMap, permsToArray,
} from "./index";
import type { RoleDoc, PermAction } from "./index";

// Standalone page (not a modal) for editing one role's permission matrix —
// reachable at /users/roles/:id via the "Manage Permissions" action on the
// Roles tab. Built-in roles can still be opened (read the matrix, same as
// any other) and saved: the auth middleware's mergeRolePermissions is what
// actually makes this live, and any hardcoded authorizeOr(...,'owner','gm')
// bypass elsewhere in the app still applies on top regardless of what's
// ticked here — this can only ever add reach for a built-in role, never
// remove the hardcoded kind.
export default function RolePermissions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [role, setRole] = useState<RoleDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [descField, setDescField] = useState("");
  const [perms, setPerms] = useState<Record<string, PermAction[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiClient.get<{ role: RoleDoc }>(`/roles/${id}`)
      .then(r => {
        setRole(r.data.role);
        setDescField(r.data.role.description || "");
        setPerms(permsToMap(r.data.role.permissions));
      })
      .catch(() => toast.error("Failed to load role"))
      .finally(() => setLoading(false));
  }, [id]);

  function toggle(mod: string, action: PermAction) {
    setPerms(prev => {
      const cur = prev[mod] ?? [];
      return { ...prev, [mod]: cur.includes(action) ? cur.filter(a => a !== action) : [...cur, action] };
    });
  }

  async function handleSave() {
    if (!role) return;
    setSaving(true);
    try {
      await apiClient.put(`/roles/${role._id}`, { description: descField, permissions: permsToArray(perms) });
      toast.success("Role updated");
      navigate("/users");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size="large" /></div>;
  }
  if (!role) {
    return <div className="text-center py-24 text-gray-400 text-sm">Role not found</div>;
  }

  const roleLabel = ROLE_CFG[role.name]?.label || role.name;
  const authNodes = role.permissions.reduce((s, p) => s + p.actions.length, 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <button
            type="button" onClick={() => navigate("/users")}
            className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700/40 flex items-center justify-center text-gray-500 hover:text-primary hover:border-primary shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-xl font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Role permissions protocol</div>
            <div className="text-[13px] text-gray-400 font-mono mt-0.5">Editing permissions for: {roleLabel}</div>
          </div>
        </div>
        <NxBadge color="orange">
          <ShieldAlert className="w-3 h-3 inline mr-1 -mt-0.5" />
          {roleLabel} authority matrix
        </NxBadge>
      </div>

      {role.isSystem && (
        <div className="mb-4 text-[12.5px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3.5 py-2.5">
          Built-in role — its name can't change and some modules also have a hardcoded bypass for it (unchecking those here won't revoke that part).
          Everything else you tick/untick below genuinely changes access for every user on this role.
        </div>
      )}

      <div className="mb-4 max-w-md">
        <Field label="Description" placeholder="What is this role for?" value={descField} onChange={(e) => setDescField(e.target.value)} />
      </div>

      <ModulePermsGrid perms={perms} onToggle={toggle} />

      <div className="flex justify-between items-center mt-5">
        <span className="text-[12px] text-gray-400">{role.userCount} user{role.userCount !== 1 ? "s" : ""} on this role · {authNodes} node{authNodes !== 1 ? "s" : ""} currently assigned</span>
        <div className="flex gap-2">
          <Btn outline label="Cancel" onClick={() => navigate("/users")} />
          <Btn color="primary" label="Save Changes" loading={saving} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}
