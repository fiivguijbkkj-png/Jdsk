import { useMemo, useState } from "react";
import {
  Check,
  Edit3,
  MessageSquare,
  Moon,
  Pin,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { Conversation } from "../types/chat";
import { PartoLogo } from "./PartoLogo";
import { PWAInstallButton } from "./PWAInstallButton";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string;
  isOpen: boolean;
  theme: "dark" | "light";
  onCloseMobile: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onClearAll: () => void;
  onToggleTheme: () => void;
}

function getGroupLabel(timestamp: number): string {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7Days = startOfToday - 7 * 86400000;

  if (timestamp >= startOfToday) return "امروز";
  if (timestamp >= startOfYesterday) return "دیروز";
  if (timestamp >= startOf7Days) return "۷ روز گذشته";
  return "قدیمی‌تر";
}

export function Sidebar({
  conversations,
  activeId,
  isOpen,
  theme,
  onCloseMobile,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onRenameConversation,
  onTogglePin,
  onClearAll,
  onToggleTheme,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const { pinnedList, groupedList } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = conversations.filter((c) => {
      if (!q) return true;
      if (c.title.toLowerCase().includes(q)) return true;
      return c.messages.some((m) => m.text.toLowerCase().includes(q));
    });

    const sorted = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt);
    const pinned = sorted.filter((c) => c.pinned);
    const unpinned = sorted.filter((c) => !c.pinned);

    const groups: { label: string; items: Conversation[] }[] = [];
    const order = ["امروز", "دیروز", "۷ روز گذشته", "قدیمی‌تر"];
    const map = new Map<string, Conversation[]>();

    for (const item of unpinned) {
      const label = getGroupLabel(item.updatedAt);
      const list = map.get(label) || [];
      list.push(item);
      map.set(label, list);
    }

    for (const label of order) {
      const items = map.get(label);
      if (items && items.length > 0) {
        groups.push({ label, items });
      }
    }

    return { pinnedList: pinned, groupedList: groups };
  }, [conversations, searchQuery]);

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const commitEditing = () => {
    if (editingId && editingTitle.trim()) {
      onRenameConversation(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const renderItem = (conv: Conversation) => {
    const isActive = conv.id === activeId;
    const isEditing = editingId === conv.id;

    return (
      <div
        key={conv.id}
        className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${
          isActive
            ? "bg-slate-200/80 dark:bg-slate-800/90 text-slate-950 dark:text-white font-medium"
            : "text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
        }`}
      >
        {isEditing ? (
          <div className="flex items-center gap-1.5 w-full">
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEditing();
                if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
              className="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-900 border border-teal-500 text-slate-900 dark:text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={commitEditing}
              className="p-1 text-teal-600 dark:text-teal-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md cursor-pointer"
              aria-label="ذخیره نام"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                onSelectConversation(conv.id);
                onCloseMobile();
              }}
              className="flex-1 min-w-0 flex items-center gap-2.5 text-start cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="truncate">{conv.title}</span>
            </button>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
              <button
                type="button"
                onClick={() => onTogglePin(conv.id)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  conv.pinned
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
                title={conv.pinned ? "برداشتن سنجاق" : "سنجاق کردن"}
                aria-label={conv.pinned ? "برداشتن سنجاق" : "سنجاق کردن"}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => startEditing(conv)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="تغییر نام"
                aria-label="تغییر نام"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteConversation(conv.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                title="حذف گفت‌وگو"
                aria-label="حذف گفت‌وگو"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 start-0 z-40 w-[280px] shrink-0 flex flex-col bg-[#EFEFEB] dark:bg-[#0F1420] border-e border-slate-200 dark:border-slate-800/80 transition-transform duration-200 ease-out ${
          isOpen
            ? "translate-x-0"
            : "translate-x-full lg:translate-x-0 lg:hidden"
        }`}
      >
        {/* Top brand & close on mobile */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <PartoLogo size={32} />
            <span className="font-display font-bold text-lg tracking-tight text-slate-950 dark:text-white whitespace-nowrap">
              پرتو
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="بستن منو"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New chat & search */}
        <div className="p-4 space-y-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onNewConversation();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>گفت‌وگوی جدید</span>
          </button>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در گفت‌وگوها..."
              className="w-full ps-9 pe-3 py-2 rounded-xl text-xs bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-teal-600 dark:focus:border-teal-500"
            />
          </div>
        </div>

        {/* Conversation history list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
          {pinnedList.length > 0 && (
            <div className="space-y-1">
              <div className="px-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                سنجاق‌شده
              </div>
              {pinnedList.map(renderItem)}
            </div>
          )}

          {groupedList.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                {group.label}
              </div>
              {group.items.map(renderItem)}
            </div>
          ))}

          {pinnedList.length === 0 && groupedList.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {searchQuery
                ? "گفت‌وگویی با این عبارت پیدا نشد."
                : "هنوز گفت‌وگویی ذخیره نشده است."}
            </div>
          )}
        </div>

        {/* Footer utilities */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2 shrink-0">
          <PWAInstallButton variant="sidebar" />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>حالت روشن</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-700" />
                  <span>حالت تاریک</span>
                </>
              )}
            </button>

            {conversations.length > 1 && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                پاک‌سازی
              </button>
            )}
          </div>

          {confirmClear && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs">
              <span className="text-rose-700 dark:text-rose-300">
                حذف همه تاریخچه؟
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                  }}
                  className="px-2 py-1 rounded-md bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
                >
                  بله
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  لغو
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
