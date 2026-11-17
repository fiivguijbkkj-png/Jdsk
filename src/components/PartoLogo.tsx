import { useState } from "react";

interface PartoLogoProps {
  size?: number;
  className?: string;
}

export function PartoLogo({ size = 32, className = "" }: PartoLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-xl bg-teal-700 text-white shrink-0 ${className}`}
        aria-label="پرتو"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-3/5 h-3/5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.5 8.5 22 12 15.5 15.5 12 22 8.5 15.5 2 12 8.5 8.5 12 2" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src="/src/assets/images/parto_emblem_1794858880787.jpg"
      alt="نشان پرتو"
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-800 ${className}`}
    />
  );
}
