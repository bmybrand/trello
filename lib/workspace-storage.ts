import { createClient } from "./supabase";

export type Workspace = {
  id: string;
  name: string;
  created_at: string;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  created_at: string;
  full_name?: string | null;
};

export type Board = {
  id: string;
  name: string;
  workspace_id: string;
  created_at: string;
};

export type BoardMember = {
  id: number;
  board_id: string;
  user_id: string;
  role: string | null;
  created_at: string;
  full_name?: string | null;
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
    .select("id, name, created_at")
    .in("id", workspaceIds)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error };
  return { data: (workspaces ?? []) as Workspace[], error: null };
}

/** Get a single workspace by id. */
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
  return { data: data as Workspace, error: null };
}

/** Only this user can create workspaces. Hardcoded admin. */
const ADMIN_CAN_CREATE_WORKSPACE = "mughis siddiqui";

/** Create a workspace and add the creator as a member. Only the admin (Mughis Siddiqui) can create. */
export async function createWorkspace(
  name: string,
  creatorUserId: string
): Promise<{ data: Workspace | null; error: Error | null }> {
  const supabase = createClient();
  const { data: userRow } = await supabase
    .from("users")
    .select("full_name")
    .eq("auth_id", creatorUserId)
    .single();
  const fullName = ((userRow as { full_name?: string } | null)?.full_name ?? "").toLowerCase().trim();
  if (fullName !== ADMIN_CAN_CREATE_WORKSPACE.toLowerCase()) {
    return { data: null, error: new Error("Only the admin can create workspaces.") };
  }
  const { data: created, error: workspaceError } = await supabase
    .from("workspace")
    .insert({
      name: name.trim(),
      created_at: new Date().toISOString(),
    })
    .select("id, name, created_at")
    .single();
  if (workspaceError) return { data: null, error: workspaceError };
  const id = String(created?.id ?? "");
  const { error: memberError } = await supabase.from("workspace_members").insert({
    workspace_id: id,
    user_id: creatorUserId,
    created_at: new Date().toISOString(),
  });
  if (memberError) {
    await supabase.from("workspace").delete().eq("id", id);
    return { data: null, error: memberError };
  }
  return {
    data: { id, name: (created?.name as string) ?? name.trim(), created_at: (created?.created_at as string) ?? new Date().toISOString() },
    error: null,
  };
}

/** Check if user (auth_id) is the admin. Only admin can delete workspaces/boards and add members. */
async function isAdmin(supabase: ReturnType<typeof createClient>, authId: string): Promise<boolean> {
  const { data } = await supabase.from("users").select("full_name").eq("auth_id", authId).single();
  const name = ((data as { full_name?: string } | null)?.full_name ?? "").toLowerCase().trim();
  return name === ADMIN_CAN_CREATE_WORKSPACE.toLowerCase();
}

/** Delete a workspace and all related data (boards, members, board cards, list order, cards, items, comments, activities). Only admin can delete. */
export async function deleteWorkspace(workspaceId: string, requesterAuthId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can delete workspaces.") };
  }
  const { data: boards } = await getBoardsByWorkspace(workspaceId);
  const boardIds = (boards ?? []).map((b) => String(b.id));

  // Collect all card ids on these boards before deleting
  const cardIds = new Set<number>();
  for (const bid of boardIds) {
    const { data: rows } = await supabase.from("boardcards").select("cardid").eq("boardname", bid);
    (rows ?? []).forEach((r: { cardid: number }) => cardIds.add(r.cardid));
  }

  // Delete board members, placements, list order, and empty column rows
  for (const bid of boardIds) {
    await supabase.from("board_members").delete().eq("board_id", bid);
    await supabase.from("boardcards").delete().eq("boardname", bid);
    await supabase.from("board_list_order").delete().eq("boardname", bid);
    await supabase.from("cardslist").delete().eq("board_id", bid).is("carditemid", null);
    await supabase.from("cardslist").update({ board_id: null }).eq("board_id", bid);
  }

  // Delete orphaned cards and their items (only if card no longer on any board)
  for (const cardId of cardIds) {
    const { data: remaining } = await supabase.from("boardcards").select("id").eq("cardid", cardId).limit(1);
    if (remaining?.length) continue;
    const { data: card } = await supabase.from("cardslist").select("carditemid").eq("id", cardId).maybeSingle();
    const itemId = card?.carditemid as number | undefined;
    await supabase.from("cardslist").delete().eq("id", cardId);
    if (itemId != null) {
      const { data: otherCards } = await supabase.from("cardslist").select("id").eq("carditemid", itemId).limit(1);
      if (!otherCards?.length) {
        await supabase.from("item_comments").delete().eq("item_id", itemId);
        await supabase.from("item_activities").delete().eq("item_id", itemId);
        await supabase.from("itemslist").delete().eq("id", itemId);
      }
    }
  }

  await supabase.from("boards").delete().eq("workspace_id", workspaceId);
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
    .select("auth_id, full_name")
    .in("auth_id", userIds);
  const nameByAuthId = new Map(
    (users ?? []).map((u: { auth_id: string; full_name: string | null }) => [u.auth_id, u.full_name])
  );
  const data = (rows as WorkspaceMember[]).map((r) => ({
    ...r,
    full_name: nameByAuthId.get(r.user_id) ?? null,
  }));
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

