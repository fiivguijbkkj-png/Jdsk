import { useState } from "react";
import { Check, Copy, ExternalLink, Smartphone, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { PartoLogo } from "./PartoLogo";

interface PWAInstallButtonProps {
  variant?: "header" | "sidebar";
}

export function PWAInstallButton({
  variant = "header",
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  const currentUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <>
      {variant === "header" ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-200/80 hover:bg-slate-300/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title="نصب اپلیکیشن پرتو روی گوشی"
        >
          <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="sm:hidden">نصب</span>
          <span className="hidden sm:inline">نصب روی گوشی</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-teal-600/10 hover:bg-teal-600/20 text-teal-800 dark:text-teal-300 border border-teal-600/25 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>نصب اپلیکیشن روی گوشی</span>
        </button>
      )}

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141B29] border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <PartoLogo size={40} />
                <div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">
                    نصب پرتو روی گوشی
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    اجرای تمام‌صفحه با آیکون مستقل در صفحه اصلی گوشی
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="بستن راهنما"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInIframe && (
              <div className="p-3.5 rounded-xl bg-teal-600/10 border border-teal-600/25 space-y-2.5">
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                  در حال مشاهده داخل پیش‌نمایش هستید. برای نمایش دکمه نصب مستقیم
                  اندروید (WebAPK)، برنامه را در تب مستقل مرورگر باز کنید:
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>باز کردن مستقیم در مرورگر</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>کپی لینک</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {isIOS ? (
              <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <div className="font-semibold text-slate-900 dark:text-white">
                  راهنمای نصب در آیفون و آیپد (Safari):
                </div>
                <ol className="list-decimal ps-5 space-y-1.5">
                  <li>
                    در نوار پایین مرورگر Safari دکمه <strong>Share</strong> (مربع
                    با فلش رو به بالا) را بزنید.
                  </li>
                  <li>
                    صفحه را به پایین بکشید و گزینه{" "}
                    <strong>Add to Home Screen</strong> را انتخاب کنید.
                  </li>
                  <li>
                    روی <strong>Add</strong> بزنید تا آیکون «پرتو» به صفحه اصلی
                    اضافه شود.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <div className="font-semibold text-slate-900 dark:text-white">
                  راهنمای نصب در گوشی اندروید (Chrome):
                </div>
                <ol className="list-decimal ps-5 space-y-1.5">
                  <li>
                    برنامه را در مرورگر <strong>Chrome</strong> به‌صورت مستقیم باز
                    کنید.
                  </li>
                  <li>
                    منوی سه‌نقطه بالای صفحه را بزنید و گزینه{" "}
                    <strong>نصب برنامه (Install app)</strong> یا{" "}
                    <strong>افزودن به صفحه اصلی (Add to Home screen)</strong> را
                    انتخاب کنید.
                  </li>
                  <li>
                    اندروید به‌صورت خودکار بسته نصب اپلیکیشن (WebAPK) را ساخته و
                    آیکون <strong>پرتو</strong> را در لیست برنامه‌های گوشی قرار
                    می‌دهد.
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
}
