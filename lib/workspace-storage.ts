import { createClient } from "./supabase";

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

/** Get workspaces the user is a member of. */
export async function getWorkspacesForUser(userId: string): Promise<{
  data: Workspace[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: memberships, error: membersError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);
  if (membersError) return { data: null, error: membersError };
  const workspaceIds = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
  if (workspaceIds.length === 0) return { data: [], error: null };
  const { data: workspaces, error } = await supabase
    .from("workspace")
    .select("id, name, created_at, boardid")
    .in("id", workspaceIds)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error };
  const list = (workspaces ?? []).map((w: { id: string; name: string; created_at: string; boardid?: string | null }) => ({
    id: String(w.id),
    name: w.name,
    created_at: w.created_at,
    boardid: w.boardid != null ? String(w.boardid) : null,
  }));
  return { data: list, error: null };
}

/** Get a single workspace by id. */
export async function getWorkspace(workspaceId: string): Promise<{
  data: Workspace | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("workspace")
    .select("id, name, created_at, boardid")
    .eq("id", workspaceId)
    .single();
  if (error) return { data: null, error };
  const w = data as { id: string; name: string; created_at: string; boardid?: string | null };
  return { data: { id: String(w.id), name: w.name, created_at: w.created_at, boardid: w.boardid != null ? String(w.boardid) : null }, error: null };
}

/** Create a workspace and add the creator as a member. Creates one board for the workspace and links workspace.boardid = board.id. Only users with app_role 'admin' can create. */
export async function createWorkspace(
  name: string,
  creatorUserId: string
): Promise<{ data: Workspace | null; error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, creatorUserId))) {
    return { data: null, error: new Error("Only the admin can create workspaces.") };
  }
  // Create board first (cardid = board id, used as theme id in cardslist)
  const { data: boardRow, error: boardError } = await supabase
    .from("boards")
    .insert({
      name: name.trim(),
      created_at: new Date().toISOString(),
    })
    .select("id, name, created_at")
    .single();
  if (boardError) return { data: null, error: boardError };
  const boardIdNum = boardRow?.id as number;
  const boardId = String(boardIdNum);
  // One cardslist row so cardthemid exists for FK; then set board.cardid = board.id
  await supabase.from("cardslist").insert({
    cardthemid: boardIdNum,
    cardname: "To Do",
    position: 0,
  });
  await supabase.from("boards").update({ cardid: boardIdNum }).eq("id", boardIdNum);
  // Create workspace linked to this board
  const { data: created, error: workspaceError } = await supabase
    .from("workspace")
    .insert({
      name: name.trim(),
      created_at: new Date().toISOString(),
      boardid: boardId,
    })
    .select("id, name, created_at, boardid")
    .single();
  if (workspaceError) {
    await supabase.from("cardslist").delete().eq("cardthemid", boardIdNum);
    await supabase.from("boards").delete().eq("id", boardIdNum);
    return { data: null, error: workspaceError };
  }
  const id = String(created?.id ?? "");
  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: id,
    user_id: creatorUserId,
    created_at: new Date().toISOString(),
  });
  if (memberError) {
    await supabase.from("workspace").delete().eq("id", id);
    await supabase.from("cardslist").delete().eq("cardthemid", boardIdNum);
    await supabase.from("boards").delete().eq("id", boardIdNum);
    return { data: null, error: memberError };
  }
  const { data: adminRows } = await supabase.from("users").select("auth_id").in("app_role", ["admin", "superadmin"]);
  const adminAuthIds = new Set((adminRows ?? []).map((r: { auth_id: string }) => r.auth_id));
  const toAdd = new Set<string>(adminAuthIds);
  toAdd.add(creatorUserId);
  for (const uid of toAdd) {
    await supabase.from("board_members").insert({
      board_id: boardId,
      user_id: uid,
      role: adminAuthIds.has(uid) ? "admin" : "member",
      created_at: new Date().toISOString(),
    });
  }
  return {
    data: { id, name: (created?.name as string) ?? name.trim(), created_at: (created?.created_at as string) ?? new Date().toISOString(), boardid: boardId },
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

/** Delete a workspace and its single board (workspace.boardid), cardslist by cardthemid, list order, items, comments, activities. Only admin can delete. */
export async function deleteWorkspace(workspaceId: string, requesterAuthId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can delete workspaces.") };
  }
  const { data: ws } = await supabase.from("workspace").select("boardid").eq("id", workspaceId).single();
  const boardId = ws?.boardid != null ? String(ws.boardid) : null;
  if (!boardId) {
    await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId);
    const { error } = await supabase.from("workspace").delete().eq("id", workspaceId);
    return { error };
  }

  const { data: boardRow } = await supabase.from("boards").select("cardid").eq("id", boardId).single();
  const cardthemid = boardRow?.cardid != null ? Number(boardRow.cardid) : null;

  if (cardthemid != null) {
    const { data: clRows } = await supabase.from("cardslist").select("id, carditemid").eq("cardthemid", cardthemid);
    const itemIds = new Set<number>();
    (clRows ?? []).forEach((r: { carditemid: number | null }) => {
      if (r.carditemid != null) itemIds.add(r.carditemid);
    });
    await supabase.from("board_list_order").delete().eq("boardname", boardId);
    await supabase.from("cardslist").delete().eq("cardthemid", cardthemid);
    for (const itemId of itemIds) {
      const { data: otherCards } = await supabase.from("cardslist").select("id").eq("carditemid", itemId).limit(1);
      if (!otherCards?.length) {
        await supabase.from("item_comments").delete().eq("item_id", itemId);
        await supabase.from("item_activities").delete().eq("item_id", itemId);
        await supabase.from("itemslist").delete().eq("id", itemId);
      }
    }
  }

  await supabase.from("board_members").delete().eq("board_id", boardId);
  await supabase.from("boards").delete().eq("id", boardId);
  await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId);
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
    .maybeSingle();
  if (error) return false;
  return !!data;
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

