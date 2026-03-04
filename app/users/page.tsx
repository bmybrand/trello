"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getSessionWithRetry } from "@/lib/supabase";
import { getAllUsers, updateUser, type AppUser } from "@/lib/workspace-storage";

function EditUserModal({
  user,
  currentUserAuthId,
  currentUserIsSuperAdmin,
  onClose,
  onSaved,
}: {
  user: AppUser;
  currentUserAuthId: string;
  currentUserIsSuperAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [appRole, setAppRole] = useState(user.app_role ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuperAdminConfirm, setShowSuperAdminConfirm] = useState(false);

  const targetIsAdminOrSuperAdmin =
    (user.app_role ?? "").toLowerCase().trim() === "admin" ||
    (user.app_role ?? "").toLowerCase().trim() === "superadmin";
  const canChangeRole = currentUserIsSuperAdmin || (currentUserIsSuperAdmin === false && !targetIsAdminOrSuperAdmin);
  const roleOptions: { value: string; label: string }[] = currentUserIsSuperAdmin
    ? [
        { value: "user", label: "User" },
        { value: "admin", label: "Admin" },
        { value: "superadmin", label: "Superadmin" },
      ]
    : [
        { value: "user", label: "User" },
        { value: "admin", label: "Admin" },
      ];

  const handleSave = async (skipConfirm = false) => {
    setLoading(true);
    setError(null);
    const session = await getSessionWithRetry();
    const authUserId = session?.user?.id;
    const accessToken = session?.access_token;
    if (!authUserId) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    const newRole = (appRole ?? "").trim().toLowerCase();
    const isTransferSuperAdmin =
      currentUserIsSuperAdmin &&
      newRole === "superadmin" &&
      user.auth_id !== currentUserAuthId;
    if (isTransferSuperAdmin && !skipConfirm) {
      setLoading(false);
      setShowSuperAdminConfirm(true);
      return;
    }
    const { error: err } = await updateUser(
      user.auth_id,
      { full_name: fullName, email, app_role: appRole },
      authUserId
    );
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }
    if (newPassword.trim().length >= 6) {
      const res = await fetch("/api/admin/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ authId: user.auth_id, newPassword: newPassword.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoading(false);
        setError(data.error ?? "Failed to update password");
        return;
      }
    }
    setLoading(false);
    setShowSuperAdminConfirm(false);
    onSaved();
    onClose();
  };

  if (showSuperAdminConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowSuperAdminConfirm(false)}>
        <div
          className="bg-navy-950 rounded-2xl shadow-2xl w-full max-w-md border border-white/10 overflow-hidden p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-white font-semibold text-lg mb-2">Transfer Superadmin?</h3>
          <p className="text-white/80 text-sm mb-4">
            You will be demoted to admin and lose superadmin rights. Only one superadmin can exist. Are you sure?
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={loading}
              className="flex-1 bg-amber-600 text-white p-3 rounded-xl font-semibold hover:bg-amber-500 transition disabled:opacity-60"
            >
              {loading ? "Saving…" : "Yes, transfer"}
            </button>
            <button
              type="button"
              onClick={() => setShowSuperAdminConfirm(false)}
              className="px-4 py-3 rounded-xl text-white/70 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-navy-950 rounded-2xl shadow-2xl w-full max-w-md border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg">Edit user</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <p className="p-3 rounded-xl text-sm bg-red-500/10 text-red-200 border border-red-400/30">
              {error}
            </p>
          )}
          <div>
            <label className="block text-white/60 text-sm mb-1">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl p-3 bg-navy-900/80 border border-navy-800 text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl p-3 bg-navy-900/80 border border-navy-800 text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400"
              placeholder="Email"
            />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">Role</label>
            {canChangeRole ? (
              <select
                value={["user", "admin", "superadmin"].includes((appRole ?? "").trim().toLowerCase()) ? (appRole ?? "").trim().toLowerCase() : "user"}
                onChange={(e) => setAppRole(e.target.value)}
                className="w-full rounded-xl p-3 bg-navy-900/80 border border-navy-800 text-white focus:outline-none focus:ring-1 focus:ring-navy-400"
              >
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full rounded-xl p-3 bg-navy-900/50 border border-navy-800 text-white/70">
                {user.app_role ?? "—"}
              </div>
            )}
            {!canChangeRole && (
              <p className="text-white/50 text-xs mt-1">Admins cannot change the role of other admins or the superadmin.</p>
            )}
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-1">New password (optional)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl p-3 bg-navy-900/80 border border-navy-800 text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400"
              placeholder="Leave blank to keep current password (min 6 chars to change)"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={loading}
              className="flex-1 bg-navy-700 text-white p-3 rounded-xl font-semibold hover:bg-navy-600 transition disabled:opacity-60"
            >
              {loading ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl text-white/70 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  const loadUsers = useCallback(async () => {
    if (!authUserId || !isAdmin) return;
    const { data, error: err } = await getAllUsers(authUserId);
    if (err) setError(err.message);
    else setUsers(data ?? []);
  }, [authUserId, isAdmin]);

  // Sync profile updates from Settings (same or other tab)
  useEffect(() => {
    if (!authUserId || !isAdmin) return;
    const ch = new BroadcastChannel("register-profile");
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "profile-updated") loadUsers();
    };
    ch.addEventListener("message", handler);
    return () => { ch.removeEventListener("message", handler); ch.close(); };
  }, [authUserId, isAdmin, loadUsers]);

  // Reload users when navigating back to this page
  useEffect(() => {
    if (pathname === "/users" && authUserId && isAdmin) loadUsers();
  }, [pathname, authUserId, isAdmin, loadUsers]);

  useEffect(() => {
    (async () => {
      const session = await getSessionWithRetry(500);
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      setAuthUserId(session.user.id);
      const supabase = createClient();
      const { data: userRow } = await supabase
        .from("users")
        .select("app_role")
        .eq("auth_id", session.user.id)
        .single();
      const appRole = ((userRow as { app_role?: string | null } | null)?.app_role ?? "").toLowerCase().trim();
      const admin = appRole === "admin" || appRole === "superadmin";
      setIsAdmin(admin);
      setIsSuperAdmin(appRole === "superadmin");
      if (!admin) {
        setLoading(false);
        return;
      }
      const { data, error: err } = await getAllUsers(session.user.id);
      if (err) setError(err.message);
      else setUsers(data ?? []);
      setLoading(false);
    })();
  }, [router]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const formatDate = (s: string) => {
    try {
      const d = new Date(s);
      return d.toLocaleDateString(undefined, { dateStyle: "medium" });
    } catch {
      return s;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-white/60">Loading…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center p-4">
        <p className="text-red-300 mb-4">Access denied. Only admins can manage users.</p>
        <Link href="/dashboard" className="text-navy-300 hover:text-white">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-white/70 hover:text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Dashboard
          </Link>
          <h1 className="text-xl font-semibold">Manage users</h1>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="px-4 py-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          Sign out
        </button>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {error && (
          <p className="mb-4 p-3 rounded-xl bg-red-500/10 text-red-200 border border-red-400/30">
            {error}
          </p>
        )}
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-navy-900/30">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-4 text-white/60 text-sm font-medium w-12"></th>
                <th className="text-left p-4 text-white/60 text-sm font-medium">Name</th>
                <th className="text-left p-4 text-white/60 text-sm font-medium">Email</th>
                <th className="text-left p-4 text-white/60 text-sm font-medium">Role</th>
                <th className="text-left p-4 text-white/60 text-sm font-medium">Created</th>
                <th className="text-right p-4 text-white/60 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-4">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-navy-800 flex items-center justify-center shrink-0">
                      {u.profile_image ? (
                        <img src={u.profile_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white/40 text-xs font-medium">{(u.full_name ?? "?").charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">{u.full_name ?? "—"}</td>
                  <td className="p-4">{u.email ?? "—"}</td>
                  <td className="p-4">{u.app_role ?? "—"}</td>
                  <td className="p-4 text-white/60 text-sm">{formatDate(u.created_at)}</td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingUser(u)}
                      className="px-3 py-1.5 rounded-lg bg-navy-700 hover:bg-navy-600 text-sm"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="p-8 text-center text-white/50">No users yet.</p>
          )}
        </div>
      </main>

      {editingUser && authUserId && (
        <EditUserModal
          user={editingUser}
          currentUserAuthId={authUserId}
          currentUserIsSuperAdmin={isSuperAdmin}
          onClose={() => setEditingUser(null)}
          onSaved={() => loadUsers()}
        />
      )}
    </div>
  );
}
