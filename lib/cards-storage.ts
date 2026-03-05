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
  cardthemid?: number;
  position?: number;
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

async function getBoardCardid(supabase: ReturnType<typeof createClient>, boardId: string): Promise<number | null> {
  const { data } = await supabase.from("boards").select("cardid").eq("id", String(boardId).trim()).single();
  return data?.cardid != null ? Number(data.cardid) : null;
}

/** Create a new card linked to an item and optional board theme (cardthemid). If cardthemid is provided, the card is on that board. */
export async function createCard(
  itemId: number,
  cardname: string,
  cardthemid?: number | null,
  position?: number
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { carditemid: itemId, cardname: cardname.trim() };
  if (cardthemid != null) payload.cardthemid = cardthemid;
  if (position != null) payload.position = position;
  const { data, error } = await supabase
    .from("cardslist")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: data?.id ?? null, error: null };
}

/** Create an empty column placeholder in cardslist (carditemid = null) for the board's theme. */
export async function createEmptyColumnInCardslist(
  boardId: string,
  listName: string,
  position: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const cardthemid = await getBoardCardid(supabase, boardId);
  if (cardthemid == null) return { error: new Error("Board or board theme not found") };
  const payload: Record<string, unknown> = { cardthemid, cardname: listName.trim(), position };
  const { error } = await supabase.from("cardslist").insert(payload);
  return { error: error as Error | null };
}

/** Update an empty column's name in cardslist (rows with carditemid = null). */
export async function updateEmptyColumnInCardslist(
  boardId: string,
  oldListName: string,
  newListName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const cardthemid = await getBoardCardid(supabase, boardId);
  if (cardthemid == null) return { error: new Error("Board or board theme not found") };
  const { error } = await supabase
    .from("cardslist")
    .update({ cardname: newListName.trim() })
    .eq("cardthemid", cardthemid)
    .eq("cardname", oldListName.trim())
    .is("carditemid", null);
  return { error: error as Error | null };
}

/** Delete empty column placeholder(s) from cardslist (rows with carditemid = null). */
export async function deleteEmptyColumnFromCardslist(
  boardId: string,
  listName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const cardthemid = await getBoardCardid(supabase, boardId);
  if (cardthemid == null) return { error: new Error("Board or board theme not found") };
  const { error } = await supabase
    .from("cardslist")
    .delete()
    .eq("cardthemid", cardthemid)
    .eq("cardname", listName.trim())
    .is("carditemid", null);
  return { error: error as Error | null };
}

