"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { createClient, getCachedSession, clearSessionCache } from "@/lib/supabase";
import {
  getBoardCards,
  getBoardListOrder,
  createCardWithItem,
  addCardToBoard,
  updateCardList,
  updateCardPosition,
  updateBoardListOrder,
  updateItem,
  getItemComments,
  createItemComment,
  updateItemComment,
  deleteItemComment,
  getItemActivities,
  createItemActivity,
} from "@/lib/cards-storage";
import {
  getWorkspace,
  getWorkspacesForUser,
  getBoardsByWorkspace,
  createBoard,
  isWorkspaceMember,
} from "@/lib/workspace-storage";
import type { ItemComment, ItemActivity } from "@/lib/cards-storage";
import type { Board, Workspace } from "@/lib/workspace-storage";

type Card = { id: string; title: string; dbCardId?: number; boardCardId?: number; itemId?: number; done?: boolean; coverUrl?: string | null; description?: string | null };
type List = { id: string; title: string; cards: Card[] };

const DEFAULT_LISTS = ["To Do", "In Progress", "Done"];

function getEmptyListsForBoard(boardId: string): List[] {
  return DEFAULT_LISTS.map((title, i) => ({
    id: `${boardId}-l-${i}`,
    title,
    cards: [],
  }));
}

