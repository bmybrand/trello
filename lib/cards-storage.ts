import { createClient } from "./supabase";

// Types matching the database schema
export type Item = {
  id: number;
  name: string;
  comment: string;
  description?: string | null;
  createddate: string;
  status?: boolean;
  cover_path?: string | null;
};

export type Card = {
  id: number;
  carditemid: number;
  cardname: string;
};

export type BoardCard = {
  id: number;
  cardid: number;
  boardname: string;
};

// --- Items (itemslist) ---

/** Create a new item and return its id */
export async function createItem(
  name: string,
  comment: string = ""
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("itemslist")
    .insert({
      name: name.trim(),
      comment: comment.trim(),
      createddate: new Date().toISOString(),
      status: false,
    })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: data?.id ?? null, error: null };
}

/** Update an existing item */
export async function updateItem(
  id: number,
  updates: { name?: string; comment?: string; description?: string | null; status?: boolean; cover_path?: string | null }
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("itemslist")
    .update({
      ...(updates.name !== undefined && { name: updates.name.trim() }),
      ...(updates.comment !== undefined && { comment: updates.comment.trim() }),
      ...(updates.description !== undefined && { description: updates.description?.trim() || null }),
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.cover_path !== undefined && { cover_path: updates.cover_path?.trim() || null }),
    })
    .eq("id", id);

  return { error };
}

/** Get an item by id */
export async function getItem(
  id: number
): Promise<{ data: Item | null; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("itemslist")
    .select("*")
    .eq("id", id)
    .single();

  return { data, error };
}

// --- Cards (cardslist) ---

/** Create a new card linked to an item. cardname = list/column name ("To Do", "In Review", etc.). */
export async function createCard(
  itemId: number,
  cardname: string
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cardslist")
    .insert({ carditemid: itemId, cardname: cardname.trim() })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: data?.id ?? null, error: null };
}

/** Update a card's list (cardname = list/column name). */
export async function updateCardList(
  cardId: number,
  listName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cardslist")
    .update({ cardname: listName.trim() })
    .eq("id", cardId);

  return { error };
}

/** Create an item and a card in one go. Returns { itemId, cardId }.
 * - name: card title (stored in itemslist)
 * - listName: list/column name like "To Do", "In Review", "Done" (stored in cardslist.cardname)
 */
export async function createCardWithItem(
  name: string,
  listName: string,
  comment: string = ""
): Promise<{
  data: { itemId: number; cardId: number } | null;
  error: Error | null;
}> {
  const { data: itemId, error: itemError } = await createItem(name, comment);
  if (itemError || itemId === null) {
    return { data: null, error: itemError ?? new Error("Failed to create item") };
  }

  const { data: cardId, error: cardError } = await createCard(itemId, listName);
  if (cardError || cardId === null) {
    return { data: null, error: cardError ?? new Error("Failed to create card") };
  }

  return { data: { itemId, cardId }, error: null };
}

// --- Board cards (boardcards) ---

/** Add a card to a board with position */
export async function addCardToBoard(
  cardId: number,
  boardName: string,
  _listName?: string,
  position?: number
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  let pos = position ?? 0;
  if (position === undefined) {
    const { data: maxRow } = await supabase
      .from("boardcards")
      .select("position")
      .eq("boardname", String(boardName ?? "").trim())
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    pos = maxRow?.position != null ? (maxRow.position as number) + 1 : 0;
  }
  const { data, error } = await supabase
    .from("boardcards")
    .insert({
      cardid: cardId,
      boardname: String(boardName ?? "").trim(),
      position: pos,
    })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: data?.id ?? null, error: null };
}

/** Update board card position (for reordering) */
export async function updateBoardCardPosition(
  boardCardId: number,
  position: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("boardcards")
    .update({ position })
    .eq("id", boardCardId);
  return { error };
}

/** Update cardslist position (for reordering within list) */
export async function updateCardPosition(
  cardId: number,
  position: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cardslist")
    .update({ position })
    .eq("id", cardId);
  return { error };
}

/** Get list/column order for a board from board_list_order */
export async function getBoardListOrder(boardName: string): Promise<{
  data: Array<{ listname: string; position: number }> | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("board_list_order")
    .select("listname, position")
    .eq("boardname", String(boardName ?? "").trim())
    .order("position", { ascending: true });
  return { data: data ?? [], error };
}

/** Save list/column order for a board to board_list_order */
export async function updateBoardListOrder(
  boardName: string,
  listOrder: Array<{ listname: string; position: number }>
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const name = String(boardName ?? "").trim();
  const { error: deleteError } = await supabase
    .from("board_list_order")
    .delete()
    .eq("boardname", name);
  if (deleteError) return { error: deleteError };
  if (listOrder.length === 0) return { error: null };
  const rows = listOrder.map((l, i) => ({
    boardname: name,
    listname: l.listname,
    position: i,
  }));
  const { error } = await supabase.from("board_list_order").insert(rows);
  return { error };
}

