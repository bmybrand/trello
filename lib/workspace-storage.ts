import { createClient, clearSessionCache } from "./supabase";

export type Workspace = {
  id: string;
  name: string;
  created_at: string;
  boardid?: string | null;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  created_at: string;
  full_name?: string | null;
  app_role?: string | null;
};

export type Board = {
  id: string;
  name: string;
  workspace_id: string;
  created_at: string;
  cardid?: string | null;
};

export type BoardMember = {
  id: number;
  board_id: string;
  user_id: string;
  role: string | null;
  created_at: string;
  full_name?: string | null;
  app_role?: string | null;
};

/** Get all workspaces the user is a member of (via workspace_members). */
export async function getWorkspacesForUser(userId: string): Promise<{
  data: Workspace[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);
  if (error) return { data: null, error };
  const workspaceIds = [...new Set((rows ?? []).map((r: { workspace_id: number }) => String(r.workspace_id)))];
  if (workspaceIds.length === 0) return { data: [], error: null };
  const numericIds = workspaceIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n));
  const idList = numericIds.length === workspaceIds.length ? numericIds : workspaceIds;
  const { data: workspaces, error: wsError } = await supabase
    .from("workspace")
    .select("id, name, created_at")
    .in("id", idList)
    .order("created_at", { ascending: false });
  if (wsError) return { data: null, error: wsError };
  const list = (workspaces ?? []).map((w: { id: string | number; name: string; created_at: string }) => ({
    id: String(w.id),
    name: w.name,
    created_at: w.created_at,
    boardid: null as string | null,
  }));
  return { data: list, error: null };
}

/** Get a single workspace by id. (workspace has no boardid; use getBoardsByWorkspace for boards.) */
export async function getWorkspace(workspaceId: string): Promise<{
  data: Workspace | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("workspace")
    .select("id, name, created_at")
    .eq("id", workspaceId)
    .single();
  if (error) return { data: null, error };
  const w = data as { id: string; name: string; created_at: string };
  return { data: { id: String(w.id), name: w.name, created_at: w.created_at, boardid: null }, error: null };
}

/** Create a workspace and add the creator + all admins/superadmins as members (insert workspace first, then workspace_members). */
export async function createWorkspace(
  name: string,
  creatorUserId: string
): Promise<{ data: Workspace | null; error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, creatorUserId))) {
    return { data: null, error: new Error("Only the admin can create workspaces.") };
  }
  const { data: created, error } = await supabase
    .from("workspace")
    .insert({ name: name.trim(), created_at: new Date().toISOString() })
    .select("id, name, created_at")
    .single();
  if (error || !created?.id) {
    return { data: null, error: error ?? new Error("Workspace was created but no id was returned") };
  }
  const workspaceIdNum = Number(created.id);
  const workspaceId = String(created.id);

  const { data: adminRows } = await supabase.from("users").select("auth_id, app_role").in("app_role", ["admin", "superadmin"]);
  const admins = (adminRows ?? []) as { auth_id: string; app_role: string }[];
  const membersToInsert: { workspace_id: number; user_id: string; role: string; created_at: string }[] = [];
  const now = new Date().toISOString();
  membersToInsert.push({ workspace_id: workspaceIdNum, user_id: creatorUserId, role: "owner", created_at: now });
  for (const a of admins) {
    if (a.auth_id === creatorUserId) continue;
    membersToInsert.push({ workspace_id: workspaceIdNum, user_id: a.auth_id, role: "member", created_at: now });
  }
  const { error: memberError } = await supabase.from("workspace_members").insert(membersToInsert);
  if (memberError) {
    await supabase.from("workspace").delete().eq("id", created.id);
    return { data: null, error: memberError };
  }
  return {
    data: {
      id: workspaceId,
      name: (created.name as string) ?? name.trim(),
      created_at: (created.created_at as string) ?? new Date().toISOString(),
      boardid: null,
    },
    error: null,
  };
}

/** Check if user (auth_id) has app_role 'admin' or 'superadmin'. */
async function isAdmin(supabase: ReturnType<typeof createClient>, authId: string): Promise<boolean> {
  const { data } = await supabase.from("users").select("app_role").eq("auth_id", authId).single();
  const role = ((data as { app_role?: string } | null)?.app_role ?? "").toLowerCase().trim();
  return role === "admin" || role === "superadmin";
}

