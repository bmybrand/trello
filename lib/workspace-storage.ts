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

/** Create a workspace and add the creator as a member. */
export async function createWorkspace(
  name: string,
  creatorUserId: string
): Promise<{ data: Workspace | null; error: Error | null }> {
  const supabase = createClient();
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

/** Delete a workspace and all related data (boards, members, board cards, list order, cards, items, comments, activities). */
export async function deleteWorkspace(workspaceId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { data: boards } = await getBoardsByWorkspace(workspaceId);
  const boardIds = (boards ?? []).map((b) => String(b.id));

  // Collect all card ids on these boards before deleting
  const cardIds = new Set<number>();
  for (const bid of boardIds) {
    const { data: rows } = await supabase.from("boardcards").select("cardid").eq("boardname", bid);
    (rows ?? []).forEach((r: { cardid: number }) => cardIds.add(r.cardid));
  }

  // Delete board placements, list order, and empty column rows in cardslist
  for (const bid of boardIds) {
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

/** Add a user to a workspace. userId = auth_id (uuid) from auth.users. */
export async function addWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
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

/** Get boards in a workspace. */
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

/** Create a board in a workspace. */
export async function createBoard(
  workspaceId: string,
  name: string
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
  return {
    // Preserve the exact types Supabase returns so workspace_id
    // stays consistent with getBoardsByWorkspace.
    data: (created ?? null) as unknown as Board | null,
    error: null,
  };
}

/** Delete a board and all its boardcards, list order, cards, items, comments, and activities. */
export async function deleteBoard(boardId: string): Promise<{ error: Error | null }> {
  const supabase = createClient();
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

  // 2. Delete board–card links and list order
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