/** Get workspace members with full_name. */
export async function getWorkspaceMembers(workspaceId: string): Promise<{
  data: WorkspaceMember[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, user_id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return { data: null, error };
  if (!rows?.length) return { data: [], error: null };
  const userIds = [...new Set((rows as { user_id: string }[]).map((r) => r.user_id))];
  const { data: users } = await supabase
    .from("users")
    .select("auth_id, full_name, app_role")
    .in("auth_id", userIds);
  const byAuthId = new Map(
    (users ?? []).map((u: { auth_id: string; full_name: string | null; app_role: string | null }) => [
      u.auth_id,
      { full_name: u.full_name, app_role: u.app_role },
    ])
  );
  const data = (rows as WorkspaceMember[]).map((r) => {
    const u = byAuthId.get(r.user_id);
    return { ...r, full_name: u?.full_name ?? null, app_role: u?.app_role ?? null };
  });
  return { data, error: null };
}

/** Add a user to a workspace. userId = auth_id (uuid) from auth.users. Only admin can add members. */
export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  requesterAuthId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can add members.") };
  }
  const { error } = await supabase.from("workspace_members").insert({
    workspace_id: workspaceId,
    user_id: userId,
    created_at: new Date().toISOString(),
  });
  return { error };
}

/** Remove a user from a workspace. */
export async function removeWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  return { error };
}

/** Get boards in a workspace (one board per workspace via workspace.boardid). */
export async function getBoardsByWorkspace(workspaceId: string): Promise<{
  data: Board[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: ws, error: wsErr } = await supabase
    .from("workspace")
    .select("id, boardid")
    .eq("id", workspaceId)
    .single();
  if (wsErr || !ws?.boardid) return { data: [], error: wsErr };
  const boardId = String(ws.boardid);
  const { data: board, error } = await supabase
    .from("boards")
    .select("id, name, created_at, cardid")
    .eq("id", boardId)
    .single();
  if (error) return { data: null, error };
  if (!board) return { data: [], error: null };
  const b = board as { id: number; name: string; created_at: string; cardid?: number | null };
  return {
    data: [{
      id: String(b.id),
      name: b.name,
      workspace_id: workspaceId,
      created_at: b.created_at,
      cardid: b.cardid != null ? String(b.cardid) : null,
    }],
    error: null,
  };
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

/** Create a board (and optionally link to a new workspace). In the current schema one workspace has one board; use createWorkspace to create workspace+board. This is for backwards compatibility or direct board creation. */
export async function createBoard(
  workspaceId: string,
  name: string,
  creatorUserId?: string
): Promise<{ data: Board | null; error: Error | null }> {
  const supabase = createClient();
  const { data: boardRow, error: boardError } = await supabase
    .from("boards")
    .insert({
      name: name.trim(),
      created_at: new Date().toISOString(),
    })
    .select("id, name, created_at")
    .single();
  if (boardError) return { data: null, error: boardError };
  const boardIdNum = boardRow?.id as number;
  const boardId = String(boardIdNum);
  await supabase.from("cardslist").insert({
    cardthemid: boardIdNum,
    cardname: "To Do",
    position: 0,
  });
  await supabase.from("boards").update({ cardid: boardIdNum }).eq("id", boardIdNum);
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
    data: { id: boardId, name: (boardRow?.name as string) ?? name.trim(), workspace_id: workspaceId, created_at: (boardRow?.created_at as string) ?? new Date().toISOString(), cardid: boardId },
    error: null,
  };
}

/** Delete a board and its cardslist (by cardthemid), list order, items, comments, and activities. Only admin can delete. */
export async function deleteBoard(boardId: string, requesterAuthId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can delete boards.") };
  }
  const bid = String(boardId);
  const { data: boardRow } = await supabase.from("boards").select("cardid").eq("id", bid).single();
  const cardthemid = boardRow?.cardid != null ? Number(boardRow.cardid) : null;

  if (cardthemid != null) {
    const { data: clRows } = await supabase.from("cardslist").select("id, carditemid").eq("cardthemid", cardthemid);
    const itemIds = new Set<number>();
    (clRows ?? []).forEach((r: { carditemid: number | null }) => {
      if (r.carditemid != null) itemIds.add(r.carditemid);
    });
    await supabase.from("board_list_order").delete().eq("boardname", bid);
    await supabase.from("cardslist").delete().eq("cardthemid", cardthemid);
    for (const itemId of itemIds) {
      const { data: otherCards } = await supabase.from("cardslist").select("id").eq("carditemid", itemId).limit(1);
      if (!otherCards?.length) {
        await supabase.from("item_comments").delete().eq("item_id", itemId);
        await supabase.from("item_activities").delete().eq("item_id", itemId);
        await supabase.from("itemslist").delete().eq("id", itemId);
      }
    }
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
  return { error };
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