/** Get boards in a workspace (all boards, no access filter). */
export async function getBoardsByWorkspace(workspaceId: string): Promise<{
  data: Board[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("boards")
    .select("id, name, workspace_id, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return { data: null, error };
  return { data: (data ?? []) as Board[], error: null };
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
  const { data: users } = await supabase.from("users").select("auth_id, full_name").in("auth_id", userIds);
  const nameByAuthId = new Map(
    (users ?? []).map((u: { auth_id: string; full_name: string | null }) => [u.auth_id, u.full_name])
  );
  const data = (rows as BoardMember[]).map((r) => ({
    ...r,
    full_name: nameByAuthId.get(r.user_id) ?? null,
  }));
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
  const { data: userRow } = await supabase.from("users").select("full_name").eq("auth_id", userId).single();
  const fullName = ((userRow as { full_name?: string } | null)?.full_name ?? "").toLowerCase().trim();
  if (fullName === ADMIN_CAN_CREATE_WORKSPACE.toLowerCase()) {
    return { error: new Error("The admin cannot be removed from board access.") };
  }
  const { error } = await supabase
    .from("board_members")
    .delete()
    .eq("board_id", String(boardId))
    .eq("user_id", userId);
  return { error };
}

/** Create a board in a workspace. Admin is automatically added to board_members and cannot be removed. Creator is also added. */
export async function createBoard(
  workspaceId: string,
  name: string,
  creatorUserId?: string
): Promise<{ data: Board | null; error: Error | null }> {
  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("boards")
    .insert({
      name: name.trim(),
      workspace_id: workspaceId,
      created_at: new Date().toISOString(),
    })
    .select("id, name, workspace_id, created_at")
    .single();
  if (error) return { data: null, error };
  if (created?.id) {
    const bid = String(created.id);
    const toAdd = new Set<string>();
    if (creatorUserId) toAdd.add(creatorUserId);
    const { data: adminRow } = await supabase
      .from("users")
      .select("auth_id")
      .ilike("full_name", ADMIN_CAN_CREATE_WORKSPACE)
      .limit(1)
      .maybeSingle();
    const adminAuthId = (adminRow as { auth_id?: string } | null)?.auth_id;
    if (adminAuthId) toAdd.add(adminAuthId);
    for (const uid of toAdd) {
      await supabase.from("board_members").insert({
        board_id: bid,
        user_id: uid,
        role: uid === adminAuthId ? "admin" : "member",
        created_at: new Date().toISOString(),
      });
    }
  }
  return {
    data: (created ?? null) as unknown as Board | null,
    error: null,
  };
}

/** Delete a board and all its boardcards, list order, cards, items, comments, and activities. Only admin can delete. */
export async function deleteBoard(boardId: string, requesterAuthId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can delete boards.") };
  }
  const bid = String(boardId);

  // 1. Collect all card IDs and their item IDs BEFORE any deletes
  const { data: bcRows } = await supabase.from("boardcards").select("cardid").eq("boardname", bid);
  const { data: clRows } = await supabase.from("cardslist").select("id, carditemid").eq("board_id", bid);
  const cardIds = new Set<number>([
    ...(bcRows ?? []).map((r: { cardid: number }) => r.cardid),
    ...(clRows ?? []).map((r: { id: number }) => r.id),
  ]);
  const itemIdsOnBoard = new Set<number>();
  (clRows ?? []).forEach((r: { carditemid: number | null }) => {
    if (r.carditemid != null) itemIdsOnBoard.add(r.carditemid);
  });

  // 2. Delete board members, board–card links, and list order
  await supabase.from("board_members").delete().eq("board_id", bid);
  await supabase.from("boardcards").delete().eq("boardname", bid);
  await supabase.from("board_list_order").delete().eq("boardname", bid);

  // 3. Delete empty column rows and clear board_id on cards
  await supabase.from("cardslist").delete().eq("board_id", bid).is("carditemid", null);
  await supabase.from("cardslist").update({ board_id: null }).eq("board_id", bid);

  // 4. Delete each card on this board
  for (const cardId of cardIds) {
    const { data: remaining } = await supabase.from("boardcards").select("id").eq("cardid", cardId).limit(1);
    if (remaining?.length) continue;
    await supabase.from("cardslist").delete().eq("id", cardId);
  }

  // 5. For each item that was on this board, if no card references it anymore, delete comments, activities, and item
  for (const itemId of itemIdsOnBoard) {
    const { data: otherCards } = await supabase.from("cardslist").select("id").eq("carditemid", itemId).limit(1);
    if (otherCards?.length) continue;
    await supabase.from("item_comments").delete().eq("item_id", itemId);
    await supabase.from("item_activities").delete().eq("item_id", itemId);
    await supabase.from("itemslist").delete().eq("id", itemId);
  }

  const { error } = await supabase.from("boards").delete().eq("id", bid);
  return { error };
}

export type AppUser = {
  id: number;
  auth_id: string;
  full_name: string | null;
  email: string | null;
  app_role: string | null;
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
    .select("id, auth_id, full_name, email, app_role, created_at")
    .order("created_at", { ascending: false });
  if (error) return { data: null, error };
  return { data: (data ?? []) as AppUser[], error: null };
}

/** Update a user's full_name, email, or app_role. Only admin can call. */
export async function updateUser(
  authId: string,
  updates: { full_name?: string; email?: string; app_role?: string },
  requesterAuthId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!(await isAdmin(supabase, requesterAuthId))) {
    return { error: new Error("Only the admin can manage users.") };
  }
  const payload: Record<string, unknown> = {};
  if (updates.full_name !== undefined) payload.full_name = updates.full_name.trim();
  if (updates.email !== undefined) payload.email = updates.email.trim();
  if (updates.app_role !== undefined) payload.app_role = updates.app_role.trim();
  if (Object.keys(payload).length === 0) return { error: null };
  const { error } = await supabase.from("users").update(payload).eq("auth_id", authId);
  return { error };
}
