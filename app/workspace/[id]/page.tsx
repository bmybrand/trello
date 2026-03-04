"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
import { createClient, getCachedSession, getSessionWithRetry, clearSessionCache, uploadCoverImage } from "@/lib/supabase";
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
  deleteCardAndItem,
  createEmptyColumnInCardslist,
  updateEmptyColumnInCardslist,
  deleteEmptyColumnFromCardslist,
  updateEmptyColumnPositionsInCardslist,
} from "@/lib/cards-storage";
import {
  getWorkspace,
  getWorkspacesForUser,
  getBoardsAccessibleToUser,
  createBoard,
  deleteBoard,
  isWorkspaceMember,
} from "@/lib/workspace-storage";
import type { ItemComment, ItemActivity } from "@/lib/cards-storage";
import type { Board, Workspace } from "@/lib/workspace-storage";

type Card = { id: string; title: string; dbCardId?: number; boardCardId?: number; itemId?: number; done?: boolean; coverUrl?: string | null; description?: string | null };
type List = { id: string; title: string; cards: Card[] };

function getEmptyListsForBoard(_boardId: string): List[] {
  // New boards should start with no lists; users add lists themselves.
  return [];
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
      className={`relative cursor-grab active:cursor-grabbing rounded-xl overflow-hidden bg-white shadow-sm border border-slate-200/80 transition-all duration-200 ${
        isOver ? "ring-2 ring-navy-400 scale-[1.02] border-navy-400" : ""
      } ${isDragging ? "opacity-60 scale-[0.97]" : ""}`}
    >
      {card.coverUrl && (
        <div className="w-full aspect-16/9 -mt-3 mb-0 rounded-t-xl overflow-hidden">
          <img src={card.coverUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
      <div className="px-3 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleDone}
          className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${done ? "bg-navy-700 border-navy-700" : "border-slate-300"}`}
          aria-label={done ? "Mark not done" : "Mark done"}
        >
          {done && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <p className={`text-slate-800 text-sm leading-snug font-medium break-words ${done ? "line-through text-navy-500" : ""}`}>
            {card.title}
          </p>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(card);
            }}
            className="ml-1 text-slate-400 hover:text-navy-400 shrink-0"
            aria-label="Edit card"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L10 16l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function CardDragPreview({ card }: { card: Card }) {
  return (
    <div className="animate-drag-preview-in rounded-xl overflow-hidden bg-white w-[260px] shadow-2xl border-2 border-navy-400 opacity-95 rotate-1 cursor-grabbing">
      {card.coverUrl && (
        <div className="w-full aspect-16/9 overflow-hidden">
          <img
            src={card.coverUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="px-3 py-3 flex items-center gap-2">
        {card.done && (
          <span className="w-4 h-4 rounded-full bg-navy-700 shrink-0 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        )}
        <p className={`text-slate-800 text-sm font-medium break-words ${card.done ? "line-through text-navy-500" : ""}`}>{card.title}</p>
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
  onRenameList,
  onDeleteList,
  children,
}: {
  list: List;
  newCardListId: string | null;
  newCardTitle: string;
  setNewCardTitle: (v: string) => void;
  addCard: (listId: string) => void;
  setNewCardListId: (v: string | null) => void;
  onRenameList: (listId: string, newTitle: string) => void;
  onDeleteList: (listId: string) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: list.id, data: { type: "list", listId: list.id } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: list.id, data: { type: "list", listId: list.id } });
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const saveRename = () => {
    if (renameValue.trim()) {
      onRenameList(list.id, renameValue.trim());
    } else {
      setRenameValue(list.title);
    }
    setIsRenaming(false);
  };

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(list.title);
      renameInputRef.current?.focus();
    }
  }, [isRenaming, list.title]);

  return (
    <div ref={(n) => { setDragRef(n); setDropRef(n); }} className={`w-[280px] shrink-0 rounded-2xl bg-slate-100/80 backdrop-blur-sm p-4 h-fit border-2 shadow-sm transition-all duration-200 ${isOver ? "border-navy-400 scale-[1.02] shadow-lg shadow-navy-400/20" : "border-slate-200/50"}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 cursor-grab active:cursor-grabbing min-w-0 flex-1" {...attributes} {...listeners}>
          <div className="w-4 h-4 text-slate-400 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
          </div>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={saveRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") {
                  setRenameValue(list.title);
                  setIsRenaming(false);
                  renameInputRef.current?.blur();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 px-1 py-0.5 text-sm font-semibold text-slate-800 rounded focus:outline-none focus:ring-2 focus:ring-navy-400/50 bg-white/80 border border-slate-300"
            />
          ) : (
            <h3 className="font-semibold text-slate-800 truncate">{list.title}</h3>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsRenaming(true);
            }}
            className="text-slate-400 hover:text-navy-500"
            aria-label="Rename list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L10 16l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteList(list.id);
            }}
            className="text-slate-400 hover:text-red-600"
            aria-label="Delete list"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
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
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-400/50 bg-white mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => addCard(list.id)} className="px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-xl hover:bg-navy-600">Add</button>
            <button type="button" onClick={() => setNewCardListId(null)} className="px-3 py-2 text-navy-500 hover:text-slate-700 rounded-lg">×</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setNewCardListId(list.id)} className="mt-2 w-full text-left px-4 py-3 rounded-xl text-slate-600 text-sm font-medium hover:bg-white/60 flex gap-2 border-2 border-dashed border-slate-300/60">
          <span className="text-navy-500 font-bold">+</span> Add a card
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
  const [editDone, setEditDone] = useState(false);
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editCoverRemoved, setEditCoverRemoved] = useState(false);
  const [itemComments, setItemComments] = useState<ItemComment[]>([]);
  const [itemActivities, setItemActivities] = useState<ItemActivity[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [popupLoading, setPopupLoading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const commentsJustAddedRef = useRef<number>(0);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const ADMIN_CAN_CREATE_WORKSPACE = "mughis siddiqui";
  const isAdmin = (user?.full_name ?? "").toLowerCase().trim() === ADMIN_CAN_CREATE_WORKSPACE.toLowerCase();
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
      const session = await getSessionWithRetry(500);
      if (!session?.user) { router.replace("/login"); return; }
      const u = session.user;
      const supabase = createClient();
      const { data: userRow } = await supabase.from("users").select("full_name").eq("auth_id", u.id).single();
      setUser({ email: u.email ?? undefined, full_name: (userRow?.full_name as string) ?? (u.user_metadata?.full_name as string) ?? undefined });
      setAuthUserId(u.id);

      const [wsRes, wsListRes, boardsRes, memberRes] = await Promise.all([
        getWorkspace(workspaceId),
        getWorkspacesForUser(u.id),
        getBoardsAccessibleToUser(workspaceId, u.id),
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
        let listTitles: string[] = [];
        if (order.length > 0) {
          listTitles = order.map((o) => o.listname);
        } else if (dbCards?.length) {
          listTitles = [...new Set(dbCards.map((c) => c.listName || ""))].filter(Boolean);
        }
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
              coverUrl: c.item?.cover_path ? (c.item.cover_path.startsWith("http") ? c.item.cover_path : `/uploads/covers/${c.item.cover_path}`) : null,
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
      let listTitles: string[] = [];
      if (order.length > 0) {
        listTitles = order.map((o) => o.listname);
      } else if (dbCards?.length) {
        listTitles = [...new Set(dbCards.map((c) => c.listName || ""))].filter(Boolean);
      }
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
          coverUrl: c.item?.cover_path ? (c.item.cover_path.startsWith("http") ? c.item.cover_path : `/uploads/covers/${c.item.cover_path}`) : null,
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
      Promise
        .all([getBoardCards(currentBoardId), getBoardListOrder(currentBoardId)])
        .then(([{ data: dbCards }, { data: listOrder }]) => {
          const order = listOrder ?? [];
          let listTitles: string[] = [];
          if (order.length > 0) {
            listTitles = order.map((o) => o.listname);
          } else if (dbCards?.length) {
            listTitles = [...new Set(dbCards.map((c) => c.listName || ""))].filter(Boolean);
          }
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
              coverUrl: c.item?.cover_path ? (c.item.cover_path.startsWith("http") ? c.item.cover_path : `/uploads/covers/${c.item.cover_path}`) : null,
              description: c.item?.description ?? null,
            });
          });
          setBoardData((prev) => ({ ...prev, [currentBoardId]: Array.from(listsByTitle.values()) }));
        })
        .catch(() => {});
    };
    broadcastChannelRef.current.addEventListener("message", handler);
    return () => { broadcastChannelRef.current?.close(); };
  }, [workspaceId, authUserId, currentBoardId]);

  // Realtime updates across different browsers/devices
  useEffect(() => {
    if (!currentBoardId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`board-realtime-${currentBoardId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boardcards", filter: `boardname=eq.${currentBoardId}` },
        () => broadcastRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cardslist" },
        () => broadcastRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "itemslist" },
        () => broadcastRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "board_list_order", filter: `boardname=eq.${currentBoardId}` },
        () => broadcastRefresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentBoardId]);

  // Periodically sync current board from database so other tabs/devices see changes without refresh
  useEffect(() => {
    if (!currentBoardId) return;
    let cancelled = false;

    const syncFromServer = () => {
      Promise
        .all([getBoardCards(currentBoardId), getBoardListOrder(currentBoardId)])
        .then(([{ data: dbCards }, { data: listOrder }]) => {
          if (cancelled) return;
          const order = listOrder ?? [];
          let listTitles: string[] = [];
          if (order.length > 0) {
            listTitles = order.map((o) => o.listname);
          } else if (dbCards?.length) {
            listTitles = [...new Set(dbCards.map((c) => c.listName || ""))].filter(Boolean);
          }
          const listsByTitle = new Map<string, List>();
          listTitles.forEach((t, i) => {
            listsByTitle.set(t, { id: `${currentBoardId}-l-${i}`, title: t, cards: [] });
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
                coverUrl: c.item?.cover_path ? (c.item.cover_path.startsWith("http") ? c.item.cover_path : `/uploads/covers/${c.item.cover_path}`) : null,
                description: c.item?.description ?? null,
              });
            }
          });
          setBoardData((prev) => ({ ...prev, [currentBoardId]: Array.from(listsByTitle.values()) }));
        })
        .catch(() => {});
    };

    // initial sync and then poll
    syncFromServer();
    const id = setInterval(syncFromServer, 20000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [currentBoardId]);

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
    }, 20000);
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
    const title = newListTitle.trim();
    setLists((prev) => [...prev, { id: `${currentBoardId}-l-${Date.now()}`, title, cards: [] }]);
    setNewListTitle("");
    setShowAddList(false);
    const newLists = [...lists.map((l) => ({ listname: l.title, position: 0 })), { listname: title, position: lists.length }];
    const withPos = newLists.map((l, i) => ({ ...l, position: i }));
    Promise.all([
      updateBoardListOrder(currentBoardId, withPos),
      createEmptyColumnInCardslist(currentBoardId, title, lists.length),
    ]).then(() => broadcastRefresh()).catch(() => {});
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
      const order = reordered.map((l, i) => ({ listname: l.title, position: i }));
      Promise.all([
        updateBoardListOrder(currentBoardId, order),
        updateEmptyColumnPositionsInCardslist(currentBoardId, order),
      ]).then(() => broadcastRefresh()).catch(() => {});
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
    const tempId = `temp-${Date.now()}`;
    const optimistic: Board = {
      id: tempId,
      name,
      workspace_id: workspaceId,
      created_at: new Date().toISOString(),
    };
    setBoards((prev) => [...prev, optimistic]);
    setCurrentBoardId(tempId);
    setBoardData((prev) => ({ ...prev, [tempId]: getEmptyListsForBoard(tempId) }));
    setNewBoardName("");
    setShowNewBoard(false);
    if (showBoardPopup) setShowBoardPopup(false);

    const { data, error } = await createBoard(workspaceId, name, authUserId ?? undefined);
    if (error) {
      setAddCardError(error.message);
      setBoards((prev) => prev.filter((b) => b.id !== tempId));
      setBoardData((prev) => { const next = { ...prev }; delete next[tempId]; return next; });
      const remaining = boards.filter((b) => b.id !== tempId);
      setCurrentBoardId(remaining[0]?.id ?? "");
      return;
    }
    if (data) {
      setBoards((prev) => [
        data,
        ...prev.filter((b) => b.id !== tempId && b.id !== data.id),
      ]);
      setCurrentBoardId(data.id);
      setBoardData((prev) => {
        const next = { ...prev };
        next[data.id] = next[tempId] ?? getEmptyListsForBoard(data.id);
        delete next[tempId];
        return next;
      });
      broadcastRefresh();
    }
  };

  const toggleEditDone = () => {
    if (!editCard || editCard.itemId == null) return;
    const next = !editDone;
    setEditDone(next);
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        cards: l.cards.map((c) =>
          c.id === editCard.id ? { ...c, done: next } : c
        ),
      }))
    );
    updateItem(editCard.itemId, { status: next }).then(({ error }) => {
      if (error) {
        setEditDone(!next);
        setAddCardError(error.message);
      } else {
        broadcastRefresh();
      }
    });
  };

  const handleSaveDescription = () => {
    if (!editCard || editCard.itemId == null) return;
    const previous = editCard.description ?? "";
    const next = editDescription.trim();
    if (next === previous) return;
    setAddCardError(null);
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        cards: l.cards.map((c) =>
          c.id === editCard.id ? { ...c, description: next || null } : c
        ),
      }))
    );
    setEditCard((prev) => (prev ? { ...prev, description: next || null } : prev));
    updateItem(editCard.itemId, { description: next }).then(({ error }) => {
      if (error) {
        setAddCardError(error.message);
        // revert UI on failure
        setEditDescription(previous);
        setLists((prev) =>
          prev.map((l) => ({
            ...l,
            cards: l.cards.map((c) =>
              c.id === editCard.id ? { ...c, description: previous || null } : c
            ),
          }))
        );
        setEditCard((prev) =>
          prev ? { ...prev, description: previous || null } : prev
        );
      } else {
        if (authUserId)
          createItemActivity(editCard.itemId!, authUserId, "description_updated", {
            previous_description: previous,
            new_description: next,
          }).catch(() => {});
        broadcastRefresh();
      }
    });
  };

  const handleCancelDescription = () => {
    if (!editCard) return;
    setEditDescription(editCard.description ?? "");
    setAddCardError(null);
  };

  const handleUploadCoverClick = () => {
    coverFileInputRef.current?.click();
  };

  const handleCoverFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    if (!editCard || !editCard.itemId) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      setAddCardError("Allowed types: jpg, png, gif, webp");
      return;
    }
    setPopupLoading(true);
    setAddCardError(null);
    try {
      const { url: publicPath, error } = await uploadCoverImage(file);
      if (error || !publicPath) {
        throw new Error(error?.message ?? "Failed to upload image");
      }
      setEditCoverUrl(publicPath);
      setEditCoverRemoved(false);
      setLists((prev) =>
        prev.map((l) => ({
          ...l,
          cards: l.cards.map((c) =>
            c.id === editCard.id ? { ...c, coverUrl: publicPath } : c
          ),
        }))
      );
      setEditCard((prev) =>
        prev ? { ...prev, coverUrl: publicPath } : prev
      );
      updateItem(editCard.itemId, { cover_path: publicPath }).then(({ error }) => {
        if (error) {
          setAddCardError(error.message);
        } else {
          broadcastRefresh();
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload image";
      setAddCardError(message);
    } finally {
      setPopupLoading(false);
    }
  };

  const handleDeleteBoard = async (b: Board) => {
    if (!confirm(`Delete board "${b.name}"? This cannot be undone.`)) return;
    setAddCardError(null);
    const wasCurrent = currentBoardId === b.id;
    const remainingAfterDelete = boards.filter((x) => x.id !== b.id);
    const nextId = remainingAfterDelete[0]?.id ?? "";

    setBoards((prev) => prev.filter((x) => x.id !== b.id));
    setBoardData((prev) => { const next = { ...prev }; delete next[b.id]; return next; });
    if (wasCurrent) setCurrentBoardId(nextId);
    setShowBoardPopup(false);

    const { error } = await deleteBoard(b.id, authUserId!);
    if (error) {
      setAddCardError(error.message);
      setBoards((prev) => [...prev, b]);
      setBoardData((prev) => ({ ...prev, [b.id]: getEmptyListsForBoard(b.id) }));
      if (wasCurrent) setCurrentBoardId(b.id);
    }
  };

  const handleRenameList = (listId: string, newTitle: string) => {
    const name = newTitle.trim();
    if (!name || !currentBoardId) return;
    setAddCardError(null);
    const prevLists = lists;

    // Optimistic UI update
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, title: name } : l))
    );

    const target = prevLists.find((l) => l.id === listId);
    const updatedLists = prevLists.map((l) =>
      l.id === listId ? { ...l, title: name } : l
    );

    Promise.all([
      // Update list order titles
      updateBoardListOrder(
        currentBoardId,
        updatedLists.map((l, i) => ({ listname: l.title, position: i }))
      ),
      // Update empty column in cardslist
      target ? updateEmptyColumnInCardslist(currentBoardId, target.title, name) : Promise.resolve({ error: null }),
      // Update all cards in this list to use the new list name
      ...(target
        ? target.cards
            .filter((c) => c.dbCardId != null)
            .map((c) => updateCardList(c.dbCardId!, name))
        : []),
    ]).then(([orderResult]) => {
      const orderErr = (orderResult as { error: Error | null }).error;
      if (orderErr) {
        setAddCardError(orderErr.message);
        setBoardData((prev) => ({ ...prev, [currentBoardId]: prevLists }));
      } else {
        broadcastRefresh();
      }
    }).catch(() => {});
  };

  const handleDeleteList = async (listId: string) => {
    if (!currentBoardId) return;
    const target = lists.find((l) => l.id === listId);
    if (!target) return;
    if (!confirm(`Delete list "${target.title}" and all its cards? This cannot be undone.`)) return;
    setAddCardError(null);

    const prevLists = lists;
    // Optimistic remove from UI
    setLists((prev) => prev.filter((l) => l.id !== listId));

    // Delete all cards (and their items) in this list
    const deletePromises = target.cards
      .filter((c) => c.dbCardId != null)
      .map((c) => deleteCardAndItem(c.dbCardId!));

    const remainingLists = prevLists.filter((l) => l.id !== listId);

    try {
      const results = await Promise.all(deletePromises);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) {
        throw firstErr.error;
      }
      const { error: colErr } = await deleteEmptyColumnFromCardslist(currentBoardId, target.title);
      if (colErr) throw colErr;
      const { error: orderErr } = await updateBoardListOrder(
        currentBoardId,
        remainingLists.map((l, i) => ({ listname: l.title, position: i }))
      );
      if (orderErr) throw orderErr;
      broadcastRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete list";
      setAddCardError(msg);
      // revert UI
      setBoardData((prev) => ({ ...prev, [currentBoardId]: prevLists }));
    }
  };

  const handleDeleteCard = async (card: Card) => {
    if (!currentBoardId || card.dbCardId == null) return;
    if (!confirm(`Delete card "${card.title}"? This cannot be undone.`)) return;
    setAddCardError(null);

    const prevLists = lists;
    // Optimistic removal from UI
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        cards: l.cards.filter((c) => c.id !== card.id),
      }))
    );

    const { error } = await deleteCardAndItem(card.dbCardId);
    if (error) {
      setAddCardError(error.message);
      // revert lists
      setBoardData((prev) => ({ ...prev, [currentBoardId]: prevLists }));
    } else {
      broadcastRefresh();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-navy-950 via-navy-900/90 to-navy-950 flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 animate-pulse" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-navy-950 via-navy-900/90 to-navy-950 flex flex-col items-center justify-center p-4">
        <p className="text-white/90 mb-4">{addCardError ?? "Workspace not found"}</p>
        <Link href="/dashboard" className="px-5 py-2.5 rounded-xl bg-white/15 text-white font-medium hover:bg-white/25">
          Back to workspaces
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-navy-950 via-navy-900/80 to-navy-950">
      <header className="flex items-center justify-between px-6 py-3 bg-white/5 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center justify-center shrink-0">
            <Image
              src="/Resolute Trello-03.png"
              alt="Resolute Board logo"
              width={160}
              height={40}
              className="h-10 w-auto object-contain"
            />
          </Link>
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

      <main className="flex-1 overflow-x-auto overflow-y-auto p-6 pb-20">
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
                  className="px-4 py-2 rounded-xl bg-navy-800 border border-navy-700 text-white"
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); if (e.key === "Escape") setShowNewBoard(false); }}
                  autoFocus
                />
                <button type="button" onClick={handleCreateBoard} className="px-4 py-2 bg-navy-700 text-white rounded-xl hover:bg-navy-600">Create</button>
                <button type="button" onClick={() => setShowNewBoard(false)} className="px-4 py-2 text-navy-400">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowNewBoard(true)} className="px-5 py-2.5 rounded-xl bg-navy-700 text-white font-medium hover:bg-navy-600">
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
                    onRenameList={handleRenameList}
                    onDeleteList={handleDeleteList}
                  >
                    {list.cards.map((card) => (
                      <DraggableCard
                        key={card.id}
                        card={card}
                        listId={list.id}
                        onDoneChange={(cardId, nextDone) =>
                          setLists((prev) =>
                            prev.map((l) => ({
                              ...l,
                              cards: l.cards.map((c) =>
                                c.id === cardId ? { ...c, done: nextDone } : c
                              ),
                            }))
                          )
                        }
                        onDoneSaved={broadcastRefresh}
                        onEdit={(c) => {
                          setEditCard(c);
                          setEditCardListName(list.title);
                          setEditTitle(c.title);
                          setEditDescription(c.description ?? "");
                          setEditCoverUrl(c.coverUrl ?? "");
                          setEditCoverRemoved(false);
                          setEditDone(Boolean(c.done));
                        }}
                      />
                    ))}
                  </DroppableList>
                ))}
                {showAddList ? (
                  <div className="w-[280px] shrink-0 rounded-2xl bg-slate-100/80 p-4 h-fit border border-slate-200/50">
                    <input type="text" value={newListTitle} onChange={(e) => setNewListTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addList(); if (e.key === "Escape") setShowAddList(false); }} placeholder="List title…" className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm mb-3" autoFocus />
                    <div className="flex gap-2">
                      <button type="button" onClick={addList} className="px-4 py-2 bg-navy-700 text-white text-sm font-medium rounded-xl">Add list</button>
                      <button type="button" onClick={() => setShowAddList(false)} className="px-3 py-2 text-navy-500">×</button>
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
          </>
        )}
      </main>

      {currentBoard && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-navy-950/95 backdrop-blur flex items-center justify-between px-6 py-3">
          <p className="text-white/70 text-sm">
            Current board: <span className="font-medium text-white/90">{currentBoard.name}</span>
          </p>
          <button
            type="button"
            onClick={() => setShowBoardPopup(true)}
            className="px-5 py-2.5 rounded-xl bg-white/15 text-white text-sm font-medium hover:bg-white/25"
          >
            Change board
          </button>
        </div>
      )}

      {showBoardPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowBoardPopup(false)}>
          <div className="bg-navy-900 rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Change board</h3>
            <ul className="space-y-2">
              {boards.map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => { setCurrentBoardId(b.id); setShowBoardPopup(false); }} className={`flex-1 text-left px-4 py-3 rounded-xl font-medium ${currentBoardId === b.id ? "bg-navy-700 text-white" : "bg-white/5 text-white/90 hover:bg-white/10"}`}>
                    {b.name}
                  </button>
                  {isAdmin && (
                  <button type="button" onClick={() => handleDeleteBoard(b)} className="p-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-colors" aria-label="Delete board">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                  </button>
                  )}
                </li>
              ))}
            </ul>
            {showNewBoard ? (
              <div className="mt-4 flex gap-2">
                <input type="text" value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="Board name" className="flex-1 px-4 py-2 rounded-xl bg-navy-800 border border-navy-700 text-white" onKeyDown={(e) => { if (e.key === "Enter") handleCreateBoard(); }} />
                <button type="button" onClick={handleCreateBoard} className="px-4 py-2 bg-navy-700 text-white rounded-xl">Create</button>
                <button type="button" onClick={() => setShowNewBoard(false)} className="px-4 py-2 text-navy-400">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowNewBoard(true)} className="mt-4 w-full py-2.5 text-navy-400 text-sm font-medium">
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
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-navy-950/60 backdrop-blur-sm">
                <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <div className="bg-navy-900 shrink-0 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-navy-200 font-medium">{editCardListName || "Card"}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUploadCoverClick}
                    className="w-8 h-8 rounded-full bg-navy-800 text-white/80 hover:bg-navy-700 flex items-center justify-center"
                    aria-label="Upload cover image"
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
                      <rect x="3" y="4" width="18" height="14" rx="2" ry="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="M21 15l-4.5-4.5-3 3L9 9l-6 6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditCard(null);
                      setEditCardListName("");
                    }}
                    className="w-8 h-8 rounded-full bg-navy-700 text-white hover:bg-navy-600 flex items-center justify-center text-lg"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>
              {editCoverUrl.trim() || (!editCoverRemoved && editCard.coverUrl) ? (
                <div className="relative w-full max-h-[20vh] bg-navy-800 rounded-lg overflow-hidden">
                  <img
                    src={editCoverUrl.trim() || editCard.coverUrl || ""}
                    alt="Cover"
                    className="w-full h-auto max-h-[20vh] object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditCoverUrl("");
                      setEditCoverRemoved(true);
                    }}
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/60 text-white text-xs"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="w-full max-h-[20vh] bg-navy-800 rounded-lg flex items-center justify-center text-navy-400 text-sm py-6">
                  No cover
                </div>
              )}
            </div>
            <div className="bg-navy-900 flex-1 overflow-y-auto p-5 flex gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-4">
                  <button
                    type="button"
                    onClick={toggleEditDone}
                    className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      editDone ? "bg-navy-700 border-navy-700" : "border-navy-500"
                    }`}
                    aria-label={editDone ? "Mark not done" : "Mark done"}
                  >
                    {editDone && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Card title"
                    className="flex-1 bg-transparent text-white font-semibold text-base focus:outline-none placeholder:text-navy-400"
                    onBlur={() => {
                      if (editCard.itemId == null) return;
                      const newTitle = editTitle.trim() || editCard.title;
                      const prevTitle = editCard.title;
                      if (newTitle === prevTitle) return;
                      setLists((prev) =>
                        prev.map((l) => ({
                          ...l,
                          cards: l.cards.map((c) =>
                            c.id === editCard.id ? { ...c, title: newTitle } : c
                          ),
                        }))
                      );
                      updateItem(editCard.itemId, { name: newTitle }).then(
                        ({ error }) => {
                          if (error) setAddCardError(error.message);
                          else {
                            if (authUserId)
                              createItemActivity(
                                editCard.itemId!,
                                authUserId,
                                "title_updated",
                                {
                                  previous_title: prevTitle,
                                  new_title: newTitle,
                                }
                              ).catch(() => {});
                            broadcastRefresh();
                          }
                        }
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
                <label className="block text-navy-400 text-xs font-medium mb-1">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add description…"
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-navy-800/80 border border-navy-700 text-white text-sm placeholder:text-navy-400 focus:outline-none resize-none"
                />
                {editCard && editDescription !== (editCard.description ?? "") && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDescription}
                      className="px-3 py-1.5 rounded-lg bg-navy-700 text-white text-xs font-medium hover:bg-navy-600"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelDescription}
                      className="px-3 py-1.5 rounded-lg text-navy-300 text-xs hover:text-white hover:bg-navy-800/60"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <div className="w-80 shrink-0">
                <h4 className="text-white/90 font-medium mb-3">Comments and activity</h4>
                <button type="button" onClick={() => setShowDetails((prev) => !prev)} className="mb-3 px-3 py-2 rounded-lg bg-navy-800 text-white text-sm">{showDetails ? "Hide details" : "Show details"}</button>
                <input type="text" value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Write a comment…" className="w-full px-3 py-2 rounded-lg bg-navy-800/80 border border-navy-700 text-white text-sm mb-2 focus:outline-none" onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); if (!newCommentText.trim() || !editCard?.itemId || !authUserId) return; createItemComment(editCard.itemId, authUserId, newCommentText.trim()).then(({ data, error }) => { if (error) setAddCardError(error.message); else if (data) { commentsJustAddedRef.current = Date.now(); setItemComments((prev) => [{ ...data, full_name: user?.full_name ?? null }, ...prev]); setNewCommentText(""); } }); }} />
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
                            <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center text-white text-xs font-semibold shrink-0">{initials}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-white/90 font-medium">{name}</span>
                                <span className="text-navy-400 text-xs">{new Date(c.created_at).toLocaleString()}</span>
                              </div>
                              {editingCommentId === c.id ? (
                                <div className="mt-1 flex gap-2">
                                  <input type="text" value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} className="flex-1 px-2 py-1 rounded bg-navy-800 text-white text-sm" autoFocus />
                                  <button type="button" onClick={() => updateItemComment(c.id, editingCommentText).then(({ error }) => { if (error) setAddCardError(error.message); else { setItemComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, comment: editingCommentText } : x))); setEditingCommentId(null); } })} className="text-navy-400 text-xs">Save</button>
                                  <button type="button" onClick={() => setEditingCommentId(null)} className="text-navy-400 text-xs">Cancel</button>
                                </div>
                              ) : (
                                <p className="mt-1 px-3 py-2 rounded-lg bg-navy-800/80 text-white/90 text-sm">{c.comment}</p>
                              )}
                              {editingCommentId !== c.id && authUserId === c.user_id && (
                                <div className="flex gap-2 mt-1 text-xs">
                                  <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.comment); }} className="text-navy-400 hover:text-white">Edit</button>
                                  <span className="text-navy-500">·</span>
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
                          <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center text-white text-xs font-semibold shrink-0">{initials}</div>
                          <div>
                            <p className="text-white/90 text-sm"><span className="font-medium">{name}</span> {activityText}</p>
                            <span className="text-navy-400 text-xs">{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                {editCard && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteCard(editCard);
                      setEditCard(null);
                      setEditCardListName("");
                    }}
                    className="mt-4 w-full px-3 py-2 rounded-lg border border-red-500/40 text-red-300 text-xs font-medium hover:bg-red-500/10"
                  >
                    Delete card
                  </button>
                )}
              </div>
            </div>
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverFileChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