/** Update empty column positions in cardslist. */
export async function updateEmptyColumnPositionsInCardslist(
  boardId: string,
  listOrder: Array<{ listname: string; position: number }>
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const cardthemid = await getBoardCardid(supabase, boardId);
  if (cardthemid == null) return { error: new Error("Board or board theme not found") };
  for (let i = 0; i < listOrder.length; i++) {
    const { error } = await supabase
      .from("cardslist")
      .update({ position: i })
      .eq("cardthemid", cardthemid)
      .eq("cardname", listOrder[i].listname.trim())
      .is("carditemid", null);
    if (error) return { error: error as Error };
  }
  return { error: null };
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

/** Create an item and a card on a board in one go. boardId is used to set cardthemid so the card appears on that board. Returns { itemId, cardId }. */
export async function createCardWithItem(
  name: string,
  listName: string,
  comment: string = "",
  boardId?: string | null
): Promise<{
  data: { itemId: number; cardId: number } | null;
  error: Error | null;
}> {
  const { data: itemId, error: itemError } = await createItem(name, comment);
  if (itemError || itemId === null) {
    return { data: null, error: itemError ?? new Error("Failed to create item") };
  }

  const supabase = createClient();
  let cardthemid: number | null = null;
  let position: number = 0;
  if (boardId) {
    cardthemid = await getBoardCardid(supabase, boardId);
    if (cardthemid != null) {
      const { data: maxRow } = await supabase
        .from("cardslist")
        .select("position")
        .eq("cardthemid", cardthemid)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = maxRow?.position != null ? (maxRow.position as number) + 1 : 0;
    }
  }

  const { data: cardId, error: cardError } = await createCard(itemId, listName, cardthemid, position);
  if (cardError || cardId === null) {
    return { data: null, error: cardError ?? new Error("Failed to create card") };
  }

  return { data: { itemId, cardId }, error: null };
}

// --- Board cards (no boardcards table; cards live in cardslist by cardthemid = board.cardid) ---

/** Add a card (by item) to a board: creates a new cardslist row with cardthemid = board.cardid. Use when copying an existing card onto a board. cardId = existing cardslist id (used to get carditemid). */
export async function addCardToBoard(
  cardId: number,
  boardName: string,
  listName?: string,
  position?: number
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  const cardthemid = await getBoardCardid(supabase, String(boardName ?? "").trim());
  if (cardthemid == null) return { data: null, error: new Error("Board or board theme not found") };
  const { data: cardRow } = await supabase.from("cardslist").select("carditemid").eq("id", cardId).single();
  const itemId = cardRow?.carditemid as number | undefined;
  if (itemId == null) return { data: null, error: new Error("Card has no linked item") };
  let pos = position ?? 0;
  if (position === undefined) {
    const { data: maxRow } = await supabase
      .from("cardslist")
      .select("position")
      .eq("cardthemid", cardthemid)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    pos = maxRow?.position != null ? (maxRow.position as number) + 1 : 0;
  }
  const payload: Record<string, unknown> = {
    cardthemid,
    carditemid: itemId,
    cardname: (listName ?? "").trim() || "To Do",
    position: pos,
  };
  const { data, error } = await supabase.from("cardslist").insert(payload).select("id").single();
  if (error) return { data: null, error };
  return { data: data?.id ?? null, error: null };
}

/** Update card position (cardslist.position) for reordering. */
export async function updateBoardCardPosition(
  boardCardId: number,
  position: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("cardslist").update({ position }).eq("id", boardCardId);
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

/** Remove a card from a board (delete the cardslist row for this board theme). */
export async function removeCardFromBoard(
  cardId: number,
  boardName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const cardthemid = await getBoardCardid(supabase, String(boardName ?? "").trim());
  if (cardthemid == null) return { error: new Error("Board or board theme not found") };
  const { error } = await supabase
    .from("cardslist")
    .delete()
    .eq("id", cardId)
    .eq("cardthemid", cardthemid);
  return { error };
}

/** Delete a card everywhere and remove its item/comments/activities if no other cards reference that item. */
export async function deleteCardAndItem(
  cardId: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();

  const { data: cardRow, error: cardErr } = await supabase
    .from("cardslist")
    .select("carditemid")
    .eq("id", cardId)
    .maybeSingle();
  if (cardErr) return { error: cardErr as unknown as Error };
  const itemId = (cardRow?.carditemid as number | null) ?? null;

  const { error: cErr } = await supabase.from("cardslist").delete().eq("id", cardId);
  if (cErr) return { error: cErr as unknown as Error };

  if (itemId != null) {
    const { data: otherCards, error: otherErr } = await supabase
      .from("cardslist")
      .select("id")
      .eq("carditemid", itemId)
      .limit(1);
    if (otherErr) return { error: otherErr as unknown as Error };
    if (!otherCards?.length) {
      await supabase.from("item_comments").delete().eq("item_id", itemId);
      await supabase.from("item_activities").delete().eq("item_id", itemId);
      const { error: itemErr } = await supabase.from("itemslist").delete().eq("id", itemId);
      if (itemErr) return { error: itemErr as unknown as Error };
    }
  }

  return { error: null };
}

/** Get all cards for a board (cardslist where cardthemid = board.cardid). Ordered by list name then position. */
export async function getBoardCards(boardName: string): Promise<{
  data: Array<{ boardCardId: number; cardId: number; listName: string; title: string; position: number; item?: Item }> | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const boardId = String(boardName ?? "").trim();
  const cardthemid = await getBoardCardid(supabase, boardId);
  if (cardthemid == null) return { data: [], error: null };

  const { data: rows, error } = await supabase
    .from("cardslist")
    .select(
      `
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
    `
    )
    .eq("cardthemid", cardthemid);

  if (error) return { data: null, error };
  if (!rows?.length) return { data: [], error: null };

  const result = (rows as Array<{
    id: number;
    carditemid: number | null;
    cardname: string;
    position?: number;
    itemslist?: Item | Item[] | null;
  }>)
    .map((row) => {
      const rawItem = Array.isArray(row.itemslist) ? row.itemslist[0] : row.itemslist;
      const item = rawItem as Item | undefined;
      return {
        boardCardId: row.id,
        cardId: row.id,
        listName: row.cardname ?? "",
        title: item?.name ?? "",
        position: typeof row.position === "number" ? row.position : 0,
        item: item ? { ...item, status: item.status ?? false, cover_path: item.cover_path ?? null } : undefined,
      };
    })
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
