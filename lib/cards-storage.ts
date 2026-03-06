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
  cardname: string;
  boardid?: string;
  position?: number;
};

// --- Items (itemslist) ---

/** Create a new item and return its id. Optionally place it in a column (cardid = cardslist.id). */
export async function createItem(
  name: string,
  comment: string = "",
  cardid?: number | null
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {
    name: name.trim(),
    comment: comment.trim(),
    createddate: new Date().toISOString(),
    status: false,
  };
  if (cardid != null) payload.cardid = cardid;
  const { data, error } = await supabase
    .from("itemslist")
    .insert(payload)
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

// --- Cards (cardslist = columns; itemslist.cardid → cardslist.id) ---

/** Assign an existing item to a column (update itemslist.cardid). Resolves listName + boardId to column id. */
export async function createCard(
  itemId: number,
  cardname: string,
  boardId?: string | null,
  position?: number
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  const board = String(boardId ?? "").trim();
  if (!board) return { data: null, error: new Error("boardId required to assign item to a list") };
  const { data: col } = await supabase
    .from("cardslist")
    .select("id")
    .eq("boardid", board)
    .eq("cardname", cardname.trim())
    .limit(1)
    .maybeSingle();
  const columnId = (col as { id: number } | null)?.id;
  if (columnId == null) return { data: null, error: new Error("Column not found for list: " + cardname) };
  const { error } = await supabase.from("itemslist").update({ cardid: columnId }).eq("id", itemId);
  if (error) return { data: null, error };
  return { data: columnId, error: null };
}

/** Create an empty column in cardslist for the board. Rejects empty list names. */
export async function createEmptyColumnInCardslist(
  boardId: string,
  listName: string,
  position: number
): Promise<{ error: Error | null }> {
  const trimmed = listName.trim();
  if (!trimmed) return { error: new Error("List name cannot be empty") };
  const supabase = createClient();
  const payload: Record<string, unknown> = { boardid: boardId, cardname: trimmed, position };
  const { error } = await supabase.from("cardslist").insert(payload);
  return { error: error as Error | null };
}

/** Update an empty column's name in cardslist. */
export async function updateEmptyColumnInCardslist(
  boardId: string,
  oldListName: string,
  newListName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("cardslist")
    .update({ cardname: newListName.trim() })
    .eq("boardid", boardId)
    .eq("cardname", oldListName.trim());
  return { error: error as Error | null };
}

/** Delete empty column(s) from cardslist only if they have no items (no itemslist where cardid = column id). */
export async function deleteEmptyColumnFromCardslist(
  boardId: string,
  listName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const name = listName.trim();
  const { data: cols, error: fetchErr } = await supabase
    .from("cardslist")
    .select("id")
    .eq("boardid", boardId)
    .eq("cardname", name);
  if (fetchErr) return { error: fetchErr as Error };
  for (const col of cols ?? []) {
    const cid = (col as { id: number }).id;
    const { data: items } = await supabase.from("itemslist").select("id").eq("cardid", cid).limit(1);
    if (items?.length) continue; // has items, don't delete
    await supabase.from("cardslist").delete().eq("id", cid);
  }
  return { error: null };
}

/** Delete a column (list) and all items in it; removes itemslist rows and their comments/activities. */
export async function deleteColumnFromCardslist(
  boardId: string,
  listName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const name = listName.trim();
  const { data: cols, error: fetchErr } = await supabase
    .from("cardslist")
    .select("id")
    .eq("boardid", boardId)
    .eq("cardname", name);
  if (fetchErr) return { error: fetchErr as Error };
  const columnIds = (cols ?? []).map((c: { id: number }) => c.id);
  if (columnIds.length === 0) return { error: null };
  const { data: items } = await supabase.from("itemslist").select("id").in("cardid", columnIds);
  const itemIds = (items ?? []).map((i: { id: number }) => i.id);
  for (const itemId of itemIds) {
    await supabase.from("item_comments").delete().eq("item_id", itemId);
    await supabase.from("item_activities").delete().eq("item_id", itemId);
    await supabase.from("itemslist").delete().eq("id", itemId);
  }
  const { error: delErr } = await supabase
    .from("cardslist")
    .delete()
    .eq("boardid", boardId)
    .eq("cardname", name);
  return { error: delErr as Error | null };
}

/** Update empty column positions in cardslist. */
export async function updateEmptyColumnPositionsInCardslist(
  boardId: string,
  listOrder: Array<{ listname: string; position: number }>
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  for (let i = 0; i < listOrder.length; i++) {
    const { error } = await supabase
      .from("cardslist")
      .update({ position: i })
      .eq("boardid", boardId)
      .eq("cardname", listOrder[i].listname.trim());
    if (error) return { error: error as Error };
  }
  return { error: null };
}

/** Update a card's list: set item's column (itemslist.cardid) to the column for the given list name on the board. */
export async function updateCardList(
  itemId: number,
  boardId: string,
  listName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const bid = String(boardId ?? "").trim();
  const { data: col } = await supabase
    .from("cardslist")
    .select("id")
    .eq("boardid", bid)
    .eq("cardname", listName.trim())
    .limit(1)
    .maybeSingle();
  const columnId = (col as { id: number } | null)?.id;
  if (columnId == null) return { error: new Error("Column not found: " + listName) };
  const { error } = await supabase.from("itemslist").update({ cardid: columnId }).eq("id", itemId);
  return { error: error as Error | null };
}

/** Create an item and place it in a list on the board. Gets or creates the column (cardslist) for listName, then creates itemslist with cardid = column id. Returns { itemId, cardId } (cardId = itemId). */
export async function createCardWithItem(
  name: string,
  listName: string,
  comment: string = "",
  boardId?: string | null
): Promise<{
  data: { itemId: number; cardId: number } | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const trimmedList = listName.trim();
  const bid = boardId != null && boardId !== "" ? String(boardId).trim() : null;
  if (!bid) return { data: null, error: new Error("boardId required") };

  let columnId: number | null = null;
  const { data: existing } = await supabase
    .from("cardslist")
    .select("id")
    .eq("boardid", bid)
    .eq("cardname", trimmedList)
    .limit(1)
    .maybeSingle();
  if (existing != null) columnId = (existing as { id: number }).id;
  if (columnId == null) {
    const { data: maxRow } = await supabase
      .from("cardslist")
      .select("position")
      .eq("boardid", bid)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = maxRow?.position != null ? (maxRow.position as number) + 1 : 0;
    const { data: inserted, error: insErr } = await supabase
      .from("cardslist")
      .insert({ boardid: bid, cardname: trimmedList, position })
      .select("id")
      .single();
    if (insErr) return { data: null, error: insErr };
    columnId = (inserted as { id: number })?.id ?? null;
  }
  if (columnId == null) return { data: null, error: new Error("Failed to get or create column") };

  const { data: itemId, error: itemError } = await createItem(name, comment, columnId);
  if (itemError || itemId === null) {
    return { data: null, error: itemError ?? new Error("Failed to create item") };
  }
  return { data: { itemId, cardId: itemId }, error: null };
}

// --- Board cards (cards live in cardslist by boardid) ---

/** Add a card (copy item) to a board: create a new itemslist row with cardid = target column id, copying name/comment from source item. itemId = source itemslist id; listName = target list on the board. */
export async function addCardToBoard(
  itemId: number,
  boardName: string,
  listName?: string,
  position?: number
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = createClient();
  const boardId = String(boardName ?? "").trim();
  const { data: sourceItem } = await supabase.from("itemslist").select("name, comment, description, status, cover_path").eq("id", itemId).single();
  if (!sourceItem) return { data: null, error: new Error("Source item not found") };
  const { data: col } = await supabase
    .from("cardslist")
    .select("id")
    .eq("boardid", boardId)
    .eq("cardname", (listName ?? "").trim() || "To Do")
    .limit(1)
    .maybeSingle();
  const columnId = (col as { id: number } | null)?.id;
  if (columnId == null) return { data: null, error: new Error("Target column not found") };
  const { data: newRow, error } = await supabase
    .from("itemslist")
    .insert({
      name: (sourceItem as { name: string }).name,
      comment: (sourceItem as { comment?: string }).comment ?? "",
      createddate: new Date().toISOString(),
      status: (sourceItem as { status?: boolean }).status ?? false,
      cardid: columnId,
      ...((sourceItem as { description?: string | null }).description != null && { description: (sourceItem as { description?: string | null }).description }),
      ...((sourceItem as { cover_path?: string | null }).cover_path != null && { cover_path: (sourceItem as { cover_path?: string | null }).cover_path }),
    })
    .select("id")
    .single();
  if (error) return { data: null, error };
  return { data: (newRow as { id: number })?.id ?? null, error: null };
}

/** Update cardslist position for a column (reordering columns). */
export async function updateBoardCardPosition(
  boardCardId: number,
  position: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("cardslist").update({ position }).eq("id", boardCardId);
  return { error };
}

/** No-op: itemslist has no position column. Kept for API compatibility. */
export async function updateCardPosition(
  _cardId: number,
  _position: number
): Promise<{ error: Error | null }> {
  return { error: null };
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

/** Remove a card from a board: delete the itemslist row (and its comments/activities). cardId = itemslist.id. */
export async function removeCardFromBoard(
  cardId: number,
  _boardName: string
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  await supabase.from("item_comments").delete().eq("item_id", cardId);
  await supabase.from("item_activities").delete().eq("item_id", cardId);
  const { error } = await supabase.from("itemslist").delete().eq("id", cardId);
  return { error };
}

/** Delete a card (item) everywhere: delete the itemslist row and its comments/activities. cardId = itemslist.id. */
export async function deleteCardAndItem(
  cardId: number
): Promise<{ error: Error | null }> {
  const supabase = createClient();
  await supabase.from("item_comments").delete().eq("item_id", cardId);
  await supabase.from("item_activities").delete().eq("item_id", cardId);
  const { error } = await supabase.from("itemslist").delete().eq("id", cardId);
  return { error: error as Error | null };
}

/** Get all cards for a board: columns (cardslist) + items (itemslist where cardid = column id). Returns one entry per item with boardCardId = column id, cardId = item id. */
export async function getBoardCards(boardName: string): Promise<{
  data: Array<{ boardCardId: number; cardId: number; listName: string; title: string; position: number; item?: Item }> | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const boardId = String(boardName ?? "").trim();

  const { data: columns, error: colErr } = await supabase
    .from("cardslist")
    .select("id, cardname, position")
    .eq("boardid", boardId)
    .order("position", { ascending: true });

  if (colErr) return { data: null, error: colErr };
  if (!columns?.length) return { data: [], error: null };

  const result: Array<{ boardCardId: number; cardId: number; listName: string; title: string; position: number; item?: Item }> = [];
  for (const col of columns as Array<{ id: number; cardname: string; position?: number }>) {
    const { data: items } = await supabase
      .from("itemslist")
      .select("id, name, comment, createddate, status, cover_path, description")
      .eq("cardid", col.id)
      .order("createddate", { ascending: true });
    const list = (items ?? []) as Array<Item & { id: number }>;
    list.forEach((item, idx) => {
      result.push({
        boardCardId: col.id,
        cardId: item.id,
        listName: col.cardname ?? "",
        title: item.name ?? "",
        position: typeof col.position === "number" ? col.position : idx,
        item: { ...item, status: item.status ?? false, cover_path: item.cover_path ?? null },
      });
    });
  }
  result.sort((a, b) => {
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
