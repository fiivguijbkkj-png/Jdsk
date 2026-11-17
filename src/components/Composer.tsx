import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  FileText,
  Globe,
  Mic,
  MicOff,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { Attachment, ReasoningMode } from "../types/chat";
import { REASONING_MODES } from "../constants/personas";

interface ComposerProps {
  isStreaming: boolean;
  mode: ReasoningMode;
  webSearch: boolean;
  onModeChange: (mode: ReasoningMode) => void;
  onWebSearchToggle: () => void;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function Composer({
  isStreaming,
  mode,
  webSearch,
  onModeChange,
  onWebSearchToggle,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const supportsSpeech =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const readFileAsAttachment = (file: File): Promise<Attachment> => {
    return new Promise((resolve, reject) => {
      if (file.size > 10 * 1024 * 1024) {
        reject(new Error(`حجم فایل ${file.name} نباید بیشتر از ۱۰ مگابایت باشد.`));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const commaIndex = result.indexOf(",");
        const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
        const mimeType = file.type || "text/plain";
        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType,
          data: base64,
          previewUrl: mimeType.startsWith("image/") ? result : undefined,
          size: file.size,
        });
      };
      reader.onerror = () => reject(new Error("خواندن فایل با خطا مواجه شد."));
      reader.readAsDataURL(file);
    });
  };

  const handleFilesAdded = async (files: FileList | File[]) => {
    setFileError(null);
    const list = Array.from(files).slice(0, 4 - attachments.length);
    if (list.length === 0) return;

    try {
      const processed = await Promise.all(list.map(readFileAsAttachment));
      setAttachments((prev) => [...prev, ...processed].slice(0, 4));
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "خطا در افزودن فایل پیوست."
      );
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const f = items[i].getAsFile();
        if (f) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      void handleFilesAdded(pastedFiles);
    }
  };

  const toggleVoice = () => {
    if (!supportsSpeech) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .webkitSpeechRecognition;

    if (!SpeechCtor) return;

    const recognition = new SpeechCtor();
    recognition.lang = "fa-IR";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript;
      if (transcript) {
        setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const submit = () => {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, attachments);
    setText("");
    setAttachments([]);
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 pt-2">
      {fileError && (
        <div className="mb-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
          <span>{fileError}</span>
          <button
            type="button"
            onClick={() => setFileError(null)}
            className="p-0.5 hover:opacity-75 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="rounded-2xl bg-white dark:bg-[#141B29] border border-slate-200 dark:border-slate-800 focus-within:border-teal-600/70 dark:focus-within:border-teal-500/70 transition-colors shadow-sm">
        {/* Attachments strip */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-1.5 pe-2.5"
              >
                {att.mimeType.startsWith("image/") && att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-teal-600/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                )}
                <span className="text-xs text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                  {att.name}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((prev) =>
                      prev.filter((item) => item.id !== att.id)
                    )
                  }
                  className="p-1 rounded-full text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="حذف پیوست"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          dir="auto"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="هر سوالی دارید بپرسید یا تصویری پیوست کنید..."
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none max-h-[180px]"
        />

        {/* Bottom controls bar */}
        <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 overflow-x-auto">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  void handleFilesAdded(e.target.files);
                }
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="افزودن تصویر یا فایل"
              aria-label="افزودن تصویر یا فایل"
            >
              <Paperclip className="w-4 h-4" />
              <span className="hidden sm:inline">پیوست</span>
            </button>

            <button
              type="button"
              onClick={onWebSearchToggle}
              className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                webSearch
                  ? "bg-teal-600/15 text-teal-700 dark:text-teal-300 border border-teal-600/30"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent"
              }`}
              title={
                webSearch
                  ? "اتصال زنده به اینترنت فعال است (جستجو و خواندن صفحات وب)"
                  : "اتصال به اینترنت خاموش است"
              }
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>اینترنت</span>
            </button>

            {/* Reasoning depth segmented control */}
            <div
              className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shrink-0"
              role="group"
              aria-label="سطح هوشمندی"
            >
              {REASONING_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onModeChange(m.id)}
                  title={m.description}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    mode === m.id
                      ? "bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {supportsSpeech && (
              <button
                type="button"
                onClick={toggleVoice}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  isListening
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                title={isListening ? "توقف ضبط صدا" : "تایپ صوتی"}
                aria-label={isListening ? "توقف ضبط صدا" : "تایپ صوتی"}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            )}

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                title="توقف تولید پاسخ"
                aria-label="توقف تولید پاسخ"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!text.trim() && attachments.length === 0}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-teal-700 hover:bg-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="ارسال پیام"
                aria-label="ارسال پیام"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
        گفت‌وگوها به‌صورت خودکار در مرورگر شما ذخیره می‌شوند · پاسخ‌های هوش مصنوعی را در موارد حساس راستی‌آزمایی کنید
      </p>
    </div>
  );
}