/** Check if user (auth_id) has app_role 'superadmin'. */
export async function isSuperAdmin(supabase: ReturnType<typeof createClient>, authId: string): Promise<boolean> {
  const { data } = await supabase.from("users").select("app_role").eq("auth_id", authId).single();
  const role = ((data as { app_role?: string } | null)?.app_role ?? "").toLowerCase().trim();
  return role === "superadmin";
}

/** Delete a workspace and all its boards (boards.workspaceid = workspaceId), their cardslist, list order, items, comments, activities. Only admin can delete. */
export async function deleteWorkspace(workspaceId: string, requesterAuthId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can delete workspaces.") };
  }
  const { data: boardRows, error: boardsErr } = await supabase
    .from("boards")
    .select("id")
    .eq("workspaceid", workspaceId);
  if (boardsErr) return { error: boardsErr };
  const boardIds = (boardRows ?? []).map((r: { id: number }) => String(r.id));

  const itemIds = new Set<number>();
  for (const boardId of boardIds) {
    const { data: colRows } = await supabase.from("cardslist").select("id").eq("boardid", boardId);
    const columnIds = (colRows ?? []).map((r: { id: number }) => r.id);
    if (columnIds.length > 0) {
      const { data: itemRows } = await supabase.from("itemslist").select("id").in("cardid", columnIds);
      (itemRows ?? []).forEach((r: { id: number }) => itemIds.add(r.id));
    }
    await supabase.from("board_list_order").delete().eq("boardname", boardId);
    await supabase.from("cardslist").delete().eq("boardid", boardId);
    await supabase.from("board_members").delete().eq("board_id", boardId);
  }

  for (const itemId of itemIds) {
    await supabase.from("item_comments").delete().eq("item_id", itemId);
    await supabase.from("item_activities").delete().eq("item_id", itemId);
    await supabase.from("itemslist").delete().eq("id", itemId);
  }

  if (boardIds.length > 0) {
    const { error: boardDelErr } = await supabase.from("boards").delete().eq("workspaceid", workspaceId);
    if (boardDelErr) return { error: boardDelErr };
  }

  const { error } = await supabase.from("workspace").delete().eq("id", workspaceId);
  return { error };
}

/** Update workspace name. */
export async function updateWorkspace(
  workspaceId: string,
  name: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("workspace")
    .update({ name: name.trim() })
    .eq("id", workspaceId);
  return { error };
}

/** Check if user is a member of the workspace. */
export async function isWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return !error && data != null;
}

export type SearchUser = {
  id: number;
  auth_id: string;
  full_name: string | null;
  email: string | null;
};

/** Search users in the public users table by name or email. */
export async function searchUsers(query: string, limit = 20): Promise<{
  data: SearchUser[] | null;
  error: Error | null;
}> {
  if (!query?.trim()) return { data: [], error: null };
  const supabase = createClient();
  const q = query.trim();
  const { data, error } = await supabase
    .from("users")
    .select("id, auth_id, full_name, email")
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(limit);
  if (error) return { data: null, error };
  return { data: (data ?? []) as SearchUser[], error: null };
}

/** Get workspace members (from workspace_members + users for full_name, app_role). */
export async function getWorkspaceMembers(workspaceId: string): Promise<{
  data: WorkspaceMember[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return { data: null, error };
  if (!rows?.length) return { data: [], error: null };
  const userIds = [...new Set((rows as { user_id: string }[]).map((r) => r.user_id))];
  const { data: users } = await supabase.from("users").select("auth_id, full_name, app_role").in("auth_id", userIds);
  const byAuthId = new Map(
    (users ?? []).map((u: { auth_id: string; full_name: string | null; app_role: string | null }) => [
      u.auth_id,
      { full_name: u.full_name, app_role: u.app_role },
    ])
  );
  const data = (rows as WorkspaceMember[]).map((r) => {
    const u = byAuthId.get(r.user_id);
    return { ...r, id: String(r.id), full_name: u?.full_name ?? null, app_role: u?.app_role ?? null };
  });
  return { data, error: null };
}

/** Add a user to a workspace. Requester must be workspace member or app admin. */
export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  requesterAuthId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const isMember = await isWorkspaceMember(workspaceId, requesterAuthId);
  const admin = await isAdmin(supabase, requesterAuthId);
  if (!isMember && !admin) {
    return { error: new Error("You must be a workspace member or admin to add members.") };
  }
  const { error } = await supabase.from("workspace_members").insert({
    workspace_id: Number(workspaceId),
    user_id: userId,
    role: "member",
    created_at: new Date().toISOString(),
  });
  return { error };
}

