"use client";

import { useEffect, useState, useRef } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient, getCachedSession, getSessionWithRetry, clearSessionCache } from "@/lib/supabase";
import {
  getWorkspacesForUser,
  getBoardsAccessibleToUser,
  createBoard,
  deleteBoard,
  createWorkspace,
  getWorkspaceMembers,
  deleteWorkspace,
  searchUsers,
  addWorkspaceMember,
  removeWorkspaceMember,
  getBoardMembers,
  addBoardMember,
  removeBoardMember,
} from "@/lib/workspace-storage";
import type { Workspace, Board, WorkspaceMember, SearchUser, BoardMember } from "@/lib/workspace-storage";

type BoardWithWorkspace = Board & { workspaceName: string };

const COVER_GRADIENTS = [
  "from-navy-700 to-navy-800",
  "from-emerald-600 to-teal-700",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-sky-500 to-blue-600",
];

const MEMBER_LIMIT = 10;

/** Admin access is determined by app_role from the users table. */

function AddNewUserModal({
  onClose,
  onSuccess,
  canAssignAdminRole,
}: {
  onClose: () => void;
  onSuccess: () => void;
  /** When true (superadmin), role dropdown includes Admin. When false (admin), new users are created as User only. */
  canAssignAdminRole: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    name: string;
    email: string;
    password: string;
    role: string;
  }>();

  const onSubmit: SubmitHandler<{ name: string; email: string; password: string; role: string }> = async (data) => {
    const nameTrimmed = (data.name ?? "").trim();
    const role = canAssignAdminRole ? ((data.role ?? "user").trim().toLowerCase() || "user") : "user";
    if (canAssignAdminRole && role !== "user" && role !== "admin") {
      setMessage({ type: "error", text: "Invalid role." });
      return;
    }
    if (!canAssignAdminRole && role !== "user") {
      setMessage({ type: "error", text: "Only the superadmin can add users with the Admin role." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { full_name: nameTrimmed, app_role: role } },
    });
    if (error) {
      setLoading(false);
      setMessage({ type: "error", text: error.message });
      return;
    }
    if (authData.user) {
      const { error: usersError } = await supabase.from("users").insert({
        auth_id: authData.user.id,
        email: authData.user.email ?? data.email,
        full_name: nameTrimmed,
        app_role: role,
      });
      if (usersError) {
        setLoading(false);
        setMessage({ type: "error", text: `Account created but profile save failed: ${usersError.message}` });
        return;
      }
    }
    setLoading(false);
    reset();
    setMessage({ type: "success", text: "User registered! They can now sign in." });
    setTimeout(() => onSuccess(), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-navy-950 rounded-2xl shadow-2xl w-full max-w-md border border-white/10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg">Add new user</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6">
          <p className="text-white/60 text-sm mb-4">Add a team member to sign up and use the app.</p>
          {message && (
            <p className={`mb-4 p-3 rounded-xl text-sm ${message.type === "error" ? "bg-red-500/10 text-red-200 border border-red-400/30" : "bg-emerald-500/10 text-emerald-200 border border-emerald-400/30"}`}>
              {message.text}
            </p>
          )}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Full Name"
              className={`w-full rounded-xl p-3 bg-navy-900/80 border text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400 transition ${errors.name ? "border-red-400/50" : "border-navy-800"}`}
              {...register("name", { required: "Name is required" })}
            />
            {errors.name && <p className="text-red-300 text-sm mt-1">{errors.name.message}</p>}
          </div>
          <div className="mb-4">
            <input
              type="email"
              placeholder="Email"
              className={`w-full rounded-xl p-3 bg-navy-900/80 border text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400 transition ${errors.email ? "border-red-400/50" : "border-navy-800"}`}
              {...register("email", { required: "Email is required" })}
            />
            {errors.email && <p className="text-red-300 text-sm mt-1">{errors.email.message}</p>}
          </div>
          <div className="mb-4">
            {canAssignAdminRole ? (
              <select
                className={`w-full rounded-xl p-3 bg-navy-900/80 border text-white focus:outline-none focus:ring-1 focus:ring-navy-400 transition ${errors.role ? "border-red-400/50" : "border-navy-800"}`}
                {...register("role", { required: "Role is required" })}
              >
                <option value="">Choose role</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <div className="w-full rounded-xl p-3 bg-navy-900/50 border border-navy-800 text-white/80 text-sm">
                User (only superadmin can add Admins)
              </div>
            )}
            {errors.role && <p className="text-red-300 text-sm mt-1">{errors.role.message}</p>}
          </div>
          <div className="mb-6">
            <input
              type="password"
              placeholder="Password"
              className={`w-full rounded-xl p-3 bg-navy-900/80 border text-white placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400 transition ${errors.password ? "border-red-400/50" : "border-navy-800"}`}
              {...register("password", { required: "Password is required", minLength: { value: 6, message: "Password must be at least 6 characters" } })}
            />
            {errors.password && <p className="text-red-300 text-sm mt-1">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy-700 text-white p-3 rounded-xl font-semibold hover:bg-navy-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account…" : "Add user"}
          </button>
        </form>
      </div>
    </div>
  );
}

function normalizeNetworkError(msg: string): string {
  if (!msg) return msg;
  const m = msg.toLowerCase();
  if (m === "failed to fetch" || m.includes("failed to fetch") || m.includes("network error")) {
    return "Connection failed. Check your network and Supabase URL.";
  }
  return msg;
}

function Sidebar({
  workspaces,
  onBoardsClick,
  onMembersClick,
  onDeleteWorkspace,
  onAddNewUserClick,
  isAdmin,
}: {
  workspaces: Workspace[];
  onBoardsClick?: (ws: Workspace) => void;
  onMembersClick?: (ws: Workspace) => void;
  onDeleteWorkspace?: (ws: Workspace) => void;
  onAddNewUserClick?: () => void;
  isAdmin?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(workspaces[0]?.id ?? null);
  const colors = ["bg-orange-500", "bg-navy-700", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-navy-950/90 border-r border-white/10">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-navy-300 text-xs font-semibold uppercase tracking-wider">Workspaces</h2>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto py-2">
        {workspaces.map((ws, i) => (
          <div key={ws.id} className="px-2">
            <button
              type="button"
              onClick={() => setExpandedId((prev) => (prev === ws.id ? null : ws.id))}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/90 hover:bg-white/5 text-left"
            >
              <div
                className={`w-8 h-8 rounded flex items-center justify-center text-white font-semibold text-sm shrink-0 ${
                  colors[i % colors.length]
                }`}
              >
                {(ws.name || "?").charAt(0).toUpperCase()}
    </div>
              <span className="flex-1 truncate text-sm font-medium">{ws.name}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`shrink-0 transition-transform ${expandedId === ws.id ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {expandedId === ws.id && (
              <div className="ml-4 pl-6 border-l border-white/10 mt-1 space-y-1">
                <button
                  type="button"
                  onClick={() => onBoardsClick?.(ws)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:bg-white/5 hover:text-white/90 text-sm text-left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect width="7" height="7" x="3" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="14" rx="1" />
                    <rect width="7" height="7" x="3" y="14" rx="1" />
                  </svg>
                  Boards
                </button>
                <button
                  type="button"
                  onClick={() => onMembersClick?.(ws)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:bg-white/5 hover:text-white/90 text-sm text-left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Members
                  <span className="ml-auto text-navy-400">+</span>
                </button>
                <Link
                  href={`/workspace/${ws.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:bg-white/5 hover:text-white/90 text-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </Link>
                {isAdmin && (
                <button
                  type="button"
                  onClick={() => onDeleteWorkspace?.(ws)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-300 hover:bg-red-500/10 hover:text-red-200 text-sm text-left"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" x2="10" y1="11" y2="17" />
                    <line x1="14" x2="14" y1="11" y2="17" />
                  </svg>
                  Delete workspace
                </button>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10 shrink-0 space-y-2">
        {isAdmin ? (
          <>
            <Link
              href="/users"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="text-sm font-medium">Manage users</span>
            </Link>
            <button
              type="button"
              onClick={onAddNewUserClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border-2 border-dashed border-white/20 hover:border-white/40 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <span className="text-xl font-light">+</span>
              <span className="text-sm font-medium">Add new user</span>
            </button>
          </>
        ) : (
          <Link
            href="/settings"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-sm font-medium">Settings</span>
          </Link>
        )}
      </div>
    </aside>
  );
}

function BoardAccessModal({
  board,
  workspaceId,
  authUserId,
  onClose,
  onUpdated,
}: {
  board: BoardWithWorkspace;
  workspaceId: string;
  authUserId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getBoardMembers(board.id),
      getWorkspaceMembers(workspaceId),
    ]).then(([{ data: bm }, { data: wm }]) => {
      setMembers(bm ?? []);
      setWorkspaceMembers(wm ?? []);
      setLoading(false);
    });
  }, [board.id, workspaceId]);

  const memberIds = new Set(members.map((m) => m.user_id));
  const availableToAdd = workspaceMembers.filter((m) => !memberIds.has(m.user_id));

  const handleAdd = async (userId: string) => {
    if (!authUserId) return;
    setAddingUserId(userId);
    setAddError(null);
    const { error } = await addBoardMember(board.id, userId, authUserId);
    if (error) setAddError(error.message);
    else {
      const { data } = await getBoardMembers(board.id);
      setMembers(data ?? []);
      onUpdated();
    }
    setAddingUserId(null);
  };

  const handleRemove = async (userId: string) => {
    if (!authUserId || !confirm("Revoke this user's access to the board?")) return;
    setAddError(null);
    const { error } = await removeBoardMember(board.id, userId, authUserId);
    if (error) setAddError(error.message);
    else {
      const { data } = await getBoardMembers(board.id);
      setMembers(data ?? []);
      onUpdated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-navy-950 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg">Board access: {board.name}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
        <p className="px-4 py-2 text-white/60 text-xs">
          When board has members, only they can see it. Add workspace members to grant access. Remove all to make it visible to everyone in the workspace.
        </p>
        {addError && <p className="px-4 text-red-400 text-sm">{addError}</p>}
        <div className="p-4 border-b border-white/10 space-y-2">
          <div className="text-navy-400 text-sm font-medium">Add from workspace</div>
          {availableToAdd.length === 0 ? (
            <p className="text-white/50 text-sm">All workspace members already have access.</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {availableToAdd.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5">
                  <span className="text-white text-sm">{m.full_name ?? "Unknown"}</span>
                  <button
                    type="button"
                    onClick={() => handleAdd(m.user_id)}
                    disabled={addingUserId === m.user_id}
                    className="px-3 py-1 rounded-lg bg-navy-700 text-white text-xs hover:bg-navy-600 disabled:opacity-50"
                  >
                    {addingUserId === m.user_id ? "Adding…" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-navy-400 text-sm font-medium mb-2">Board members ({members.length})</div>
          {loading ? (
            <p className="text-white/50 text-sm">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-white/50 text-sm">No restrictions. All workspace members can see this board.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const role = (m.app_role ?? "").toLowerCase().trim();
                const isAdmin = role === "admin" || role === "superadmin";
                const roleLabel = role === "superadmin" ? "Superadmin" : role === "admin" ? "Admin" : "Member";
                return (
                  <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5">
                    <span className="text-white text-sm">{m.full_name ?? "Unknown"}{isAdmin && ` (${roleLabel})`}</span>
                    {!isAdmin && (
                      <button type="button" onClick={() => handleRemove(m.user_id)} className="px-3 py-1 rounded-lg text-red-300 text-xs hover:bg-red-500/20">
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CollaboratorsModal({
  workspace,
  authUserId,
  isCurrentUserAdmin,
  onClose,
}: {
  workspace: Workspace;
  authUserId: string | null;
  isCurrentUserAdmin: boolean;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    getWorkspaceMembers(workspace.id).then(({ data }) => {
      setMembers(data ?? []);
      setLoading(false);
    });
  }, [workspace.id]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      searchUsers(searchQuery.trim()).then(({ data }) => {
        setSearchResults(data ?? []);
        setSearching(false);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const memberIds = new Set(members.map((m) => m.user_id));
  const filteredMembers = members.filter((m) =>
    (m.full_name ?? "").toLowerCase().includes(filter.toLowerCase()),
  );
  const availableToAdd = searchResults.filter(
    (u) => !memberIds.has(u.auth_id) && u.auth_id !== authUserId,
  );
  const countDisplay = `${members.length}/${MEMBER_LIMIT}`;

  const handleLeave = async () => {
    if (!authUserId) return;
    setAddError(null);
    const { error: err } = await removeWorkspaceMember(workspace.id, authUserId);
    if (err) setAddError(err.message);
    else onClose();
  };

  const handleKick = async (userId: string) => {
    if (!confirm("Remove this member from the workspace?")) return;
    setAddError(null);
    const { error: err } = await removeWorkspaceMember(workspace.id, userId);
    if (err) setAddError(err.message);
    else {
      const { data } = await getWorkspaceMembers(workspace.id);
      setMembers(data ?? []);
    }
  };

  const handleAddMember = async (authId: string) => {
    if (members.length >= MEMBER_LIMIT) return;
    setAddingUserId(authId);
    setAddError(null);
    const { error: addErr } = await addWorkspaceMember(workspace.id, authId, authUserId!);
    if (addErr) {
      setAddError(addErr.message);
    } else {
      setSearchQuery("");
      setSearchResults([]);
      const { data } = await getWorkspaceMembers(workspace.id);
      setMembers(data ?? []);
    }
    setAddingUserId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-navy-950 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-semibold text-lg">Collaborators</h2>
            <span className="px-2 py-0.5 rounded-full bg-navy-900 text-white/80 text-sm">
              {countDisplay}
            </span>
      </div>
              <button
                type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
              </button>
        </div>

        <div className="p-4 border-b border-white/10 space-y-3">
          {isCurrentUserAdmin && (
            <div>
              <div className="text-navy-400 text-sm font-medium border-b-2 border-navy-400 pb-1 w-fit">
                Add collaborator
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by name or email"
                className="mt-3 w-full px-3 py-2 rounded-lg bg-navy-900/80 border border-navy-800 text-white text-sm placeholder:text-navy-400 focus:outline-none"
              />
              {searchQuery.trim() && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-navy-950 border border-navy-800 divide-navy-800">
                  {searching ? (
                    <div className="px-3 py-4 text-white/60 text-sm">Searching…</div>
                  ) : availableToAdd.length === 0 ? (
                    <div className="px-3 py-4 text-white/60 text-sm">No users found</div>
                  ) : (
                    availableToAdd.map((u) => (
                      <div
                        key={u.auth_id}
                        className="flex items-center justify-between px-3 py-2 gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">
                            {u.full_name ?? u.email ?? "Unknown"}
                          </p>
                          {u.email && (
                            <p className="text-white/50 text-xs truncate">{u.email}</p>
                          )}
                        </div>
              <button
                type="button"
                          onClick={() => handleAddMember(u.auth_id)}
                          disabled={members.length >= MEMBER_LIMIT || addingUserId === u.auth_id}
                          className="px-3 py-1.5 rounded-lg bg-navy-700 text-white text-xs font-medium hover:bg-navy-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                          {addingUserId === u.auth_id ? "Adding…" : "Add"}
              </button>
            </div>
                    ))
                  )}
          </div>
              )}
              {addError && (
                <p className="text-red-400 text-xs mt-2">
                  {addError}
                </p>
              )}
            </div>
          )}

          <div>
            <div className="text-navy-400 text-sm font-medium border-b-2 border-navy-400 pb-1 w-fit">
              Members ({members.length})
            </div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name"
              className="mt-3 w-full px-3 py-2 rounded-lg bg-navy-900/80 border border-navy-800 text-white text-sm placeholder:text-navy-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="text-white/60 text-sm py-4">No members found</p>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((m) => {
                const name = m.full_name ?? "Unknown";
                const initials =
                  name
                    .split(/\s+/)
                    .map((s) => s[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "?";
                const username = name.toLowerCase().replace(/\s+/g, "") || "user";
                const role = (m.app_role ?? "").toLowerCase().trim();
                const isAdmin = role === "admin" || role === "superadmin";
                const roleLabel = role === "superadmin" ? "Superadmin" : role === "admin" ? "Admin" : "Member";
                const isCurrentUser = m.user_id === authUserId;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{name}</p>
                      <p className="text-white/50 text-xs truncate">@{username}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy-900 text-white/90 text-xs">
                        {roleLabel}
                        {isAdmin && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        )}
                      </span>
                      {isCurrentUser ? (
          <button
            type="button"
                          onClick={handleLeave}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy-900 text-white/90 text-xs hover:bg-red-500/20 hover:text-red-300"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M15 3h6v6" />
                            <path d="M10 14 21 3" />
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          </svg>
                          Leave
          </button>
                      ) : isCurrentUserAdmin && !isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleKick(m.user_id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy-900 text-white/90 text-xs hover:bg-red-500/20 hover:text-red-300"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M15 3h6v6" />
                            <path d="M10 14 21 3" />
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          </svg>
                          Kick
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string; full_name?: string; profile_image?: string | null; app_role?: string | null } | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<BoardWithWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBoards, setShowBoards] = useState(false);
  const [addBoardName, setAddBoardName] = useState("");
  const [addBoardWorkspaceId, setAddBoardWorkspaceId] = useState<string | null>(null);
  const [addWorkspaceName, setAddWorkspaceName] = useState("");
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showBoardAccessModal, setShowBoardAccessModal] = useState(false);
  const [showAddNewUserModal, setShowAddNewUserModal] = useState(false);
  const [selectedWorkspaceForMembers, setSelectedWorkspaceForMembers] = useState<Workspace | null>(
    null,
  );
  const [selectedBoardForAccess, setSelectedBoardForAccess] = useState<BoardWithWorkspace | null>(null);
  const [selectedWorkspaceForBoards, setSelectedWorkspaceForBoards] = useState<Workspace | null>(null);
  const [showProfileExpanded, setShowProfileExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const safeBroadcast = () => {
    try {
      broadcastChannelRef.current?.postMessage({ type: "broadcast", event: "refresh" });
    } catch {
      // Channel may be closed (e.g. user navigated away)
    }
  };
  const optimisticallyDeletedBoardIdsRef = useRef<Set<string>>(new Set());
  const optimisticallyDeletedWorkspaceIdsRef = useRef<Set<string>>(new Set());
  const creatingWorkspaceRef = useRef(false);
  const isAdmin = ((user?.app_role ?? "").toLowerCase().trim() === "admin") || ((user?.app_role ?? "").toLowerCase().trim() === "superadmin");

  const refreshDashboard = async () => {
    if (!authUserId) return;
    const { data: ws, error: wsErr } = await getWorkspacesForUser(authUserId);
    if (wsErr) {
      setError(normalizeNetworkError(wsErr.message));
      return;
    }
    const allBoards: BoardWithWorkspace[] = [];
    for (const w of ws ?? []) {
      const { data: b } = await getBoardsAccessibleToUser(w.id, authUserId);
      (b ?? []).forEach((board) =>
        allBoards.push({ ...board, workspaceName: w.name }),
      );
    }
    // Don't overwrite boards/workspaces we optimistically removed (delete may not have committed yet)
    const deletedBoards = optimisticallyDeletedBoardIdsRef.current;
    const deletedWorkspaces = optimisticallyDeletedWorkspaceIdsRef.current;
    const filteredWs = deletedWorkspaces.size
      ? (ws ?? []).filter((w) => !deletedWorkspaces.has(w.id))
      : ws ?? [];
    const filteredBoards =
      deletedBoards.size || deletedWorkspaces.size
        ? allBoards.filter(
            (b) => !deletedBoards.has(b.id) && !deletedWorkspaces.has(b.workspace_id),
          )
        : allBoards;
    setWorkspaces((prev) => {
      const pending = prev.filter((w) => String(w.id).startsWith("temp-ws-"));
      return pending.length ? [...filteredWs, ...pending] : filteredWs;
    });
    setBoards(filteredBoards);
    setError(null);
  };

  useEffect(() => {
    (async () => {
      const session = await getSessionWithRetry(500);
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      const u = session.user;
      const supabase = createClient();
      const { data: userRow } = await supabase
        .from("users")
        .select("full_name, profile_image, app_role")
        .eq("auth_id", u.id)
        .single();
      const row = userRow as { full_name?: string; profile_image?: string | null; app_role?: string | null } | null;
      setUser({
        email: u.email ?? undefined,
        full_name:
          (row?.full_name as string) ?? (u.user_metadata?.full_name as string) ?? undefined,
        profile_image: row?.profile_image ?? null,
        app_role: row?.app_role ?? null,
      });
      setAuthUserId(u.id);

      const { data: ws, error: wsErr } = await getWorkspacesForUser(u.id);
      if (wsErr) {
        setError(normalizeNetworkError(wsErr.message));
      } else {
        setWorkspaces(ws ?? []);
        const allBoards: BoardWithWorkspace[] = [];
        for (const w of ws ?? []) {
          const { data: b } = await getBoardsAccessibleToUser(w.id, u.id);
          (b ?? []).forEach((board) =>
            allBoards.push({ ...board, workspaceName: w.name }),
          );
        }
        setBoards(allBoards);
      }
      setLoading(false);
    })();
  }, [router]);

  const refetchUser = async () => {
    if (!authUserId) return;
    const supabase = createClient();
    const { data: userRow } = await supabase
      .from("users")
      .select("full_name, profile_image, app_role")
      .eq("auth_id", authUserId)
      .single();
    const row = userRow as { full_name?: string; profile_image?: string | null; app_role?: string | null } | null;
    setUser((prev) =>
      prev
        ? {
            ...prev,
            full_name: (row?.full_name as string) ?? prev.full_name,
            profile_image: row?.profile_image ?? null,
            app_role: row?.app_role ?? null,
          }
        : prev
    );
  };

  useEffect(() => {
    if (!authUserId) return;
    const onVisible = () => refetchUser();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authUserId]);

  // BroadcastChannel: sync across tabs when boards/workspaces change
  useEffect(() => {
    if (!authUserId) return;
    broadcastChannelRef.current = new BroadcastChannel("register-dashboard");
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "broadcast" && e.data?.event === "refresh") {
        refreshDashboard();
      }
    };
    broadcastChannelRef.current.addEventListener("message", handler);
    return () => {
      broadcastChannelRef.current?.removeEventListener("message", handler);
      broadcastChannelRef.current?.close();
    };
  }, [authUserId]);

  // BroadcastChannel: sync profile updates from Settings (same or other tab)
  useEffect(() => {
    if (!authUserId) return;
    const ch = new BroadcastChannel("register-profile");
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "profile-updated") refetchUser();
    };
    ch.addEventListener("message", handler);
    return () => { ch.removeEventListener("message", handler); ch.close(); };
  }, [authUserId]);

  // Refetch user when navigating back to dashboard (e.g. from Settings)
  useEffect(() => {
    if (pathname === "/dashboard" && authUserId) refetchUser();
  }, [pathname, authUserId]);

  // Supabase Realtime: sync when boards/workspace change in DB (other devices)
  useEffect(() => {
    if (!authUserId) return;
    const supabase = createClient();
    const onRefresh = () => {
      refreshDashboard();
      safeBroadcast();
    };
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, onRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_members" }, onRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace" }, onRefresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUserId]);

  // Polling fallback: refresh every 5s
  useEffect(() => {
    if (!authUserId) return;
    let cancelled = false;
    const poll = () => {
      refreshDashboard().catch(() => {});
    };
    const id = setInterval(() => {
      if (!cancelled) poll();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [authUserId]);

  const handleSignOut = async () => {
    clearSessionCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleCreateWorkspace = async () => {
    const name = addWorkspaceName.trim();
    if (!name || !authUserId) return;
    const canCreate =
      ((user?.app_role ?? "").toLowerCase().trim() === "admin") || ((user?.app_role ?? "").toLowerCase().trim() === "superadmin");
    if (!canCreate) {
      setError("Only admins can create workspaces.");
      return;
    }
    if (creatingWorkspaceRef.current) return;
    creatingWorkspaceRef.current = true;
    setError(null);
    const tempId = `temp-ws-${Date.now()}`;
    const optimistic: Workspace = {
      id: tempId,
      name,
      created_at: new Date().toISOString(),
    };
    setWorkspaces((prev) => [optimistic, ...prev]);
    setAddWorkspaceName("");
    setShowCreateWorkspace(false);

    const { data, error: createErr } = await createWorkspace(name, authUserId);
    creatingWorkspaceRef.current = false;
    if (createErr) {
      setError(normalizeNetworkError(createErr.message));
      setWorkspaces((prev) => prev.filter((w) => w.id !== tempId));
      return;
    }
    if (data) {
      setWorkspaces((prev) => [
        data,
        ...prev.filter((w) => w.id !== tempId && w.id !== data.id),
      ]);
      safeBroadcast();
    }
  };

  const handleCreateBoard = async () => {
    const name = addBoardName.trim();
    const workspaceId = addBoardWorkspaceId ?? workspaces[0]?.id;
    if (!name || !workspaceId) return;
    setError(null);
    const ws = workspaces.find((w) => w.id === workspaceId);
    const tempId = `temp-${Date.now()}`;
    const optimistic: BoardWithWorkspace = {
      id: tempId,
      name,
      workspace_id: workspaceId,
      created_at: new Date().toISOString(),
      workspaceName: ws?.name ?? "",
    };
    setBoards((prev) => [optimistic, ...prev]);
    setAddBoardName("");
    setAddBoardWorkspaceId(null);

    const { data, error: createErr } = await createBoard(workspaceId, name, authUserId ?? undefined);
    if (createErr) {
      setError(normalizeNetworkError(createErr.message));
      setBoards((prev) => prev.filter((b) => b.id !== tempId));
      return;
    }
    if (data) {
      const workspaceName = ws?.name ?? "";
      setBoards((prev) => [
        { ...data, workspaceName },
        ...prev.filter((b) => b.id !== tempId && b.id !== data.id),
      ]);
      safeBroadcast();
    }
  };

  const handleDeleteBoard = async (board: BoardWithWorkspace) => {
    if (!confirm(`Delete board "${board.name}"? This cannot be undone.`)) return;
    setError(null);
    optimisticallyDeletedBoardIdsRef.current.add(board.id);
    setBoards((prev) => prev.filter((b) => b.id !== board.id));

    const { error: delErr } = await deleteBoard(board.id, authUserId!);
    if (delErr) {
      setError(normalizeNetworkError(delErr.message));
      optimisticallyDeletedBoardIdsRef.current.delete(board.id);
      setBoards((prev) => [board, ...prev]);
    } else {
      optimisticallyDeletedBoardIdsRef.current.delete(board.id);
    }
  };

  const handleDeleteWorkspace = async (ws: Workspace) => {
    if (!confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) return;
    setError(null);
    optimisticallyDeletedWorkspaceIdsRef.current.add(ws.id);
    setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
    setBoards((prev) => prev.filter((b) => b.workspace_id !== ws.id));

    const { error: delErr } = await deleteWorkspace(ws.id, authUserId!);
    if (delErr) {
      setError(normalizeNetworkError(delErr.message));
      optimisticallyDeletedWorkspaceIdsRef.current.delete(ws.id);
      setWorkspaces((prev) => [...prev, ws].sort((a, b) => a.name.localeCompare(b.name)));
      // Restore boards for this workspace - we'd need to refetch; simpler: just refresh
      refreshDashboard();
    } else {
      optimisticallyDeletedWorkspaceIdsRef.current.delete(ws.id);
      if (selectedWorkspaceForMembers?.id === ws.id) {
        setShowMembersModal(false);
        setSelectedWorkspaceForMembers(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-navy-950 via-navy-900/90 to-navy-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur border border-white/20 animate-pulse" />
          <p className="text-white/80 text-sm font-medium">Loading workspaces…</p>
        </div>
      </div>
    );
  }

    return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-navy-950 via-navy-900/80 to-navy-950">
      <header className="flex items-center justify-between px-6 py-3 bg-white/5 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center justify-center shrink-0"
          >
            <Image
              src="/Resolute Trello-03.png"
              alt="Logo"
              width={160}
              height={40}
              className="h-10 w-auto object-contain"
            />
          </Link>
          <span className="text-white font-semibold text-lg tracking-tight">Workspaces</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowProfileExpanded(true)}
            className="flex items-center gap-3 rounded-lg hover:bg-white/5 px-2 py-1.5 -mx-2 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-navy-800 flex items-center justify-center shrink-0">
              {user?.profile_image && String(user.profile_image).trim() ? (
                <img src={user.profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white/60 text-sm font-medium">{(user?.full_name ?? user?.email ?? "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <span
              className="text-white/90 text-sm truncate max-w-[180px]"
              title={user?.email}
            >
              {user?.full_name ?? user?.email}
            </span>
          </button>
        <button
          type="button"
          onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 border border-white/10 transition-colors"
        >
          Sign out
        </button>
      </div>
      </header>

      {showProfileExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-profile-overlay-in"
          onClick={() => setShowProfileExpanded(false)}
        >
          <div
            className="relative group cursor-pointer animate-profile-image-in"
            onClick={(e) => { e.stopPropagation(); router.push("/settings"); setShowProfileExpanded(false); }}
          >
            <div className="w-56 h-56 sm:w-72 sm:h-72 md:w-96 md:h-96 rounded-full overflow-hidden bg-navy-800 flex items-center justify-center border-4 border-white/20 shadow-2xl">
              {user?.profile_image && String(user.profile_image).trim() ? (
                <img src={user.profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white/60 text-6xl sm:text-7xl md:text-8xl font-medium">{(user?.full_name ?? user?.email ?? "?").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <span className="text-white font-medium text-base sm:text-lg">Update profile</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <Sidebar
          workspaces={workspaces}
          isAdmin={isAdmin}
          onBoardsClick={(ws) => {
            setSelectedWorkspaceForBoards(ws);
            setShowBoards(true);
          }}
          onMembersClick={(ws) => {
            setSelectedWorkspaceForMembers(ws);
            setShowMembersModal(true);
          }}
          onDeleteWorkspace={handleDeleteWorkspace}
          onAddNewUserClick={() => setShowAddNewUserModal(true)}
        />
        <main className="flex-1 overflow-auto p-6 flex flex-col min-h-0">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-400/30 text-red-200 rounded-xl text-sm shrink-0">
              {error}
          </div>
          )}

          {showBoards && selectedWorkspaceForBoards ? (
            <section className="flex-1">
              <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
                  onClick={() => { setShowBoards(false); setSelectedWorkspaceForBoards(null); }}
                  className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label="Back to workspaces"
          >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          </button>
                <h2 className="text-white/90 text-sm font-medium uppercase tracking-wider flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect width="7" height="7" x="3" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="14" rx="1" />
                    <rect width="7" height="7" x="3" y="14" rx="1" />
                  </svg>
                  Boards in {selectedWorkspaceForBoards.name}
                </h2>
        </div>
              <div className="flex flex-wrap gap-4">
                {boards
                  .filter((b) => b.workspace_id === selectedWorkspaceForBoards.id)
                  .map((board, i) => (
                  <div key={board.id} className="relative w-[200px] shrink-0 group/card">
                    <Link
                      href={`/workspace/${board.workspace_id}?board=${board.id}`}
                      className="block w-full rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left"
                    >
                      <div
                        className={`aspect-[16/10] bg-gradient-to-br ${
                          COVER_GRADIENTS[i % COVER_GRADIENTS.length]
                        } shrink-0`}
                      />
                      <div className="p-3">
                        <p className="text-white font-medium truncate group-hover/card:text-navy-400">
                          {board.name}
                        </p>
                        <p className="text-white/50 text-xs truncate">
                          {board.workspaceName}
                        </p>
                      </div>
                    </Link>
                    {isAdmin && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedBoardForAccess(board); setShowBoardAccessModal(true); }}
                        className="p-1.5 rounded-lg bg-black/50 hover:bg-navy-600 text-white/80 hover:text-white transition-colors"
                        aria-label="Board access"
                        title="Board access"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteBoard(board); }}
                        className="p-1.5 rounded-lg bg-black/50 hover:bg-red-500/80 text-white/80 hover:text-white transition-colors"
                        aria-label="Delete board"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                      </button>
                    </div>
                    )}
                  </div>
                ))}

                {addBoardWorkspaceId === selectedWorkspaceForBoards.id ? (
                  <div className="w-[200px] rounded-xl bg-white/5 border border-white/10 p-4 shrink-0">
                <input
                  type="text"
                      value={addBoardName}
                      onChange={(e) => setAddBoardName(e.target.value)}
                      placeholder="Board name"
                      className="w-full px-3 py-2 rounded-lg bg-navy-900/80 border border-navy-800 text-white text-sm placeholder:text-navy-400 focus:outline-none mb-3"
                      autoFocus
                  onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateBoard();
                        if (e.key === "Escape") {
                          setAddBoardWorkspaceId(null);
                          setAddBoardName("");
                        }
                      }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                        onClick={handleCreateBoard}
                        className="px-3 py-2 bg-navy-700 text-white text-xs font-medium rounded-lg"
                  >
                        Create
                  </button>
                  <button
                    type="button"
                        onClick={() => {
                          setAddBoardWorkspaceId(null);
                          setAddBoardName("");
                        }}
                        className="px-3 py-2 text-navy-400 text-xs"
                      >
                        Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                    onClick={() => setAddBoardWorkspaceId(selectedWorkspaceForBoards.id)}
                    className="w-[200px] rounded-xl bg-white/5 hover:bg-white/10 border-2 border-dashed border-white/20 hover:border-white/40 min-h-[120px] flex flex-col items-center justify-center text-white/60 hover:text-white/80 shrink-0 transition-all"
              >
                    <span className="text-2xl font-light mb-1">+</span>
                    <span className="text-sm font-medium">Create new board</span>
              </button>
            )}
          </div>
            </section>
          ) : (
            <section className="flex-1">
              <h2 className="text-white/90 text-xs font-semibold uppercase tracking-wider mb-5">
                Your workspaces
              </h2>
              <div className="space-y-8">
                {workspaces.map((ws, wsIdx) => {
                  const wsBoards = boards.filter(
                    (b) => b.workspace_id === ws.id,
                  );
                  const colors = [
                    "bg-orange-500",
                    "bg-navy-700",
                    "bg-emerald-500",
                    "bg-amber-500",
                    "bg-rose-500",
                  ];
                  const isCreatingBoard = addBoardWorkspaceId === ws.id;
                  return (
                    <div key={ws.id}>
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className={`w-10 h-10 rounded flex items-center justify-center text-white font-bold text-lg shrink-0 ${
                            colors[wsIdx % colors.length]
                          }`}
                        >
                          {(ws.name || "?").charAt(0).toUpperCase()}
          </div>
                        <span className="text-white font-medium text-base flex-1">
                          {ws.name}
                        </span>
                        <div className="flex items-center gap-2">
          <button
            type="button"
                            onClick={() => {
                              setSelectedWorkspaceForMembers(ws);
                              setShowMembersModal(true);
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 text-sm"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            Members
          </button>
                          <Link
                            href={`/workspace/${ws.id}`}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 text-sm"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            Settings
                          </Link>
                          {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteWorkspace(ws)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 text-sm"
                            aria-label="Delete workspace"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" x2="10" y1="11" y2="17" />
                              <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                          </button>
                          )}
        </div>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-2">
                        {wsBoards.map((board, i) => (
                          <div key={board.id} className="relative w-[160px] shrink-0 group/card">
                            <Link
                              href={`/workspace/${board.workspace_id}?board=${board.id}`}
                              className="block w-full rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left"
        >
          <div
                                className={`aspect-[16/10] bg-gradient-to-br ${
                                  COVER_GRADIENTS[
                                    (wsIdx * 3 + i) % COVER_GRADIENTS.length
                                  ]
                                } shrink-0`}
                              />
                              <div className="p-2.5">
                                <p className="text-white font-medium text-sm truncate group-hover/card:text-navy-400">
                                  {board.name}
                                </p>
                              </div>
                            </Link>
                            {isAdmin && (
                            <div className="absolute top-1 right-1 flex gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedBoardForAccess(board); setShowBoardAccessModal(true); }}
                                className="p-1 rounded-lg bg-black/50 hover:bg-navy-600 text-white/80 hover:text-white transition-colors"
                                aria-label="Board access"
                                title="Board access"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteBoard(board); }}
                                className="p-1 rounded-lg bg-black/50 hover:bg-red-500/80 text-white/80 hover:text-white transition-colors"
                                aria-label="Delete board"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                              </button>
                            </div>
                            )}
                          </div>
                        ))}
                        {isCreatingBoard ? (
                          <div className="w-[160px] shrink-0 rounded-xl bg-white/5 border border-white/10 p-4">
                            <input
                              type="text"
                              value={addBoardName}
                              onChange={(e) => setAddBoardName(e.target.value)}
                              placeholder="Board name"
                              className="w-full px-3 py-2 rounded-lg bg-navy-900/80 border border-navy-800 text-white text-sm placeholder:text-navy-400 focus:outline-none mb-2"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateBoard();
                                if (e.key === "Escape") {
                                  setAddBoardWorkspaceId(null);
                                  setAddBoardName("");
                                }
                              }}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleCreateBoard}
                                className="px-2 py-1.5 bg-navy-700 text-white text-xs font-medium rounded-lg"
                              >
                                Create
                              </button>
                  <button
                    type="button"
                    onClick={() => {
                                  setAddBoardWorkspaceId(null);
                                  setAddBoardName("");
                                }}
                                className="px-2 py-1.5 text-navy-400 text-xs"
                              >
                                Cancel
                  </button>
                            </div>
                          </div>
                        ) : (
            <button
              type="button"
                            onClick={() => setAddBoardWorkspaceId(ws.id)}
                            className="w-[160px] shrink-0 rounded-xl bg-white/5 hover:bg-white/10 border-2 border-dashed border-white/20 hover:border-white/40 min-h-[90px] flex flex-col items-center justify-center text-white/60 hover:text-white/80 transition-all"
                          >
                            <span className="text-xl font-light mb-0.5">+</span>
                            <span className="text-xs font-medium">
                              Create new board
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {((user?.app_role ?? "").toLowerCase().trim() === "admin" || (user?.app_role ?? "").toLowerCase().trim() === "superadmin") && (
                  showCreateWorkspace ? (
                    <div className="rounded-xl bg-white/5 border border-white/10 p-5 max-w-md">
                      <input
                        type="text"
                        value={addWorkspaceName}
                        onChange={(e) => setAddWorkspaceName(e.target.value)}
                        placeholder="Workspace name"
                        className="w-full px-4 py-2 rounded-xl bg-navy-900/80 border border-navy-800 text-white text-sm placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-400 mb-3"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateWorkspace();
                          if (e.key === "Escape") {
                            setShowCreateWorkspace(false);
                            setAddWorkspaceName("");
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCreateWorkspace}
                          className="px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-xl hover:bg-navy-600"
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateWorkspace(false);
                            setAddWorkspaceName("");
                          }}
                          className="px-3 py-2 text-navy-400 hover:text-white text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCreateWorkspace(true)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border-2 border-dashed border-white/20 hover:border-white/40 text-white/60 hover:text-white/80 transition-all"
                    >
                      <span className="text-lg">+</span>
                      <span className="text-sm font-medium">Create new workspace</span>
                    </button>
                  )
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {showMembersModal && selectedWorkspaceForMembers && (
        <CollaboratorsModal
          workspace={selectedWorkspaceForMembers}
          authUserId={authUserId}
          isCurrentUserAdmin={isAdmin}
          onClose={() => {
            setShowMembersModal(false);
            setSelectedWorkspaceForMembers(null);
          }}
        />
      )}

      {showAddNewUserModal && (
        <AddNewUserModal
          canAssignAdminRole={((user?.app_role ?? "").toLowerCase().trim() === "superadmin")}
          onClose={() => setShowAddNewUserModal(false)}
          onSuccess={() => setShowAddNewUserModal(false)}
        />
      )}

      {showBoardAccessModal && selectedBoardForAccess && (
        <BoardAccessModal
          board={selectedBoardForAccess}
          workspaceId={selectedBoardForAccess.workspace_id}
          authUserId={authUserId}
          onClose={() => {
            setShowBoardAccessModal(false);
            setSelectedBoardForAccess(null);
          }}
          onUpdated={() => {
            refreshDashboard();
            safeBroadcast();
          }}
        />
      )}
    </div>
  );
}

