import { useState } from "react";
import {
  Check,
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  Globe,
  RotateCcw,
} from "lucide-react";
import { ChatMessage } from "../types/chat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { PartoLogo } from "./PartoLogo";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  isLastModelMessage?: boolean;
  onRegenerate?: () => void;
  onEditUserMessage?: (messageId: string, newText: string) => void;
}

export function MessageBubble({
  message,
  isStreaming = false,
  isLastModelMessage = false,
  onRegenerate,
  onEditUserMessage,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSaveEdit = () => {
    const trimmed = draftText.trim();
    if (trimmed && onEditUserMessage) {
      onEditUserMessage(message.id, trimmed);
    }
    setIsEditing(false);
  };

  if (message.role === "user") {
    return (
      <div className="group flex flex-col items-end gap-2">
        {/* Attachments preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 max-w-[85%] sm:max-w-[75%]">
            {message.attachments.map((att) =>
              att.mimeType.startsWith("image/") && att.previewUrl ? (
                <img
                  key={att.id}
                  src={att.previewUrl}
                  alt={att.name}
                  referrerPolicy="no-referrer"
                  className="max-h-56 max-w-xs rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                />
              ) : (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 border border-slate-300/70 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200"
                >
                  <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="truncate max-w-[180px]">{att.name}</span>
                </div>
              )
            )}
          </div>
        )}

        {isEditing ? (
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-teal-600/60 p-3 space-y-2.5">
            <textarea
              dir="auto"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={3}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftText(message.text);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-teal-700 text-white hover:bg-teal-600 cursor-pointer"
              >
                ذخیره و ارسال
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 max-w-[88%] sm:max-w-[78%]">
            {onEditUserMessage && (
              <button
                type="button"
                onClick={() => {
                  setDraftText(message.text);
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 mt-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-opacity cursor-pointer"
                title="ویرایش پیام"
                aria-label="ویرایش پیام"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            {message.text && (
              <div
                dir="auto"
                className="px-4 py-3 rounded-2xl bg-[#E8ECEA] dark:bg-[#1A2233] text-slate-900 dark:text-slate-100 text-[15px] leading-[1.75] whitespace-pre-wrap break-words"
              >
                {message.text}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3.5 sm:gap-4">
      <div className="mt-1 shrink-0">
        <PartoLogo size={30} />
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        {message.error ? (
          <div className="px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm leading-relaxed">
            {message.text}
          </div>
        ) : message.text ? (
          <MarkdownRenderer content={message.text} />
        ) : isStreaming ? (
          <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
            {message.status && message.status.includes("وب") || message.status?.includes("اینترنت") ? (
              <Globe className="w-4 h-4 text-teal-600 dark:text-teal-400 animate-spin" />
            ) : (
              <span className="inline-block w-2 h-4 rounded-sm bg-teal-600 dark:bg-teal-400 animate-pulse" />
            )}
            <span>{message.status || "در حال نوشتن پاسخ..."}</span>
          </div>
        ) : null}

        {/* Grounding Web Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>منابع جستجوی وب</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {message.sources.map((src, idx) => (
                <a
                  key={src.uri + idx}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-teal-700 dark:text-teal-400 hover:underline max-w-[260px] truncate"
                >
                  <span className="truncate">{src.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Action bar below assistant message */}
        {!isStreaming && message.text && (
          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="کپی پاسخ"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span className="text-teal-700 dark:text-teal-400">کپی شد</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی</span>
                </>
              )}
            </button>

            {isLastModelMessage && onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="تولید مجدد پاسخ"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تولید مجدد</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