/** Remove a user from a workspace. Requester must be workspace member or app admin. */
export async function removeWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", Number(workspaceId))
    .eq("user_id", userId);
  return { error };
}

/** Get boards in a workspace (boards.workspaceid = workspaceId). */
export async function getBoardsByWorkspace(workspaceId: string): Promise<{
  data: Board[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: boards, error } = await supabase
    .from("boards")
    .select("id, name, created_at")
    .eq("workspaceid", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return { data: null, error };
  if (!boards?.length) return { data: [], error: null };
  const data = (boards as Array<{ id: number; name: string; created_at: string }>).map((b) => ({
    id: String(b.id),
    name: b.name,
    workspace_id: workspaceId,
    created_at: b.created_at,
    cardid: String(b.id),
  }));
  return { data, error: null };
}

/** Get boards accessible to a user in a workspace. If a board has no board_members, all workspace members see it. If it has board_members, only those users see it. */
export async function getBoardsAccessibleToUser(
  workspaceId: string,
  userId: string
): Promise<{ data: Board[] | null; error: Error | null }> {
  const { data: allBoards, error: boardsErr } = await getBoardsByWorkspace(workspaceId);
  if (boardsErr || !allBoards?.length) return { data: allBoards ?? [], error: boardsErr };
  const supabase = createClient();
  const boardIds = allBoards.map((b) => String(b.id));
  const { data: bmRows } = await supabase
    .from("board_members")
    .select("board_id, user_id")
    .in("board_id", boardIds);
  const boardsWithRestrictions = new Set<string>();
  const userBoards = new Set<string>();
  (bmRows ?? []).forEach((r: { board_id: string; user_id: string }) => {
    const bid = String(r.board_id);
    boardsWithRestrictions.add(bid);
    if (r.user_id === userId) userBoards.add(bid);
  });
  const accessible = allBoards.filter((b) => {
    const bid = String(b.id);
    return !boardsWithRestrictions.has(bid) || userBoards.has(bid);
  });
  return { data: accessible, error: null };
}

/** Get board members with full_name. */
export async function getBoardMembers(boardId: string): Promise<{
  data: BoardMember[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("board_members")
    .select("id, board_id, user_id, role, created_at")
    .eq("board_id", String(boardId))
    .order("created_at", { ascending: true });
  if (error) return { data: null, error };
  if (!rows?.length) return { data: [], error: null };
  const userIds = [...new Set((rows as { user_id: string }[]).map((r) => r.user_id))];
  const { data: users } = await supabase.from("users").select("auth_id, full_name, app_role").in("auth_id", userIds);
  const byAuthId = new Map(
    (users ?? []).map((u: { auth_id: string; full_name: string | null; app_role: string | null }) => [
      u.auth_id,
      { full_name: u.full_name, app_role: u.app_role },
    ])
  );
  const data = (rows as BoardMember[]).map((r) => {
    const u = byAuthId.get(r.user_id);
    return { ...r, full_name: u?.full_name ?? null, app_role: u?.app_role ?? null };
  });
  return { data, error: null };
}

/** Add a user to a board. Only admin can add. */
export async function addBoardMember(
  boardId: string,
  userId: string,
  requesterAuthId: string,
  role = "member"
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can manage board access.") };
  }
  const { error } = await supabase.from("board_members").insert({
    board_id: String(boardId),
    user_id: userId,
    role: role.trim() || "member",
    created_at: new Date().toISOString(),
  });
  return { error };
}

/** Remove a user from a board. Only admin can remove. Admin cannot remove themselves. */
export async function removeBoardMember(
  boardId: string,
  userId: string,
  requesterAuthId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can manage board access.") };
  }
  const { data: userRow } = await supabase.from("users").select("app_role").eq("auth_id", userId).single();
  const role = ((userRow as { app_role?: string } | null)?.app_role ?? "").toLowerCase().trim();
  if (role === "admin" || role === "superadmin") {
    return { error: new Error("Admins and the superadmin cannot be removed from board access.") };
  }
  const { error } = await supabase
    .from("board_members")
    .delete()
    .eq("board_id", String(boardId))
    .eq("user_id", userId);
  return { error };
}

