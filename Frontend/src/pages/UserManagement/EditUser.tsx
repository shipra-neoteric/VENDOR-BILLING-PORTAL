import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, User as UserIcon } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useFormErrors } from "../../hooks/useFormErrors";
import Btn from "../../ui/Btn";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import UISwitch from "../../ui/Switch";
import Badge from "../../ui/Badge";
import Spinner from "../../ui/Spinner";
import {
  ModulePermsGrid, ROLE_CFG, ROLE_OPTIONS, CUSTOM_ROLE_OPTION, isKnownRole,
  permsToMap, permsToArray,
} from "./index";
import type { AppUser, PermAction, UserRole, RoleDoc } from "./index";

// Standalone page (not a modal/drawer) for creating or editing one user —
// reachable at /users/new (create) or /users/:id/edit (edit) from the Users
// tab's row actions / "Register New User" button.
export default function EditUser() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);

  const [nameField, setNameField] = useState("");
  const [emailField, setEmailField] = useState("");
  const [mobileField, setMobileField] = useState("");
  const [slackUserIdField, setSlackUserIdField] = useState("");
  const [departmentField, setDepartmentField] = useState("");
  const [customDepartmentField, setCustomDepartmentField] = useState("");
  const [passwordField, setPasswordField] = useState("");
  const [roleField, setRoleField] = useState<UserRole>("site-dri");
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [isActiveField, setIsActiveField] = useState(true);
  const [perms, setPerms] = useState<Record<string, PermAction[]>>({});
  // What the user's ROLE grants on its own — kept separate from `perms` (the
  // effective, displayed checklist) so saving can skip persisting these back
  // onto the user directly. Without this split, every save freezes a copy of
  // the role's permissions onto the user, so a later edit to the role in the
  // Role library silently stops reaching anyone who was ever saved from here.
  const [rolePerms, setRolePerms] = useState<Record<string, PermAction[]>>({});
  const [allRoleNames, setAllRoleNames] = useState<string[]>([]);
  const formErrors = useFormErrors<"name" | "email" | "mobile" | "password" | "role">();

  function togglePerm(mod: string, action: PermAction) {
    setPerms(prev => {
      const cur = prev[mod] ?? [];
      return { ...prev, [mod]: cur.includes(action) ? cur.filter(a => a !== action) : [...cur, action] };
    });
  }

  // Fetched unconditionally (not just on edit) so a brand-new custom role
  // name can be checked against the library for a likely typo before it's
  // ever saved — the backend accepts any free-text role name (isValidRole
  // only rejects mis-cased builtins), so nothing there would catch this.
  useEffect(() => {
    apiClient.get<{ roles: RoleDoc[] }>("/roles")
      .then(r => setAllRoleNames((r.data.roles ?? []).map(role => role.name)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiClient.get<{ user: AppUser }>(`/users/${id}`),
      apiClient.get<{ roles: RoleDoc[] }>("/roles").catch(() => ({ data: { roles: [] } })),
    ])
      .then(([userRes, rolesRes]) => {
        const u = userRes.data.user;
        setEditUser(u);
        setNameField(u.name); setEmailField(u.email); setMobileField(u.mobile || "");
        setSlackUserIdField(u.slackUserId || "");
        setDepartmentField(u.department || ""); setCustomDepartmentField(u.customDepartment || "");
        setRoleField(u.role); setIsActiveField(u.isActive);
        const existingIsCustom = !isKnownRole(u.role);
        setIsCustomRole(existingIsCustom);
        setCustomRoleInput(existingIsCustom ? u.role : "");

        // Show the EFFECTIVE checklist, not just this user's own raw grants —
        // some of what actually lets this person in comes from their role's
        // own permissions (merged in at request time by the auth middleware's
        // mergeRolePermissions), not from anything ever written directly onto
        // this User document. Saving from here writes the merged set back as
        // this user's own permissions, converting them to fully user-wise.
        const merged = permsToMap(u.permissions ?? []);
        const role = (rolesRes.data.roles ?? []).find(r => r.name === u.role);
        if (role) {
          setRolePerms(permsToMap(role.permissions));
          for (const { module, actions } of role.permissions) {
            const cur = new Set(merged[module] ?? []);
            for (const a of actions) cur.add(a as PermAction);
            merged[module] = [...cur];
          }
        } else {
          setRolePerms({});
        }
        setPerms(merged);
      })
      .catch(() => toast.error("Failed to load user"))
      .finally(() => setLoading(false));
  }, [id]);

  function validateForm(): boolean {
    formErrors.clearAll();
    let ok = true;
    if (!nameField.trim()) { formErrors.setError("name", "Name is required"); ok = false; }
    if (!emailField.trim()) { formErrors.setError("email", "Email is required"); ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.trim())) { formErrors.setError("email", "Enter a valid email"); ok = false; }
    if (mobileField.trim() && !/^[0-9+\-\s]{6,15}$/.test(mobileField.trim())) { formErrors.setError("mobile", "Enter a valid mobile number"); ok = false; }
    if (!isEdit) {
      if (!passwordField) { formErrors.setError("password", "Password is required"); ok = false; }
      else if (passwordField.length < 6) { formErrors.setError("password", "At least 6 characters"); ok = false; }
    }
    if (!roleField) { formErrors.setError("role", "Select a role"); ok = false; }
    return ok;
  }

  async function handleSave() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      // Only persist permissions beyond what the role already grants — role-
      // sourced entries are re-derived fresh from the Role library on every
      // request (see mergeRolePermissions), so saving them back here would
      // freeze today's role permissions onto this user and stop them from
      // ever picking up a later change to the role itself.
      const ownPerms: Record<string, PermAction[]> = {};
      for (const [module, actions] of Object.entries(perms)) {
        const roleActions = new Set(rolePerms[module] ?? []);
        const extra = actions.filter(a => !roleActions.has(a));
        if (extra.length) ownPerms[module] = extra;
      }

      const payload: Record<string, unknown> = {
        name: nameField, email: emailField, mobile: mobileField, slackUserId: slackUserIdField,
        role: roleField, isActive: isActiveField,
        permissions: permsToArray(ownPerms),
        department: departmentField,
        customDepartment: departmentField === "custom" ? customDepartmentField : "",
      };
      if (!isEdit) payload.password = passwordField;

      if (isEdit) {
        await apiClient.put(`/users/${id}`, payload);
        toast.success("User updated");
      } else {
        const res = await apiClient.post<{ user: AppUser }>("/users", payload);
        toast.success(`User ${res.data.user.name} created`);
      }
      navigate("/users");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size="large" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button" onClick={() => navigate("/users")}
          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700/40 flex items-center justify-center text-gray-500 hover:text-primary hover:border-primary shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center shrink-0">
          <UserIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-xl font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{isEdit ? "Edit User" : "Add New User"}</div>
          <div className="text-[13px] text-gray-400 mt-0.5">{isEdit ? `Editing account for ${editUser?.name}` : "Create a new team member account"}</div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Full Name" required placeholder="e.g. Rahul Sharma"
          value={nameField} onChange={(e) => setNameField(e.target.value)}
          error={formErrors.errors.name}
        />
        <Field
          label="Email Address" required placeholder="e.g. rahul@neotericgrp.in"
          value={emailField} onChange={(e) => setEmailField(e.target.value)}
          error={formErrors.errors.email}
        />
        <Field
          label="Mobile" placeholder="e.g. 9876543210"
          value={mobileField} onChange={(e) => setMobileField(e.target.value)}
          error={formErrors.errors.mobile}
        />
        <Field
          label="Slack Member ID" placeholder="e.g. U0123ABCDE"
          value={slackUserIdField} onChange={(e) => setSlackUserIdField(e.target.value)}
        />
        <SField
          label="Department"
          placeholder="Select department (optional)"
          value={departmentField}
          onChange={(v) => { setDepartmentField(v); if (v !== "custom") setCustomDepartmentField(""); }}
          options={[
            { value: "", label: "— None —" },
            { value: "civil", label: "Civil Team" },
            { value: "marketing", label: "Marketing Team" },
            { value: "planning", label: "Planning Team" },
            { value: "maintenance", label: "Maintenance Team" },
            { value: "custom", label: "Custom Team" },
          ]}
          hint="Which team's bills this person should see and be able to approve in Bill Approval."
        />
        {departmentField === "custom" && (
          <Field
            label="Custom Team Name"
            placeholder="e.g. Legal, IT, Procurement"
            value={customDepartmentField}
            onChange={(e) => setCustomDepartmentField(e.target.value)}
          />
        )}
        {!isEdit && (
          <Field
            label="Password" required type="password" placeholder="Set initial password"
            value={passwordField} onChange={(e) => setPasswordField(e.target.value)}
            error={formErrors.errors.password}
          />
        )}
        <SField
          label="Role" required
          placeholder="Select role…"
          value={isCustomRole ? CUSTOM_ROLE_OPTION : roleField}
          onChange={(v) => {
            if (v === CUSTOM_ROLE_OPTION) {
              setIsCustomRole(true);
              setCustomRoleInput("");
              setRoleField("");
              setPerms({});
            } else {
              setIsCustomRole(false);
              setCustomRoleInput("");
              setRoleField(v as UserRole);
            }
          }}
          options={[
            ...ROLE_OPTIONS.map((r) => ({ value: r.value, label: ROLE_CFG[r.value]?.label })),
            { value: CUSTOM_ROLE_OPTION, label: "+ Create custom role…" },
          ]}
          renderOption={(o) => {
            if (o.value === CUSTOM_ROLE_OPTION) {
              return (
                <div className="py-0.5">
                  <Badge color="gray">+ Create custom role…</Badge>
                  <div className="text-xs text-gray-400 mt-1">Define a new role and assign its permissions below</div>
                </div>
              );
            }
            const role = o.value as UserRole;
            return (
              <div className="py-0.5">
                <Badge color={ROLE_CFG[role]?.color}>{ROLE_CFG[role]?.label}</Badge>
                <div className="text-xs text-gray-400 mt-1">{ROLE_CFG[role]?.description}</div>
              </div>
            );
          }}
          error={formErrors.errors.role}
        />
        {isCustomRole && (() => {
          const typed = customRoleInput.trim();
          const exactMatch = allRoleNames.some(n => n === typed);
          // A role name only has to differ in case/spacing from an existing
          // one for mergeRolePermissions to find nothing for it — the input
          // is free text with no link back to the Role library, so this is
          // the only place that can catch a likely typo before save.
          const caseInsensitiveMatch = !exactMatch && typed && allRoleNames.some(n => n.toLowerCase() === typed.toLowerCase());
          return (
            <Field
              label="Custom Role Name" required placeholder="e.g. Site Supervisor"
              value={customRoleInput}
              onChange={(e) => { setCustomRoleInput(e.target.value); setRoleField(e.target.value.trim()); }}
              error={formErrors.errors.role}
              hint={
                caseInsensitiveMatch
                  ? `This role already exists as "${allRoleNames.find(n => n.toLowerCase() === typed.toLowerCase())}" — match it exactly to inherit its permissions, or this will be treated as a brand-new role with none.`
                  : exactMatch
                  ? "Matches an existing role in the library — this user will inherit its permissions."
                  : "This role starts with zero permissions — tick what it should access below."
              }
            />
          );
        })()}
        <div>
          <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Account Status</span>
          <UISwitch
            checked={isActiveField} onChange={setIsActiveField}
            onLabel="Active" offLabel="Inactive"
          />
        </div>
      </div>

      {/* ── Module Permissions — assigned per user, not by role ── */}
      {isEdit && (
        <div className="text-[12px] text-gray-400 -mb-1">
          Shown below is everything this person can currently do, including anything coming from their role — saving here fixes it directly onto their own account.
        </div>
      )}
      <ModulePermsGrid perms={perms} onToggle={togglePerm} />

      <div className="flex justify-end gap-2 mt-2">
        <Btn outline label="Cancel" onClick={() => navigate("/users")} />
        <Btn color="primary" label={isEdit ? "Save Changes" : "Create User"} loading={saving} onClick={handleSave} />
      </div>
      </div>
    </div>
  );
}
