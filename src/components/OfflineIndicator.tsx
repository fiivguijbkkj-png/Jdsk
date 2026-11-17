import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="mx-4 mt-2 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-center gap-2 shrink-0"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        حالت آفلاین فعال است — تاریخچه گفت‌وگوها در دسترس است؛ برای ارسال پیام جدید اینترنت را وصل کنید.
      </span>
    </div>
  );
}