/** Create a board in a workspace (boards.workspaceid = workspaceId). No cardslist rows until the user adds a card or list. */
export async function createBoard(
  workspaceId: string,
  name: string,
  creatorUserId?: string
): Promise<{ data: Board | null; error: Error | null }> {
  const supabase = createClient();
  const wsId = String(workspaceId);
  const { data: boardRow, error: boardError } = await supabase
    .from("boards")
    .insert({
      name: name.trim(),
      created_at: new Date().toISOString(),
      workspaceid: wsId,
    })
    .select("id, name, created_at")
    .single();
  if (boardError || !boardRow) return { data: null, error: boardError ?? new Error("Failed to create board") };
  const boardIdNum = boardRow?.id as number;
  const boardId = String(boardIdNum);
  const { data: adminRows } = await supabase.from("users").select("auth_id").in("app_role", ["admin", "superadmin"]);
  const adminAuthIds = new Set((adminRows ?? []).map((r: { auth_id: string }) => r.auth_id));
  const toAdd = new Set<string>(adminAuthIds);
  if (creatorUserId) toAdd.add(creatorUserId);
  for (const uid of toAdd) {
    await supabase.from("board_members").insert({
      board_id: boardId,
      user_id: uid,
      role: adminAuthIds.has(uid) ? "admin" : "member",
      created_at: new Date().toISOString(),
    });
  }
  return {
    data: { id: boardId, name: (boardRow?.name as string) ?? name.trim(), workspace_id: wsId, created_at: (boardRow?.created_at as string) ?? new Date().toISOString(), cardid: boardId },
    error: null,
  };
}

/** Delete a board and its cardslist (by boardid), list order, items, comments, and activities. Only admin can delete. */
export async function deleteBoard(boardId: string, requesterAuthId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can delete boards.") };
  }
  const bid = String(boardId);

  const itemIds = new Set<number>();
  const { data: colRows } = await supabase.from("cardslist").select("id").eq("boardid", bid);
  const columnIds = (colRows ?? []).map((r: { id: number }) => r.id);
  if (columnIds.length > 0) {
    const { data: itemRows } = await supabase.from("itemslist").select("id").in("cardid", columnIds);
    (itemRows ?? []).forEach((r: { id: number }) => itemIds.add(r.id));
  }

  await supabase.from("board_list_order").delete().eq("boardname", bid);

  const { error: cardsDelErr } = await supabase.from("cardslist").delete().eq("boardid", bid);
  if (cardsDelErr) return { error: cardsDelErr };

  for (const itemId of itemIds) {
    await supabase.from("item_comments").delete().eq("item_id", itemId);
    await supabase.from("item_activities").delete().eq("item_id", itemId);
    await supabase.from("itemslist").delete().eq("id", itemId);
  }

  await supabase.from("board_members").delete().eq("board_id", bid);
  const { error } = await supabase.from("boards").delete().eq("id", bid);
  return { error };
}

export type AppUser = {
  id: number;
  auth_id: string;
  full_name: string | null;
  email: string | null;
  app_role: string | null;
  profile_image: string | null;
  user_bg_image: string | null;
  created_at: string;
};

/** Get all users. Only admin can call. */
export async function getAllUsers(requesterAuthId: string): Promise<{
  data: AppUser[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { data: null, error: new Error("Only the admin can manage users.") };
  }
  const { data, error } = await supabase
    .from("users")
    .select("id, auth_id, full_name, email, app_role, profile_image, user_bg_image, created_at")
    .order("created_at", { ascending: false });
  if (error) return { data: null, error };
  return { data: (data ?? []) as AppUser[], error: null };
}

