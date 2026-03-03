"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, getCachedSession, clearSessionCache } from "@/lib/supabase";
import {
  getWorkspacesForUser,
  getBoardsByWorkspace,
  createBoard,
  createWorkspace,
  getWorkspaceMembers,
  deleteWorkspace,
  searchUsers,
  addWorkspaceMember,
  removeWorkspaceMember,
} from "@/lib/workspace-storage";
import type { Workspace, Board, WorkspaceMember, SearchUser } from "@/lib/workspace-storage";

type BoardWithWorkspace = Board & { workspaceName: string };

const COVER_GRADIENTS = [
  "from-indigo-600 to-purple-700",
  "from-emerald-600 to-teal-700",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-sky-500 to-blue-600",
];

const MEMBER_LIMIT = 10;

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
}: {
  workspaces: Workspace[];
  onBoardsClick?: (ws: Workspace) => void;
  onMembersClick?: (ws: Workspace) => void;
  onDeleteWorkspace?: (ws: Workspace) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(workspaces[0]?.id ?? null);
  const colors = ["bg-orange-500", "bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-slate-900/80 border-r border-white/10">
      <div className="p-4 border-b border-white/10">
        <h2 className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Workspaces</h2>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
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
                  <span className="ml-auto text-indigo-400">+</span>
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
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="rounded-lg bg-slate-800/70 border border-white/10 p-4 relative overflow-hidden">
          <div className="absolute bottom-0 right-0 w-12 h-12 flex items-center justify-center text-indigo-400/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>
          <h3 className="text-white font-semibold text-sm mb-1">Try Premium</h3>
          <p className="text-white/70 text-xs leading-relaxed mb-3">
            Full access, card mirroring, collapsible lists, unlimited boards, AI, and more!
          </p>
          <button type="button" className="text-indigo-400 text-xs font-medium hover:underline">
            Start free trial
          </button>
        </div>
      </div>
    </aside>
  );
}