/** Remove a card from a board */
export async function removeCardFromBoard(
  cardId: number,
  boardName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("boardcards")
    .delete()
    .eq("cardid", cardId)
    .eq("boardname", String(boardName ?? "").trim());

  return { error };
}

/** Get all cards for a board with position. Ordered by list then position. */
export async function getBoardCards(boardName: string): Promise<{
  data: Array<{ boardCardId: number; cardId: number; listName: string; title: string; position: number; item?: Item }> | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("boardcards")
    .select(
      `
      id,
      cardid,
      position,
      cardslist (
        id,
        carditemid,
        cardname,
        position,
        itemslist (
          id,
          name,
          comment,
          createddate,
          status,
          cover_path
        )
      )
    `
    )
    .eq("boardname", String(boardName ?? "").trim());

  if (error) return { data: null, error };
  if (!rows?.length) return { data: [], error: null };

  const result = rows
    .map((row: Record<string, unknown>) => {
      const card = Array.isArray(row.cardslist) ? row.cardslist[0] : row.cardslist as { cardname?: string; position?: number; itemslist?: Item | Item[] } | null;
      if (!card) return null;
      const rawItem = Array.isArray(card.itemslist) ? card.itemslist[0] : card.itemslist;
      const item = rawItem as Item | undefined;
      return {
        boardCardId: row.id as number,
        cardId: row.cardid as number,
        listName: (card.cardname as string) ?? "",
        title: item?.name ?? "",
        position: (typeof card.position === "number" ? card.position : (row.position as number)) ?? 0,
        item: item ? { ...item, status: item.status ?? false, cover_path: item.cover_path ?? null } : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => {
      if (a.listName !== b.listName) return a.listName.localeCompare(b.listName);
      return a.position - b.position;
    });

  return { data: result, error: null };
}

// --- Item comments (item_comments) ---

export type ItemComment = {
  id: number;
  item_id: number;
  user_id: string;
  comment: string;
  created_at: string;
  full_name?: string | null;
};

/** Get comments for an item, with author full_name. Ordered by created_at ascending. */
export async function getItemComments(itemId: number): Promise<{
  data: ItemComment[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("item_comments")
    .select("id, item_id, user_id, comment, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });
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
  const data = (rows as { id: number; item_id: number; user_id: string; comment: string; created_at: string }[]).map(
    (r) => ({
      ...r,
      full_name: nameByAuthId.get(r.user_id) ?? null,
    })
  );
  return { data, error: null };
}

/** Add a comment to an item. */
export async function createItemComment(
  itemId: number,
  userId: string,
  comment: string
): Promise<{ data: ItemComment | null; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("item_comments")
    .insert({
      item_id: itemId,
      user_id: userId,
      comment: comment.trim(),
      created_at: new Date().toISOString(),
    })
    .select("id, item_id, user_id, comment, created_at")
    .single();
  if (error) return { data: null, error };
  return { data: data as ItemComment, error: null };
}

/** Update a comment. */
export async function updateItemComment(
  commentId: number,
  comment: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("item_comments")
    .update({ comment: comment.trim() })
    .eq("id", commentId);
  return { error };
}

/** Delete a comment. */
export async function deleteItemComment(commentId: number): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("item_comments").delete().eq("id", commentId);
  return { error };
}

// --- Item activities (item_activities) ---

export type ItemActivity = {
  id: number;
  item_id: number;
  user_id: string;
  action_type: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  full_name?: string | null;
};

/** Get activities for an item, with author full_name. Ordered by created_at descending. */
export async function getItemActivities(itemId: number): Promise<{
  data: ItemActivity[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("item_activities")
    .select("id, item_id, user_id, action_type, created_at, metadata")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });
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
  const data = (rows as { id: number; item_id: number; user_id: string; action_type: string; created_at: string; metadata?: Record<string, unknown> }[]).map(
    (r) => ({
      ...r,
      full_name: nameByAuthId.get(r.user_id) ?? null,
    })
  );
  return { data, error: null };
}

/** Create an activity for an item. */
export async function createItemActivity(
  itemId: number,
  userId: string,
  actionType: string,
  metadata?: Record<string, unknown>
): Promise<{ data: ItemActivity | null; error: Error | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("item_activities")
    .insert({
      item_id: itemId,
      user_id: userId,
      action_type: actionType.trim(),
      metadata: metadata ?? null,
      created_at: new Date().toISOString(),
    })
    .select("id, item_id, user_id, action_type, created_at, metadata")
    .single();
  if (error) return { data: null, error };
  return { data: data as ItemActivity, error: null };
}