function DraggableCard({ card, listId, onDoneChange, onDoneSaved, onEdit }: {
  card: Card;
  listId: string;
  onDoneChange?: (cardId: string, nextDone: boolean) => void;
  onDoneSaved?: () => void;
  onEdit?: (card: Card) => void;
}) {
  const [done, setDone] = useState(Boolean(card.done));
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: card.id,
    data: { cardId: card.id, listId },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: card.id, data: { listId } });
  useEffect(() => { setDone(Boolean(card.done)); }, [card.done]);
  const handleToggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !done;
    setDone(next);
    onDoneChange?.(card.id, next);
    if (card.itemId != null) {
      updateItem(card.itemId, { status: next }).then(({ error }) => {
        if (error) { setDone(done); onDoneChange?.(card.id, done); }
        else onDoneSaved?.();
      });
    }
  };
  return (
    <div
      ref={(n) => { setDragRef(n); setDropRef(n); }}
      {...attributes}
      {...listeners}
      className={`rounded-xl p-3 bg-white shadow-sm border border-slate-200/80 transition-all ${isOver ? "ring-2 ring-indigo-400" : ""} ${isDragging ? "opacity-50" : ""}`}
    >
      {card.coverUrl && (
        <div className="w-full h-16 -mx-3 -mt-3 mb-2 rounded-t-xl overflow-hidden">
          <img src={card.coverUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={handleToggleDone}
          className={`mt-1 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${done ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}
          aria-label={done ? "Mark not done" : "Mark done"}
        >
          {done && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-slate-800 text-sm font-medium break-words ${done ? "line-through text-slate-500" : ""}`}>{card.title}</p>
          <button type="button" onClick={() => onEdit?.(card)} className="mt-1 text-indigo-600 text-xs font-medium hover:text-indigo-700">Edit</button>
        </div>
      </div>
    </div>
  );
}

function CardDragPreview({ card }: { card: Card }) {
  return (
    <div className="rounded-xl p-3 bg-white shadow-lg border border-slate-200 w-[260px]">
      {card.coverUrl && (
        <div className="w-full h-16 -mx-3 -mt-3 mb-2 rounded-t-xl overflow-hidden">
          <img src={card.coverUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
      <div className="flex items-start gap-2">
        {card.done && <span className="mt-1 w-4 h-4 rounded bg-indigo-600 shrink-0 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg></span>}
        <p className={`text-slate-800 text-sm font-medium break-words ${card.done ? "line-through text-slate-500" : ""}`}>{card.title}</p>
      </div>
    </div>
  );
}

function DroppableList({
  list,
  newCardListId,
  newCardTitle,
  setNewCardTitle,
  addCard,
  setNewCardListId,
  children,
}: {
  list: List;
  newCardListId: string | null;
  newCardTitle: string;
  setNewCardTitle: (v: string) => void;
  addCard: (listId: string) => void;
  setNewCardListId: (v: string | null) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: list.id, data: { type: "list", listId: list.id } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: list.id, data: { type: "list", listId: list.id } });
  return (
    <div ref={(n) => { setDragRef(n); setDropRef(n); }} className={`w-[280px] shrink-0 rounded-2xl bg-slate-100/80 backdrop-blur-sm p-4 h-fit border ${isOver ? "border-indigo-400/60" : "border-slate-200/50"} shadow-sm`}>
      <div className="flex items-center gap-2 mb-3" {...attributes} {...listeners}>
        <div className="cursor-grab w-4 h-4 text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        <h3 className="font-semibold text-slate-800">{list.title}</h3>
      </div>
      <div className="space-y-2 min-h-[40px]">
        {children}
      </div>
      {newCardListId === list.id ? (
        <div className="mt-2">
          <input
            type="text"
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCard(list.id); if (e.key === "Escape") setNewCardListId(null); }}
            placeholder="Card title…"
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 bg-white mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => addCard(list.id)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700">Add</button>
            <button type="button" onClick={() => setNewCardListId(null)} className="px-3 py-2 text-slate-500 hover:text-slate-700 rounded-lg">×</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setNewCardListId(list.id)} className="mt-2 w-full text-left px-4 py-3 rounded-xl text-slate-600 text-sm font-medium hover:bg-white/60 flex gap-2 border-2 border-dashed border-slate-300/60">
          <span className="text-indigo-500 font-bold">+</span> Add a card
        </button>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params.id as string;
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentBoardId, setCurrentBoardId] = useState<string>("");
  const [boardData, setBoardData] = useState<Record<string, List[]>>({});
  const [showBoardPopup, setShowBoardPopup] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [activeCard, setActiveCard] = useState<{ card: Card; listId: string } | null>(null);
  const [newCardListId, setNewCardListId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [showAddList, setShowAddList] = useState(false);
  const [addCardError, setAddCardError] = useState<string | null>(null);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [editCardListName, setEditCardListName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editCoverRemoved, setEditCoverRemoved] = useState(false);
  const [itemComments, setItemComments] = useState<ItemComment[]>([]);
  const [itemActivities, setItemActivities] = useState<ItemActivity[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const [newCommentText, setNewCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [popupLoading, setPopupLoading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const commentsJustAddedRef = useRef<number>(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const currentBoard = boards.find((b) => b.id === currentBoardId);
  const lists = currentBoardId ? (boardData[currentBoardId] ?? getEmptyListsForBoard(currentBoardId)) : [];
  const setLists = (updater: (prev: List[]) => List[]) => {
    if (!currentBoardId) return;
    setBoardData((prev) => ({
      ...prev,
      [currentBoardId]: updater(prev[currentBoardId] ?? getEmptyListsForBoard(currentBoardId)),
    }));
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const broadcastRefresh = () => broadcastChannelRef.current?.postMessage({ type: "broadcast", event: "refresh" });

  useEffect(() => {
    (async () => {
      const session = await getCachedSession();
      if (!session?.user) { router.replace("/login"); return; }
      const u = session.user;
      const supabase = createClient();
      const { data: userRow } = await supabase.from("users").select("full_name").eq("auth_id", u.id).single();
      setUser({ email: u.email ?? undefined, full_name: (userRow?.full_name as string) ?? (u.user_metadata?.full_name as string) ?? undefined });
      setAuthUserId(u.id);

      const [wsRes, wsListRes, boardsRes, memberRes] = await Promise.all([
        getWorkspace(workspaceId),
        getWorkspacesForUser(u.id),
        getBoardsByWorkspace(workspaceId),
        isWorkspaceMember(workspaceId, u.id),
      ]);

      if (wsRes.error || !wsRes.data) {
        setAddCardError(wsRes.error?.message ?? "Workspace not found");
        setLoading(false);
        return;
      }
      setWorkspace(wsRes.data);
      setWorkspaces(wsListRes.data ?? []);
      setBoards(boardsRes.data ?? []);
      setIsMember(memberRes);

      const firstBoard = (boardsRes.data ?? [])[0];
      if (firstBoard) {
        setCurrentBoardId(firstBoard.id);
        const [{ data: dbCards, error }, { data: listOrder }] = await Promise.all([
          getBoardCards(firstBoard.id),
          getBoardListOrder(firstBoard.id),
        ]);
        const order = listOrder ?? [];
        const listTitles = order.length > 0 ? order.map((o) => o.listname) : DEFAULT_LISTS;
        const listsByTitle = new Map<string, List>();
        listTitles.forEach((t, i) => {
          listsByTitle.set(t, { id: `${firstBoard.id}-l-${i}`, title: t, cards: [] });
        });
        (dbCards ?? []).forEach((c) => {
          const list = listsByTitle.get(c.listName) ?? Array.from(listsByTitle.values())[0];
          if (list) {
            list.cards.push({
              id: `c-${c.cardId}`,
              title: c.title,
              dbCardId: c.cardId,
              boardCardId: c.boardCardId,
              itemId: c.item?.id,
              done: c.item?.status,
              coverUrl: c.item?.cover_path ? `/uploads/covers/${c.item.cover_path}` : null,
              description: c.item?.description ?? null,
            });
          }
        });
        setBoardData({ [firstBoard.id]: Array.from(listsByTitle.values()) });
      }
      setLoading(false);
    })();
  }, [workspaceId, router]);

  useEffect(() => {
    if (!currentBoardId || boardData[currentBoardId] !== undefined) return;
    (async () => {
      const [{ data: dbCards, error }, { data: listOrder }] = await Promise.all([
        getBoardCards(currentBoardId),
        getBoardListOrder(currentBoardId),
      ]);
      if (error) return;
      const order = listOrder ?? [];
      const listTitles = order.length > 0 ? order.map((o) => o.listname) : DEFAULT_LISTS;
      const listsByTitle = new Map<string, List>();
      listTitles.forEach((t, i) => { listsByTitle.set(t, { id: `${currentBoardId}-l-${i}`, title: t, cards: [] }); });
      (dbCards ?? []).forEach((c) => {
        const list = listsByTitle.get(c.listName) ?? Array.from(listsByTitle.values())[0];
        if (list) list.cards.push({
          id: `c-${c.cardId}`,
          title: c.title,
          dbCardId: c.cardId,
          boardCardId: c.boardCardId,
          itemId: c.item?.id,
          done: c.item?.status,
          coverUrl: c.item?.cover_path ? `/uploads/covers/${c.item.cover_path}` : null,
          description: c.item?.description ?? null,
        });
      });
      setBoardData((prev) => ({ ...prev, [currentBoardId]: Array.from(listsByTitle.values()) }));
    })();
  }, [currentBoardId, boardData]);

  useEffect(() => {
    if (!workspaceId || !authUserId) return;
    broadcastChannelRef.current = new BroadcastChannel("register-sync");
    const handler = () => {
      if (!currentBoardId) return;
      getBoardCards(currentBoardId).then(({ data }) => {
        if (!data?.length) return;
        const listTitles = [...new Set(data.map((c) => c.listName))];
        const listsByTitle = new Map<string, List>();
        listTitles.forEach((t, i) => { listsByTitle.set(t, { id: `${currentBoardId}-l-${i}`, title: t, cards: [] }); });
        data.forEach((c) => {
          const list = listsByTitle.get(c.listName);
          if (list) list.cards.push({
            id: `c-${c.cardId}`,
            title: c.title,
            dbCardId: c.cardId,
            boardCardId: c.boardCardId,
            itemId: c.item?.id,
            done: c.item?.status,
            coverUrl: c.item?.cover_path ? `/uploads/covers/${c.item.cover_path}` : null,
            description: c.item?.description ?? null,
          });
        });
        setBoardData((prev) => ({ ...prev, [currentBoardId]: Array.from(listsByTitle.values()) }));
      });
    };
    broadcastChannelRef.current.addEventListener("message", handler);
    return () => { broadcastChannelRef.current?.close(); };
  }, [workspaceId, authUserId, currentBoardId]);

  useEffect(() => {
    if (!editCard?.itemId) {
      setItemComments([]);
      setItemActivities([]);
      setPopupLoading(false);
      return;
    }
    const itemId = editCard.itemId;
    let isMounted = true;
    setPopupLoading(true);
    Promise.all([
      getItemComments(itemId).then(({ data }) => { if (isMounted) setItemComments(data ?? []); }).catch(() => {}),
      getItemActivities(itemId).then(({ data }) => { if (isMounted) setItemActivities(data ?? []); }).catch(() => {}),
    ]).finally(() => { if (isMounted) setPopupLoading(false); });
    setNewCommentText("");
    setEditingCommentId(null);
    const supabase = createClient();
    const channel = supabase.channel(`item-${itemId}`).on("postgres_changes", { event: "*", schema: "public", table: "item_comments", filter: `item_id=eq.${itemId}` }, () => {
      getItemComments(itemId).then(({ data }) => { if (isMounted) setItemComments(data ?? []); }).catch(() => {});
    }).subscribe();
    const poll = setInterval(() => {
      getItemComments(itemId).then(({ data }) => { if (isMounted) setItemComments(data ?? []); }).catch(() => {});
      getItemActivities(itemId).then(({ data }) => { if (isMounted) setItemActivities(data ?? []); }).catch(() => {});
    }, 3000);
    return () => { isMounted = false; clearInterval(poll); supabase.removeChannel(channel); };
  }, [editCard?.id, editCard?.itemId]);

  const addCard = async (listId: string) => {
    const title = newCardTitle.trim();
    if (!title || !currentBoard || !authUserId) return;
    setAddCardError(null);
    const list = lists.find((l) => l.id === listId);
    const listName = list?.title ?? "To Do";
    const { data, error } = await createCardWithItem(title, listName);
    if (error) { setAddCardError(error.message); return; }
    if (!data) return;
    const { data: bcId, error: boardErr } = await addCardToBoard(data.cardId, currentBoard.id, listName);
    if (boardErr) { setAddCardError(boardErr.message); return; }
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId ? { ...l, cards: [...l.cards, { id: `c-${data.cardId}`, title, dbCardId: data.cardId, boardCardId: bcId ?? undefined, itemId: data.itemId, done: false, coverUrl: null }] } : l
      )
    );
    setNewCardTitle("");
    setNewCardListId(null);
    broadcastRefresh();
  };

  const addList = () => {
    if (!newListTitle.trim() || !currentBoardId) return;
    setLists((prev) => [...prev, { id: `${currentBoardId}-l-${Date.now()}`, title: newListTitle.trim(), cards: [] }]);
    setNewListTitle("");
    setShowAddList(false);
    const newLists = [...lists.map((l) => ({ listname: l.title, position: 0 })), { listname: newListTitle.trim(), position: lists.length }];
    updateBoardListOrder(currentBoardId, newLists.map((l, i) => ({ ...l, position: i }))).then(() => broadcastRefresh());
  };

  const handleDragStart = (e: DragStartEvent) => {
    const list = lists.find((l) => l.cards.some((c) => c.id === e.active.id));
    const card = list?.cards.find((c) => c.id === e.active.id);
    if (list && card) setActiveCard({ card, listId: list.id });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = e;
    if (!over || !currentBoardId) return;
    const data = active.data.current as { type?: string; listId?: string } | undefined;
    if (data?.type === "list") {
      const sourceListId = active.id as string;
      const targetListId = over.id as string;
      if (sourceListId === targetListId) return;
      const sourceIdx = lists.findIndex((l) => l.id === sourceListId);
      const targetIdx = lists.findIndex((l) => l.id === targetListId);
      if (sourceIdx < 0 || targetIdx < 0) return;
      const reordered = [...lists];
      const [removed] = reordered.splice(sourceIdx, 1);
      reordered.splice(targetIdx, 0, removed);
      setBoardData((prev) => ({ ...prev, [currentBoardId]: reordered }));
      updateBoardListOrder(currentBoardId, reordered.map((l, i) => ({ listname: l.title, position: i }))).then(() => broadcastRefresh());
      return;
    }
    const listId = data?.listId;
    const cardId = active.id as string;
    if (!listId || !cardId || cardId === over.id) return;
    const sourceList = lists.find((l) => l.id === listId);
    const card = sourceList?.cards.find((c) => c.id === cardId);
    if (!sourceList || !card) return;
    let targetListId: string;
    let targetIndex: number;
    const overId = over.id as string;
    const targetListById = lists.find((l) => l.id === overId);
    if (targetListById) {
      targetListId = overId;
      targetIndex = targetListById.cards.length;
    } else {
      const listWithCard = lists.find((l) => l.cards.some((c) => c.id === overId));
      if (!listWithCard) return;
      const idx = listWithCard.cards.findIndex((c) => c.id === overId);
      targetListId = listWithCard.id;
      targetIndex = idx >= 0 ? idx : listWithCard.cards.length;
    }
    const targetList = lists.find((l) => l.id === targetListId)!;
    const sourceIndex = sourceList.cards.findIndex((c) => c.id === cardId);
    const insertIndex = listId === targetListId && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const newCards = [...targetList.cards];
    if (listId === targetListId) {
      newCards.splice(sourceIndex, 1);
      newCards.splice(insertIndex, 0, card);
    } else {
      newCards.splice(insertIndex, 0, card);
    }
    const prevState = lists;
    setLists((prev) =>
      prev.map((l) => {
        if (l.id === listId && l.id === targetListId) return { ...l, cards: newCards };
        if (l.id === listId) return { ...l, cards: l.cards.filter((c) => c.id !== cardId) };
        if (l.id === targetListId) return { ...l, cards: newCards };
        return l;
      })
    );
    const dbCardId = card.dbCardId;
    const itemId = card.itemId;
    if (listId !== targetListId && dbCardId != null && targetList.title) {
      const fromList = sourceList.title;
      const toList = targetList.title;
      updateCardList(dbCardId, targetList.title).then(({ error }) => {
        if (error) { setAddCardError(error.message); setBoardData({ ...boardData, [currentBoardId]: prevState }); }
        else {
          updateCardPosition(dbCardId, insertIndex).then(() => {
            broadcastRefresh();
            if (itemId != null && authUserId) createItemActivity(itemId, authUserId, "card_moved", { from_list: fromList, to_list: toList }).catch(() => {});
          });
        }
      });
    } else if (dbCardId != null) {
      updateCardPosition(dbCardId, insertIndex).then(({ error }) => {
        if (error) setAddCardError(error.message);
        else broadcastRefresh();
      });
    }
  };

  const handleSignOut = async () => {
    clearSessionCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleCreateBoard = async () => {
    const name = newBoardName.trim();
    if (!name) return;
    setAddCardError(null);
    const { data, error } = await createBoard(workspaceId, name);
    if (error) { setAddCardError(error.message); return; }
    if (data) {
      setBoards((prev) => [...prev, data]);
      setCurrentBoardId(data.id);
      setBoardData((prev) => ({ ...prev, [data.id]: getEmptyListsForBoard(data.id) }));
      setNewBoardName("");
      setShowNewBoard(false);
      broadcastRefresh();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-indigo-900/90 to-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 animate-pulse" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-indigo-900/90 to-slate-900 flex flex-col items-center justify-center p-4">
        <p className="text-white/90 mb-4">{addCardError ?? "Workspace not found"}</p>
        <Link href="/dashboard" className="px-5 py-2.5 rounded-xl bg-white/15 text-white font-medium hover:bg-white/25">
          Back to workspaces
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-800 via-indigo-900/80 to-slate-900">
      <header className="flex items-center justify-between px-6 py-3 bg-white/5 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-bold text-xl">B</Link>
          <span className="px-3 py-2 text-white text-sm font-medium">
            {workspace?.name ?? "Workspace"}
            {currentBoard && currentBoard.name !== workspace?.name && (
              <><span className="text-white/60 mx-1">·</span>{currentBoard.name}</>
            )}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/90 text-sm truncate max-w-[180px]" title={user?.email}>{user?.full_name ?? user?.email}</span>
          <button type="button" onClick={handleSignOut} className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto overflow-y-auto p-6">
        {addCardError && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-400/30 text-red-200 rounded-xl text-sm">{addCardError}</div>
        )}
        {!currentBoardId ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/80">
            <p className="mb-4">No boards yet</p>
            {showNewBoard ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="Board name"
                  className="px-4 py-2 rounded-xl bg-slate-700 border border-slate-600 text-white"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); if (e.key === "Escape") setShowNewBoard(false); }}
                  autoFocus
                />
                <button type="button" onClick={handleCreateBoard} className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">Create</button>
                <button type="button" onClick={() => setShowNewBoard(false)} className="px-4 py-2 text-slate-400">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowNewBoard(true)} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                Create new board
              </button>
            )}
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="flex gap-5 items-start min-w-min pb-4">
                {lists.map((list) => (
                  <DroppableList
                    key={list.id}
                    list={list}
                    newCardListId={newCardListId}
                    newCardTitle={newCardTitle}
                    setNewCardTitle={setNewCardTitle}
                    addCard={addCard}
                    setNewCardListId={setNewCardListId}
                  >
                    {list.cards.map((card) => (
                      <DraggableCard
                        key={card.id}
                        card={card}
                        listId={list.id}
                        onDoneChange={(cardId, nextDone) => setLists((prev) => prev.map((l) => ({ ...l, cards: l.cards.map((c) => (c.id === cardId ? { ...c, done: nextDone } : c)) })))}
                        onDoneSaved={broadcastRefresh}
                        onEdit={(c) => { setEditCard(c); setEditCardListName(list.title); setEditTitle(c.title); setEditDescription(c.description ?? ""); setEditCoverUrl(c.coverUrl ?? ""); setEditCoverRemoved(false); }}
                      />
                    ))}
                  </DroppableList>
                ))}
                {showAddList ? (
                  <div className="w-[280px] shrink-0 rounded-2xl bg-slate-100/80 p-4 h-fit border border-slate-200/50">
                    <input type="text" value={newListTitle} onChange={(e) => setNewListTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addList(); if (e.key === "Escape") setShowAddList(false); }} placeholder="List title…" className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm mb-3" autoFocus />
                    <div className="flex gap-2">
                      <button type="button" onClick={addList} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl">Add list</button>
                      <button type="button" onClick={() => setShowAddList(false)} className="px-3 py-2 text-slate-500">×</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowAddList(true)} className="w-[280px] shrink-0 rounded-2xl bg-white/10 hover:bg-white/20 text-white/90 text-sm font-medium px-4 py-4 text-left border-2 border-dashed border-white/20">
                    + Add another list
                  </button>
                )}
              </div>
              <DragOverlay dropAnimation={null}>{activeCard ? <CardDragPreview card={activeCard.card} /> : null}</DragOverlay>
            </DndContext>
            <footer className="mt-4 flex items-center justify-between">
              <p className="text-white/70 text-sm">Current board: {currentBoard?.name}</p>
              <button type="button" onClick={() => setShowBoardPopup(true)} className="px-5 py-2.5 rounded-xl bg-white/15 text-white text-sm font-medium hover:bg-white/25">
                Change board
              </button>
            </footer>
          </>
        )}
      </main>

      {showBoardPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowBoardPopup(false)}>
          <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Change board</h3>
            <ul className="space-y-2">
              {boards.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => { setCurrentBoardId(b.id); setShowBoardPopup(false); }} className={`w-full text-left px-4 py-3 rounded-xl font-medium ${currentBoardId === b.id ? "bg-indigo-600 text-white" : "bg-white/5 text-white/90 hover:bg-white/10"}`}>
                    {b.name}
                  </button>
                </li>
              ))}
            </ul>
            {showNewBoard ? (
              <div className="mt-4 flex gap-2">
                <input type="text" value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="Board name" className="flex-1 px-4 py-2 rounded-xl bg-slate-700 border border-slate-600 text-white" onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); }} />
                <button type="button" onClick={handleCreateBoard} className="px-4 py-2 bg-indigo-600 text-white rounded-xl">Create</button>
                <button type="button" onClick={() => setShowNewBoard(false)} className="px-4 py-2 text-slate-400">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowNewBoard(true)} className="mt-4 w-full py-2.5 text-indigo-400 text-sm font-medium">
                + Create new board
              </button>
            )}
            <button type="button" onClick={() => setShowBoardPopup(false)} className="mt-4 w-full py-2.5 text-white/60 hover:text-white/90 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {editCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setEditCard(null); setEditCardListName(""); }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-white relative" onClick={(e) => e.stopPropagation()}>
            {popupLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
                <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <div className="bg-slate-200 shrink-0 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-700 font-medium">{editCardListName || "Card"}</span>
                <button type="button" onClick={() => { setEditCard(null); setEditCardListName(""); }} className="p-2 rounded-full bg-slate-600 text-white hover:bg-slate-700">×</button>
              </div>
              {editCoverUrl.trim() || (!editCoverRemoved && editCard.coverUrl) ? (
                <div className="relative aspect-[6/1] bg-slate-300 rounded-lg overflow-hidden">
                  <img src={editCoverUrl.trim() || editCard.coverUrl || ""} alt="Cover" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <button type="button" onClick={() => { setEditCoverUrl(""); setEditCoverRemoved(true); }} className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/60 text-white text-xs">Remove</button>
                </div>
              ) : (
                <div className="aspect-[6/1] bg-slate-300 rounded-lg flex items-center justify-center text-slate-500 text-sm">No cover</div>
              )}
            </div>
            <div className="bg-slate-800 flex-1 overflow-y-auto p-5 flex gap-6">
              <div className="flex-1 min-w-0">
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Card title" className="w-full bg-transparent text-white font-semibold text-base mb-4 focus:outline-none placeholder:text-slate-500" onBlur={() => { if (editCard.itemId == null) return; const newTitle = editTitle.trim() || editCard.title; const prevTitle = editCard.title; if (newTitle === prevTitle) return; setLists((prev) => prev.map((l) => ({ ...l, cards: l.cards.map((c) => (c.id === editCard.id ? { ...c, title: newTitle } : c)) }))); updateItem(editCard.itemId, { name: newTitle }).then(({ error }) => { if (error) setAddCardError(error.message); else { if (authUserId) createItemActivity(editCard.itemId!, authUserId, "title_updated", { previous_title: prevTitle, new_title: newTitle }).catch(() => {}); broadcastRefresh(); } }); }} onKeyDown={(e) => { if (e.key !== "Enter") return; (e.target as HTMLInputElement).blur(); }} />
                <label className="block text-slate-400 text-xs font-medium mb-1">Description</label>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Add description…" rows={4} className="w-full px-3 py-2 rounded-lg bg-slate-700/80 border border-slate-600 text-white text-sm placeholder:text-slate-500 focus:outline-none resize-none" />
              </div>
              <div className="w-80 shrink-0">
                <h4 className="text-white/90 font-medium mb-3">Comments and activity</h4>
                <button type="button" onClick={() => setShowDetails((prev) => !prev)} className="mb-3 px-3 py-2 rounded-lg bg-slate-700 text-white text-sm">{showDetails ? "Hide details" : "Show details"}</button>
                <input type="text" value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Write a comment…" className="w-full px-3 py-2 rounded-lg bg-slate-700/80 border border-slate-600 text-white text-sm mb-2 focus:outline-none" onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); if (!newCommentText.trim() || !editCard?.itemId || !authUserId) return; createItemComment(editCard.itemId, authUserId, newCommentText.trim()).then(({ data, error }) => { if (error) setAddCardError(error.message); else if (data) { commentsJustAddedRef.current = Date.now(); setItemComments((prev) => [{ ...data, full_name: user?.full_name ?? null }, ...prev]); setNewCommentText(""); } }); }} />
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {(() => {
                    const commentsForFeed = itemComments.map((c) => ({ type: "comment" as const, ...c }));
                    const activitiesForFeed = showDetails ? itemActivities.map((a) => ({ type: "activity" as const, ...a })) : [];
                    const merged = [...commentsForFeed, ...activitiesForFeed].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                    return merged.map((entry) => {
                      const name = "full_name" in entry ? (entry.full_name ?? "Unknown") : "";
                      const initials = name.split(/\s+/).map((s) => s[0]).join("").toUpperCase().slice(0, 2) || "?";
                      if (entry.type === "comment") {
                        const c = entry;
                        return (
                          <div key={`c-${c.id}`} className="flex gap-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">{initials}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-white/90 font-medium">{name}</span>
                                <span className="text-slate-400 text-xs">{new Date(c.created_at).toLocaleString()}</span>
                              </div>
                              {editingCommentId === c.id ? (
                                <div className="mt-1 flex gap-2">
                                  <input type="text" value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} className="flex-1 px-2 py-1 rounded bg-slate-700 text-white text-sm" autoFocus />
                                  <button type="button" onClick={() => updateItemComment(c.id, editingCommentText).then(({ error }) => { if (error) setAddCardError(error.message); else { setItemComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, comment: editingCommentText } : x))); setEditingCommentId(null); } })} className="text-indigo-400 text-xs">Save</button>
                                  <button type="button" onClick={() => setEditingCommentId(null)} className="text-slate-400 text-xs">Cancel</button>
                                </div>
                              ) : (
                                <p className="mt-1 px-3 py-2 rounded-lg bg-slate-700/80 text-white/90 text-sm">{c.comment}</p>
                              )}
                              {editingCommentId !== c.id && authUserId === c.user_id && (
                                <div className="flex gap-2 mt-1 text-xs">
                                  <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.comment); }} className="text-slate-400 hover:text-white">Edit</button>
                                  <span className="text-slate-500">·</span>
                                  <button type="button" onClick={() => deleteItemComment(c.id).then(({ error }) => { if (error) setAddCardError(error.message); else setItemComments((prev) => prev.filter((x) => x.id !== c.id)); })} className="text-slate-400 hover:text-red-400">Delete</button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      const a = entry;
                      const activityText = a.action_type === "card_moved" && a.metadata && typeof a.metadata.from_list === "string" && typeof a.metadata.to_list === "string"
                        ? `moved this card from ${a.metadata.from_list} to ${a.metadata.to_list}`
                        : a.action_type === "title_updated" ? "updated the title" : a.action_type === "description_updated" ? "updated the description" : a.action_type.replace(/_/g, " ");
                      return (
                        <div key={`a-${a.id}`} className="flex gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">{initials}</div>
                          <div>
                            <p className="text-white/90 text-sm"><span className="font-medium">{name}</span> {activityText}</p>
                            <span className="text-slate-400 text-xs">{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