function CollaboratorsModal({
  workspace,
  authUserId,
  onClose,
}: {
  workspace: Workspace;
  authUserId: string | null;
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
  const ADMIN_NAME = "mughis siddiqui";
  const adminUserId =
    members.find((m) => (m.full_name ?? "").toLowerCase().trim() === ADMIN_NAME.toLowerCase())?.user_id ?? null;
  const isCurrentUserAdmin = authUserId != null && adminUserId === authUserId;

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
    const { error: addErr } = await addWorkspaceMember(workspace.id, authId);
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
        className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-semibold text-lg">Collaborators</h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-white/80 text-sm">
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
          <div>
            <div className="text-indigo-400 text-sm font-medium border-b-2 border-indigo-400 pb-1 w-fit">
              Add collaborator
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by name or email"
              className="mt-3 w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-600 text-white text-sm placeholder:text-slate-500 focus:outline-none"
            />
            {searchQuery.trim() && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-slate-900 border border-slate-700 divide-y divide-slate-700">
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
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

          <div>
            <div className="text-indigo-400 text-sm font-medium border-b-2 border-indigo-400 pb-1 w-fit">
              Members ({members.length})
            </div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name"
              className="mt-3 w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-600 text-white text-sm placeholder:text-slate-500 focus:outline-none"
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
                const isAdmin = m.user_id === adminUserId;
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
                      <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white/90 text-xs">
                        {isAdmin ? "Admin" : "Member"}
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
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white/90 text-xs hover:bg-red-500/20 hover:text-red-300"
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
                      ) : isCurrentUserAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleKick(m.user_id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white/90 text-xs hover:bg-red-500/20 hover:text-red-300"
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
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
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
  const [selectedWorkspaceForMembers, setSelectedWorkspaceForMembers] = useState<Workspace | null>(
    null,
  );
  const [selectedWorkspaceForBoards, setSelectedWorkspaceForBoards] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getCachedSession();
      if (!session?.user) {
        router.replace("/login");
        return;
      }
      const u = session.user;
      const supabase = createClient();
      const { data: userRow } = await supabase
        .from("users")
        .select("full_name")
        .eq("auth_id", u.id)
        .single();
      setUser({
        email: u.email ?? undefined,
        full_name:
          (userRow?.full_name as string) ?? (u.user_metadata?.full_name as string) ?? undefined,
      });
      setAuthUserId(u.id);

      const { data: ws, error: wsErr } = await getWorkspacesForUser(u.id);
      if (wsErr) {
        setError(normalizeNetworkError(wsErr.message));
      } else {
        setWorkspaces(ws ?? []);
        const allBoards: BoardWithWorkspace[] = [];
        for (const w of ws ?? []) {
          const { data: b } = await getBoardsByWorkspace(w.id);
          (b ?? []).forEach((board) =>
            allBoards.push({ ...board, workspaceName: w.name }),
          );
        }
        setBoards(allBoards);
      }
      setLoading(false);
    })();
  }, [router]);

  const handleSignOut = async () => {
    clearSessionCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleCreateWorkspace = async () => {
    const name = addWorkspaceName.trim();
    if (!name || !authUserId) return;
    setError(null);
    const { data, error: createErr } = await createWorkspace(name, authUserId);
    if (createErr) {
      setError(normalizeNetworkError(createErr.message));
      return;
    }
    if (data) {
      setWorkspaces((prev) => [data, ...prev]);
      setAddWorkspaceName("");
      setShowCreateWorkspace(false);
    }
  };

  const handleCreateBoard = async () => {
    const name = addBoardName.trim();
    const workspaceId = addBoardWorkspaceId ?? workspaces[0]?.id;
    if (!name || !workspaceId) return;
    setError(null);
    const { data, error: createErr } = await createBoard(workspaceId, name);
    if (createErr) {
      setError(normalizeNetworkError(createErr.message));
      return;
    }
    if (data) {
      const ws = workspaces.find((w) => w.id === workspaceId);
      setBoards((prev) => [{ ...data, workspaceName: ws?.name ?? "" }, ...prev]);
      setAddBoardName("");
      setAddBoardWorkspaceId(null);
    }
  };

  const handleDeleteWorkspace = async (ws: Workspace) => {
    if (!confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) return;
    setError(null);
    const { error: delErr } = await deleteWorkspace(ws.id);
    if (delErr) {
      setError(normalizeNetworkError(delErr.message));
    } else {
      setWorkspaces((prev) => prev.filter((w) => w.id !== ws.id));
      setBoards((prev) => prev.filter((b) => b.workspace_id !== ws.id));
      if (selectedWorkspaceForMembers?.id === ws.id) {
        setShowMembersModal(false);
        setSelectedWorkspaceForMembers(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-indigo-900/90 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur border border-white/20 animate-pulse" />
          <p className="text-white/80 text-sm font-medium">Loading workspaces…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-800 via-indigo-900/80 to-slate-900">
      <header className="flex items-center justify-between px-6 py-3 bg-white/5 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/25"
          >
            <span className="text-white font-bold text-xl">B</span>
          </Link>
          <span className="text-white font-semibold text-lg tracking-tight">Workspaces</span>
        </div>
        <div className="flex items-center gap-4">
          <span
            className="text-white/90 text-sm truncate max-w-[180px]"
            title={user?.email}
          >
            {user?.full_name ?? user?.email}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 border border-white/10 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <Sidebar
          workspaces={workspaces}
          onBoardsClick={(ws) => {
            setSelectedWorkspaceForBoards(ws);
            setShowBoards(true);
          }}
          onMembersClick={(ws) => {
            setSelectedWorkspaceForMembers(ws);
            setShowMembersModal(true);
          }}
          onDeleteWorkspace={handleDeleteWorkspace}
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
                  <Link
                    key={board.id}
                    href={`/workspace/${board.workspace_id}?board=${board.id}`}
                    className="w-[200px] rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group block"
                  >
                    <div
                      className={`aspect-[16/10] bg-gradient-to-br ${
                        COVER_GRADIENTS[i % COVER_GRADIENTS.length]
                      } shrink-0`}
                    />
                    <div className="p-3">
                      <p className="text-white font-medium truncate group-hover:text-indigo-200">
                        {board.name}
                      </p>
                      <p className="text-white/50 text-xs truncate">
                        {board.workspaceName}
                      </p>
                    </div>
                  </Link>
                ))}

                {addBoardWorkspaceId === selectedWorkspaceForBoards.id ? (
                  <div className="w-[200px] rounded-xl bg-white/5 border border-white/10 p-4 shrink-0">
                    <input
                      type="text"
                      value={addBoardName}
                      onChange={(e) => setAddBoardName(e.target.value)}
                      placeholder="Board name"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-600 text-white text-sm placeholder:text-slate-500 focus:outline-none mb-3"
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
                        className="px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAddBoardWorkspaceId(null);
                          setAddBoardName("");
                        }}
                        className="px-3 py-2 text-slate-400 text-xs"
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
                    "bg-indigo-500",
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
                        </div>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-2">
                        {wsBoards.map((board, i) => (
                          <Link
                            key={board.id}
                            href={`/workspace/${board.workspace_id}?board=${board.id}`}
                            className="w-[160px] shrink-0 rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group block"
                          >
                            <div
                              className={`aspect-[16/10] bg-gradient-to-br ${
                                COVER_GRADIENTS[
                                  (wsIdx * 3 + i) % COVER_GRADIENTS.length
                                ]
                              } shrink-0`}
                            />
                            <div className="p-2.5">
                              <p className="text-white font-medium text-sm truncate group-hover:text-indigo-200">
                                {board.name}
                              </p>
                            </div>
                          </Link>
                        ))}
                        {isCreatingBoard ? (
                          <div className="w-[160px] shrink-0 rounded-xl bg-white/5 border border-white/10 p-4">
                            <input
                              type="text"
                              value={addBoardName}
                              onChange={(e) => setAddBoardName(e.target.value)}
                              placeholder="Board name"
                              className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-600 text-white text-sm placeholder:text-slate-500 focus:outline-none mb-2"
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
                                className="px-2 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg"
                              >
                                Create
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddBoardWorkspaceId(null);
                                  setAddBoardName("");
                                }}
                                className="px-2 py-1.5 text-slate-400 text-xs"
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

                {showCreateWorkspace ? (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-5 max-w-md">
                    <input
                      type="text"
                      value={addWorkspaceName}
                      onChange={(e) => setAddWorkspaceName(e.target.value)}
                      placeholder="Workspace name"
                      className="w-full px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-600 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 mb-3"
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
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700"
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateWorkspace(false);
                          setAddWorkspaceName("");
                        }}
                        className="px-3 py-2 text-slate-400 hover:text-white text-sm"
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
          onClose={() => {
            setShowMembersModal(false);
            setSelectedWorkspaceForMembers(null);
          }}
        />
      )}
    </div>
  );
}