/** Update a user's full_name, email, app_role, or profile_image. Admin can update users (not other admins' roles); superadmin can change anyone. Only one superadmin; transferring it demotes the current superadmin to admin. */
export async function updateUser(
  authId: string,
  updates: { full_name?: string; email?: string; app_role?: string; profile_image?: string; user_bg_image?: string },
  requesterAuthId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const [callerRow, targetRow] = await Promise.all([
    supabase.from("users").select("app_role").eq("auth_id", requesterAuthId).single(),
    supabase.from("users").select("app_role").eq("auth_id", authId).single(),
  ]);
  const callerRole = ((callerRow.data as { app_role?: string } | null)?.app_role ?? "").toLowerCase().trim();
  const targetRole = ((targetRow.data as { app_role?: string } | null)?.app_role ?? "").toLowerCase().trim();
  const isSelf = authId === requesterAuthId;
  const callerIsAdmin = callerRole === "admin" || callerRole === "superadmin";
  const callerIsSuperAdmin = callerRole === "superadmin";

  if (!callerIsAdmin && !isSelf) {
    return { error: new Error("You can only update your own profile.") };
  }

  const payload: Record<string, unknown> = {};
  if (updates.full_name !== undefined) payload.full_name = updates.full_name.trim();
  if (updates.email !== undefined) payload.email = updates.email.trim();
  if (updates.profile_image !== undefined) payload.profile_image = updates.profile_image;
  if (updates.user_bg_image !== undefined) payload.user_bg_image = updates.user_bg_image;

  // Role change rules
  if (updates.app_role !== undefined) {
    const newRole = updates.app_role.trim().toLowerCase();
    if (callerIsAdmin && !callerIsSuperAdmin) {
      // Caller is admin (not superadmin): cannot change role of admin or superadmin
      if (targetRole === "admin" || targetRole === "superadmin") {
        return { error: new Error("Admins cannot change the role of other admins or the superadmin.") };
      }
      if (newRole !== "user" && newRole !== "admin") {
        return { error: new Error("Only the superadmin can assign the superadmin role.") };
      }
      payload.app_role = newRole;
    } else if (callerIsSuperAdmin) {
      if (newRole === "superadmin" && authId !== requesterAuthId) {
        // Transfer superadmin: demote all superadmins to admin, then set target to superadmin
        const { error: demoteErr } = await supabase
          .from("users")
          .update({ app_role: "admin" })
          .eq("app_role", "superadmin");
        if (demoteErr) return { error: demoteErr };
        const { error: promoteErr } = await supabase
          .from("users")
          .update({ app_role: "superadmin", ...payload })
          .eq("auth_id", authId);
        if (promoteErr) return { error: promoteErr };
        return { error: null };
      }
      payload.app_role = newRole;
    }
  }

  if (Object.keys(payload).length === 0) return { error: null };
  const { error } = await supabase.from("users").update(payload).eq("auth_id", authId);
  if (error) return { error };

  // Sync auth.users raw_user_meta_data when updating own profile so session.user.user_metadata stays in sync
  if (isSelf) {
    const authData: Record<string, string> = {};
    if (updates.full_name !== undefined) authData.full_name = updates.full_name.trim();
    if (updates.profile_image !== undefined) authData.avatar_url = updates.profile_image;
    if (Object.keys(authData).length > 0) {
      const { error: authErr } = await supabase.auth.updateUser({ data: authData });
      if (authErr) return { error: authErr };
      clearSessionCache();
    }
  }

  return { error: null };
}

/** Get a single user by auth_id. Users can fetch their own; admin can fetch any. */
export async function getUserByAuthId(
  authId: string,
  requesterAuthId: string
): Promise<{ data: AppUser | null; error: Error | null }> {
  const supabase = createClient();
  const admin = await isAdmin(supabase, requesterAuthId);
  const isSelf = authId === requesterAuthId;
  if (!admin && !isSelf) {
    return { data: null, error: new Error("You can only view your own profile.") };
  }
  const { data, error } = await supabase
    .from("users")
    .select("id, auth_id, full_name, email, app_role, profile_image, user_bg_image, created_at")
    .eq("auth_id", authId)
    .single();
  if (error) return { data: null, error };
  return { data: data as AppUser, error: null };
}
