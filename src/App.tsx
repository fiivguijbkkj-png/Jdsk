import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronDown,
  Download,
  PanelRight,
  Plus,
} from "lucide-react";
import { Composer } from "./components/Composer";
import { MessageBubble } from "./components/MessageBubble";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { PartoLogo } from "./components/PartoLogo";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { Sidebar } from "./components/Sidebar";
import { PERSONA_LIST, PERSONAS } from "./constants/personas";
import {
  Attachment,
  ChatMessage,
  Conversation,
  GroundingSource,
  PersonaId,
  ReasoningMode,
} from "./types/chat";

const STORAGE_KEY = "parto_conversations_v1";
const THEME_KEY = "parto_theme_v1";

function createNewConversation(
  personaId: PersonaId = "general",
  mode: ReasoningMode = "balanced",
  webSearch = true
): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "گفت‌وگوی جدید",
    personaId,
    mode,
    webSearch,
    pinned: false,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createNewConversation()];
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createNewConversation()];
    }
    return parsed;
  } catch {
    return [createNewConversation()];
  }
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations()
  );
  const [activeId, setActiveId] = useState<string>(
    () => loadConversations()[0]?.id || ""
  );
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const personaMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "dark" ? "#0B0F17" : "#F7F7F5");
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      // Fallback: strip attachment base64 payloads if localStorage quota exceeded
      try {
        const lightweight = conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            ...m,
            attachments: m.attachments?.map((a) => ({
              ...a,
              data: "",
              previewUrl: undefined,
            })),
          })),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
      } catch {
        // Ignore if completely full
      }
    }
  }, [conversations]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        personaMenuRef.current &&
        !personaMenuRef.current.contains(e.target as Node)
      ) {
        setPersonaMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeConversation = useMemo(() => {
    return (
      conversations.find((c) => c.id === activeId) ||
      conversations[0] ||
      createNewConversation()
    );
  }, [conversations, activeId]);

  useEffect(() => {
    if (!conversations.some((c) => c.id === activeId) && conversations[0]) {
      setActiveId(conversations[0].id);
    }
  }, [conversations, activeId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAway = distanceFromBottom > 120;
    userScrolledUpRef.current = isAway;
    setShowScrollBottom(isAway);
  };

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollToBottom("auto");
    }
  }, [activeConversation.messages, scrollToBottom]);

  const updateConversation = useCallback(
    (id: string, updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? updater(c) : c))
      );
    },
    []
  );

  const handleNewConversation = () => {
    // If current chat is already empty, just focus it
    if (activeConversation.messages.length === 0) {
      return;
    }
    const fresh = createNewConversation(
      activeConversation.personaId,
      activeConversation.mode,
      activeConversation.webSearch
    );
    setConversations((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
    userScrolledUpRef.current = false;
  };

  const handleDeleteConversation = (id: string) => {
    if (streamingConvId === id) {
      abortControllerRef.current?.abort();
      setStreamingConvId(null);
    }
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        const fresh = createNewConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (activeId === id) {
        setActiveId(next[0].id);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    abortControllerRef.current?.abort();
    setStreamingConvId(null);
    const fresh = createNewConversation();
    setConversations([fresh]);
    setActiveId(fresh.id);
  };

  const handleExportMarkdown = () => {
    if (activeConversation.messages.length === 0) return;
    const lines = [
      `# ${activeConversation.title}`,
      "",
      ...activeConversation.messages.map((m) => {
        const author = m.role === "user" ? "کاربر" : "پرتو";
        return `### ${author}\n\n${m.text}\n`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeConversation.title.replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateAutoTitle = async (convId: string, firstPrompt: string) => {
    try {
      const res = await fetch("/api/chat/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: firstPrompt }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { title?: string };
      if (data.title) {
        updateConversation(convId, (c) => ({
          ...c,
          title:
            c.title === "گفت‌وگوی جدید" ? data.title || c.title : c.title,
        }));
      }
    } catch {
      // Keep fallback title
    }
  };

  const streamReply = async (
    convId: string,
    historyForApi: ChatMessage[],
    personaId: PersonaId,
    mode: ReasoningMode,
    webSearch: boolean,
    isFirstTurn: boolean,
    firstPromptText: string
  ) => {
    const modelMsgId = crypto.randomUUID();
    const placeholder: ChatMessage = {
      id: modelMsgId,
      role: "model",
      text: "",
      createdAt: Date.now(),
    };

    updateConversation(convId, (c) => ({
      ...c,
      messages: [...historyForApi, placeholder],
      updatedAt: Date.now(),
    }));

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreamingConvId(convId);
    userScrolledUpRef.current = false;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          webSearch,
          systemInstruction: PERSONAS[personaId].systemInstruction,
          messages: historyForApi
            .filter((m) => !m.error)
            .map((m) => ({
              role: m.role,
              text: m.text,
              attachments: m.attachments?.map((a) => ({
                mimeType: a.mimeType,
                data: a.data,
                name: a.name,
              })),
            })),
        }),
      });

      if (!response.ok || !response.body) {
        const errData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errData.error || "خطا در دریافت پاسخ از سرور.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";
      let sources: GroundingSource[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr) as {
              type: string;
              text?: string;
              sources?: GroundingSource[];
              message?: string;
            };

            if (event.type === "status" && event.text) {
              updateConversation(convId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === modelMsgId ? { ...m, status: event.text } : m
                ),
              }));
            } else if (event.type === "delta" && event.text) {
              accumulatedText += event.text;
              updateConversation(convId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === modelMsgId
                    ? { ...m, text: accumulatedText, status: undefined }
                    : m
                ),
                updatedAt: Date.now(),
              }));
            } else if (event.type === "sources" && event.sources) {
              sources = event.sources;
              updateConversation(convId, (c) => ({
                ...c,
                messages: c.messages.map((m) =>
                  m.id === modelMsgId ? { ...m, sources } : m
                ),
              }));
            } else if (event.type === "error") {
              throw new Error(
                event.message || "خطای غیرمنتظره در پردازش پیام رخ داد."
              );
            }
          } catch (parseErr) {
            if (
              parseErr instanceof Error &&
              !(parseErr instanceof SyntaxError)
            ) {
              throw parseErr;
            }
          }
        }
      }

      if (accumulatedText.trim().length === 0) {
        throw new Error(
          "پاسخی از سرویس هوش مصنوعی دریافت نشد. لطفاً دوباره امتحان کنید."
        );
      }

      if (isFirstTurn && firstPromptText.trim()) {
        void generateAutoTitle(convId, firstPromptText);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        // User stopped streaming cleanly; remove empty placeholder if nothing was streamed
        updateConversation(convId, (c) => ({
          ...c,
          messages: c.messages.filter(
            (m) => m.id !== modelMsgId || m.text.trim().length > 0
          ),
        }));
      } else {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "خطا در برقراری ارتباط با سرویس هوش مصنوعی.";
        updateConversation(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === modelMsgId
              ? { ...m, text: errorMessage, error: true }
              : m
          ),
        }));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setStreamingConvId(null);
    }
  };

  const handleSend = (text: string, attachments: Attachment[]) => {
    const conv = activeConversation;
    const isFirstTurn = conv.messages.length === 0;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: Date.now(),
    };

    const nextHistory = [...conv.messages, userMsg];
    if (isFirstTurn && text.trim()) {
      updateConversation(conv.id, (c) => ({
        ...c,
        title: text.trim().slice(0, 36) + (text.trim().length > 36 ? "..." : ""),
        messages: nextHistory,
        updatedAt: Date.now(),
      }));
    }

    void streamReply(
      conv.id,
      nextHistory,
      conv.personaId,
      conv.mode,
      conv.webSearch,
      isFirstTurn,
      text
    );
  };

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  const handleRegenerate = () => {
    if (streamingConvId) return;
    const conv = activeConversation;
    const msgs = [...conv.messages];
    while (msgs.length > 0 && msgs[msgs.length - 1].role === "model") {
      msgs.pop();
    }
    if (msgs.length === 0) return;

    const lastUserText = msgs[msgs.length - 1]?.text || "";
    void streamReply(
      conv.id,
      msgs,
      conv.personaId,
      conv.mode,
      conv.webSearch,
      false,
      lastUserText
    );
  };

  const handleEditUserMessage = (messageId: string, newText: string) => {
    if (streamingConvId) return;
    const conv = activeConversation;
    const idx = conv.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    const truncated = conv.messages.slice(0, idx + 1).map((m, i) =>
      i === idx ? { ...m, text: newText } : m
    );

    void streamReply(
      conv.id,
      truncated,
      conv.personaId,
      conv.mode,
      conv.webSearch,
      idx === 0,
      newText
    );
  };

  const isStreamingActive = streamingConvId === activeConversation.id;
  const activePersona = PERSONAS[activeConversation.personaId];
  const lastModelMsgIndex = activeConversation.messages.reduce(
    (acc, m, idx) => (m.role === "model" ? idx : acc),
    -1
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#F7F7F5] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      <Sidebar
        conversations={conversations}
        activeId={activeConversation.id}
        isOpen={sidebarOpen}
        theme={theme}
        onCloseMobile={() => setSidebarOpen(false)}
        onSelectConversation={(id) => {
          setActiveId(id);
          userScrolledUpRef.current = false;
        }}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={(id, title) =>
          updateConversation(id, (c) => ({ ...c, title }))
        }
        onTogglePin={(id) =>
          updateConversation(id, (c) => ({ ...c, pinned: !c.pinned }))
        }
        onClearAll={handleClearAll}
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
      />

      {/* Main Workspace */}
      <main className="flex-1 min-w-0 flex flex-col h-full relative">
        {/* Top bar */}
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-4 shrink-0 bg-[#F7F7F5]/80 dark:bg-[#0B0F17]/80 backdrop-blur-md z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="باز و بسته کردن منو"
              title="تاریخچه گفت‌وگوها"
            >
              <PanelRight className="w-5 h-5" />
            </button>

            {/* Persona Dropdown */}
            <div className="relative" ref={personaMenuRef}>
              <button
                type="button"
                onClick={() => setPersonaMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="truncate max-w-[180px] sm:max-w-xs">
                  {activePersona.name}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {personaMenuOpen && (
                <div className="absolute start-0 mt-2 w-72 rounded-2xl bg-white dark:bg-[#141B29] border border-slate-200 dark:border-slate-800 shadow-xl p-1.5 z-50">
                  {PERSONA_LIST.map((p) => {
                    const selected = p.id === activeConversation.personaId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          updateConversation(activeConversation.id, (c) => ({
                            ...c,
                            personaId: p.id,
                          }));
                          setPersonaMenuOpen(false);
                        }}
                        className={`w-full text-start px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                          selected
                            ? "bg-teal-600/10 text-teal-800 dark:text-teal-300"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                          {p.shortDesc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="header" />

            {activeConversation.messages.length > 0 && (
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="ذخیره متن گفت‌وگو به صورت Markdown"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">خروجی متن</span>
              </button>
            )}

            {!sidebarOpen && (
              <button
                type="button"
                onClick={handleNewConversation}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium bg-teal-700 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="گفت‌وگوی جدید"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">جدید</span>
                <span className="hidden sm:inline">گفت‌وگوی جدید</span>
              </button>
            )}
          </div>
        </header>

        <OfflineIndicator />

        {/* Scrollable Chat Viewport */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 sm:px-6"
        >
          {activeConversation.messages.length === 0 ? (
            /* Welcome Empty State */
            <div className="min-h-full flex flex-col items-center justify-center py-10 max-w-3xl mx-auto">
              <PartoLogo size={64} className="mb-5 shadow-md" />

              <h1
                style={{ textWrap: "balance" }}
                className="text-2xl sm:text-3xl font-bold text-center text-slate-950 dark:text-white tracking-tight"
              >
                چطور می‌توانم کمکتان کنم؟
              </h1>
              <p className="mt-2.5 text-sm sm:text-base text-center text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                {activePersona.shortDesc} — گفت‌وگوی نامحدود، تحلیل تصویر و فایل،
                برنامه‌نویسی و جستجوی زنده وب.
              </p>

              {/* Persona Quick Tabs */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {PERSONA_LIST.map((p) => {
                  const isActive = p.id === activeConversation.personaId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        updateConversation(activeConversation.id, (c) => ({
                          ...c,
                          personaId: p.id,
                        }))
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isActive
                          ? "bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>

              {/* Starter Prompts Grid */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {activePersona.starters.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    onClick={() => handleSend(starter.prompt, [])}
                    className="group text-start p-4 rounded-2xl bg-white dark:bg-[#121824] border border-slate-200/90 dark:border-slate-800 hover:border-teal-600/60 dark:hover:border-teal-500/60 transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                      {starter.title}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {starter.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message Thread */
            <div className="max-w-3xl mx-auto py-8 space-y-8">
              {activeConversation.messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={
                    isStreamingActive && idx === activeConversation.messages.length - 1
                  }
                  isLastModelMessage={idx === lastModelMsgIndex}
                  onRegenerate={handleRegenerate}
                  onEditUserMessage={handleEditUserMessage}
                />
              ))}
            </div>
          )}
        </div>

        {/* Scroll to bottom floating helper */}
        {showScrollBottom && activeConversation.messages.length > 0 && (
          <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-20">
            <button
              type="button"
              onClick={() => {
                userScrolledUpRef.current = false;
                scrollToBottom("smooth");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              aria-label="رفتن به انتهای گفت‌وگو"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>پایین صفحه</span>
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="shrink-0 bg-gradient-to-t from-[#F7F7F5] via-[#F7F7F5] dark:from-[#0B0F17] dark:via-[#0B0F17] to-transparent pt-2">
          <Composer
            isStreaming={isStreamingActive}
            mode={activeConversation.mode}
            webSearch={activeConversation.webSearch}
            onModeChange={(mode) =>
              updateConversation(activeConversation.id, (c) => ({
                ...c,
                mode,
              }))
            }
            onWebSearchToggle={() =>
              updateConversation(activeConversation.id, (c) => ({
                ...c,
                webSearch: !c.webSearch,
              }))
            }
            onSend={handleSend}
            onStop={handleStopStreaming}
          />
        </div>
      </main>
    </div>
  );
}
