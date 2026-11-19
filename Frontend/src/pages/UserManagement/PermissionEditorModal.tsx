import { useMemo, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import apiClient from "../../services/apiClient";
import Btn from "../../ui/Btn";
import UISwitch from "../../ui/Switch";
import { ACTION_CFG, MODULE_DEFS, permsToArray } from "./index";
import type { AppUser, PermAction } from "./index";

interface Props {
  user: AppUser;
  /** Effective permissions (own + role) keyed by module id. */
  initial: Record<string, PermAction[]>;
  /** What the user's role already grants — shown on and locked, never saved onto the user. */
  rolePerms: Record<string, PermAction[]>;
  onClose: () => void;
  onSaved: () => void;
}

const GROUPS = Array.from(new Set(MODULE_DEFS.map((m) => m.group)));

export default function PermissionEditorModal({ user, initial, rolePerms, onClose, onSaved }: Props) {
  const [perms, setPerms] = useState<Record<string, PermAction[]>>(initial);
  const [tab, setTab] = useState(GROUPS[0]);
  const [saving, setSaving] = useState(false);

  const modules = useMemo(() => MODULE_DEFS.filter((m) => m.group === tab), [tab]);
  const locked = (mod: string, a: PermAction) => (rolePerms[mod] ?? []).includes(a);

  function setAction(mod: string, action: PermAction, on: boolean) {
    setPerms((prev) => {
      let cur = new Set(prev[mod] ?? []);
      if (on) {
        cur.add(action);
        cur.add("view"); // any sub-permission needs the page to be reachable
      } else if (action === "view") {
        // Turning View off clears everything the role doesn't force on.
        cur = new Set([...cur].filter((a) => locked(mod, a)));
      } else {
        cur.delete(action);
      }
      return { ...prev, [mod]: [...cur] };
    });
  }

  function setGroupAll(on: boolean) {
    setPerms((prev) => {
      const next = { ...prev };
      for (const m of modules) {
        next[m.id] = on ? [...m.actions] : m.actions.filter((a) => locked(m.id, a));
      }
      return next;
    });
  }

  const groupAllOn = modules.every((m) => m.actions.every((a) => (perms[m.id] ?? []).includes(a)));

  async function save() {
    setSaving(true);
    try {
      // Same rule as EditUser: only persist what the role doesn't already grant,
      // so later edits to the role keep reaching this user.
      const own: Record<string, PermAction[]> = {};
      for (const [mod, actions] of Object.entries(perms)) {
        const extra = actions.filter((a) => !locked(mod, a));
        if (extra.length) own[mod] = extra;
      }
      await apiClient.put(`/users/${user._id}`, { permissions: permsToArray(own) });
      toast.success("Permissions updated");
      onSaved();
    } catch {
      toast.error("Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Permissions — {user.name}</h2>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 py-2 overflow-x-auto border-b border-gray-200 dark:border-gray-700/40">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setTab(g)}
              className={`shrink-0 h-9 px-4 leading-none rounded-lg text-sm font-semibold whitespace-nowrap border-0 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors ${
                tab === g
                  ? "bg-primary !text-white shadow-sm"
                  : "bg-transparent !text-gray-600 dark:!text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/40"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{tab} Settings</p>
              <p className="text-xs text-gray-500">Configure access levels</p>
            </div>
            <Btn small outline label={groupAllOn ? "Disable All" : "Enable All"} onClick={() => setGroupAll(!groupAllOn)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modules.map((m) => {
              const cur = perms[m.id] ?? [];
              const subs = m.actions.filter((a) => a !== "view");
              return (
                <div key={m.id} className="rounded-xl border border-gray-200 dark:border-gray-700/40 border-l-4 border-l-primary p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{m.icon} {m.name}</span>
                    <UISwitch
                      checked={cur.includes("view")}
                      disabled={locked(m.id, "view")}
                      onChange={(v) => setAction(m.id, "view", v)}
                    />
                  </div>
                  {subs.length > 0 && (
                    <div className="mt-2 ml-4 pl-3 border-l border-gray-200 dark:border-gray-700/40 space-y-1.5">
                      {subs.map((a) => (
                        <div key={a} className="flex items-center justify-between">
                          <span className="text-xs text-gray-600 dark:text-gray-300">{ACTION_CFG[a].label}</span>
                          <UISwitch
                            checked={cur.includes(a)}
                            disabled={locked(m.id, a)}
                            onChange={(v) => setAction(m.id, a, v)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700/40">
          <Btn outline label="Cancel" onClick={onClose} />
          <Btn label="Save Changes" loading={saving} onClick={save} />
        </div>
      </div>
    </div>
  );
}
