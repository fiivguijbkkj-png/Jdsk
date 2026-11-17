import "dotenv/config";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function createAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("کلید API در تنظیمات سرور (GEMINI_API_KEY) یافت نشد.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

interface IncomingAttachment {
  mimeType: string;
  data: string;
  name?: string;
}

interface IncomingMessage {
  role: "user" | "model";
  text: string;
  attachments?: IncomingAttachment[];
}

type ReasoningMode = "fast" | "balanced" | "deep";

interface StreamRequestBody {
  messages: IncomingMessage[];
  systemInstruction?: string;
  mode?: ReasoningMode;
  webSearch?: boolean;
}

interface GroundingSource {
  uri: string;
  title: string;
}

function getErrInfo(err: unknown): {
  status?: number;
  lower: string;
  raw: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  return { status, lower: raw.toLowerCase(), raw };
}

function formatErrorMessage(err: unknown): { status: number; message: string } {
  const { status, lower, raw } = getErrInfo(err);

  if (lower.includes("gemini_api_key")) {
    return {
      status: 500,
      message:
        "کلید ارتباط با هوش مصنوعی پیکربندی نشده است. لطفاً بخش Settings > Secrets را بررسی کنید.",
    };
  }
  if (
    status === 400 ||
    lower.includes("api_key_invalid") ||
    lower.includes("400")
  ) {
    return {
      status: 400,
      message:
        "درخواست یا کلید API معتبر نیست. لطفاً ورودی یا کلید خود را در Settings > Secrets بررسی کنید.",
    };
  }
  if (
    status === 403 ||
    lower.includes("permission_denied") ||
    lower.includes("403")
  ) {
    return {
      status: 403,
      message:
        "دسترسی به مدل تایید نشد. لطفاً کلید API را در Settings > Secrets بررسی کنید.",
    };
  }
  if (
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("429")
  ) {
    return {
      status: 429,
      message:
        "محدودیت موقت نرخ ارسال درخواست رخ داد. لطفاً چند لحظه صبر کنید و دوباره امتحان کنید.",
    };
  }
  if (
    status === 503 ||
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand")
  ) {
    return {
      status: 503,
      message:
        "سرورهای مدل در حال حاضر بسیار شلوغ هستند. لطفاً چند ثانیه بعد دوباره امتحان کنید.",
    };
  }
  if (
    status === 404 ||
    lower.includes("not_found") ||
    lower.includes("404")
  ) {
    return {
      status: 404,
      message: "مدل انتخاب‌شده در دسترس نیست. لطفاً دوباره تلاش کنید.",
    };
  }

  return {
    status: 500,
    message: `خطا در ارتباط با سرویس هوش مصنوعی${raw ? ` (${raw.slice(0, 120)})` : "."}`,
  };
}

function isTransientUnavailable(err: unknown): boolean {
  const { status, lower } = getErrInfo(err);
  return (
    status === 503 ||
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("overloaded") ||
    lower.includes("stream_open_timeout")
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("STREAM_OPEN_TIMEOUT")),
      ms
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// --- Live Internet Search & Webpage Reader Tools ---

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "\u200c")
    .replace(/&#(\d+);/g, (_m, code) =>
      String.fromCharCode(Number(code) || 32)
    );
}

function cleanHtmlText(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBingRedirectUrl(rawUrl: string): string {
  try {
    const decodedHref = decodeHtmlEntities(rawUrl);
    if (!decodedHref.includes("bing.com/ck/a")) {
      return decodedHref;
    }
    const parsed = new URL(decodedHref);
    const u = parsed.searchParams.get("u");
    if (u && u.startsWith("a1")) {
      const target = Buffer.from(u.slice(2), "base64url").toString("utf-8");
      if (target.startsWith("http://") || target.startsWith("https://")) {
        return target;
      }
    }
    return decodedHref;
  } catch {
    return rawUrl;
  }
}

function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

async function searchBing(query: string): Promise<{
  hits: SearchHit[];
  instantAnswer?: string;
}> {
  const isPersian = /[\u0600-\u06FF]/.test(query);
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=8`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": isPersian
        ? "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7"
        : "en-US,en;q=0.9,fa;q=0.8",
    },
    signal: AbortSignal.timeout(6500),
  });

  if (!resp.ok) {
    throw new Error(`Bing HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const hits: SearchHit[] = [];

  // Extract instant answer box if present
  let instantAnswer: string | undefined;
  const focusMatch =
    html.match(/<div class="b_focusTextLarge"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div class="b_focusTextMedium"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<div class="rwrl rwrl_pri[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (focusMatch?.[1]) {
    const cleaned = cleanHtmlText(focusMatch[1]);
    if (cleaned.length > 0) instantAnswer = cleaned;
  }

  const blocks = html.split(/<li class="b_algo"/).slice(1, 8);
  for (const block of blocks) {
    const titleMatch = block.match(
      /<h2[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/is
    );
    if (!titleMatch) continue;
    const realUrl = decodeBingRedirectUrl(titleMatch[1]);
    const title = cleanHtmlText(titleMatch[2]);
    const snipMatch =
      block.match(/<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/is) ||
      block.match(/<p[^>]*>([\s\S]*?)<\/p>/is);
    const snippet = cleanHtmlText(snipMatch?.[1] || "");

    if (realUrl && title) {
      hits.push({ title, url: realUrl, snippet });
    }
  }

  return { hits, instantAnswer };
}

async function searchWikipediaFallback(query: string): Promise<SearchHit[]> {
  const isPersian = /[\u0600-\u06FF]/.test(query);
  const lang = isPersian ? "fa" : "en";
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=5&format=json`;
  const resp = await fetch(apiUrl, {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) return [];
  const data = (await resp.json()) as {
    query?: { search?: { title: string; snippet: string }[] };
  };
  return (data.query?.search || []).map((item) => ({
    title: item.title,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(
      item.title.replace(/\s+/g, "_")
    )}`,
    snippet: cleanHtmlText(item.snippet),
  }));
}

async function searchGoogleNewsFallback(query: string): Promise<SearchHit[]> {
  const apiUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=en-US&gl=US&ceid=US:en`;
  const resp = await fetch(apiUrl, {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) return [];
  const xml = await resp.text();
  const items = xml.split("<item>").slice(1, 6);
  const hits: SearchHit[] = [];
  for (const item of items) {
    const title = cleanHtmlText(
      item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || ""
    );
    const link = cleanHtmlText(
      item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || ""
    );
    const pubDate = cleanHtmlText(
      item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || ""
    );
    if (title && link) {
      hits.push({ title, url: link, snippet: pubDate });
    }
  }
  return hits;
}

async function performLiveWebSearch(query: string): Promise<{
  results: SearchHit[];
  instantAnswer?: string;
}> {
  let hits: SearchHit[] = [];
  let instantAnswer: string | undefined;

  try {
    const bing = await searchBing(query);
    hits = bing.hits;
    instantAnswer = bing.instantAnswer;
  } catch {
    // Fall back below
  }

  if (hits.length === 0) {
    const newsHits = await searchGoogleNewsFallback(query).catch(() => []);
    if (newsHits.length > 0) {
      hits = newsHits;
    } else {
      hits = await searchWikipediaFallback(query).catch(() => []);
    }
  }

  return { results: hits.slice(0, 6), instantAnswer };
}

async function fetchLiveCryptoPrices(coinsInput?: string): Promise<unknown> {
  const defaultIds = "bitcoin,ethereum,tether,solana,the-open-network,binancecoin,ripple,dogecoin";
  const ids = coinsInput?.trim()
    ? coinsInput
        .toLowerCase()
        .replace(/\bbtc\b/g, "bitcoin")
        .replace(/\beth\b/g, "ethereum")
        .replace(/\busdt\b/g, "tether")
        .replace(/\bton\b/g, "the-open-network")
        .replace(/\bsol\b/g, "solana")
        .replace(/\s+/g, "")
    : defaultIds;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids
  )}&vs_currencies=usd&include_24hr_change=true`;

  const resp = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    throw new Error(`CoinGecko HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return {
    sourceUrl: "https://www.coingecko.com/",
    sourceTitle: "CoinGecko Live Market Data",
    prices: data,
  };
}

const WEATHER_CODE_FA: Record<number, string> = {
  0: "آسمان صاف",
  1: "عمدتاً صاف",
  2: "نیمه‌ابری",
  3: "ابری",
  45: "مه‌آلود",
  48: "مه یخ‌زده",
  51: "نم‌نم باران خفیف",
  53: "نم‌نم باران",
  55: "باران ریز شدید",
  61: "باران خفیف",
  63: "باران متوسط",
  65: "باران شدید",
  71: "برف خفیف",
  73: "برف متوسط",
  75: "برف شدید",
  80: "رگبار خفیف",
  81: "رگبار متوسط",
  82: "رگبار شدید",
  95: "رعدوبرق",
};

async function fetchLiveWeather(city: string): Promise<unknown> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city
  )}&count=1&language=en`;
  const geoResp = await fetch(geoUrl, {
    signal: AbortSignal.timeout(5000),
  });
  if (!geoResp.ok) throw new Error(`Geocoding HTTP ${geoResp.status}`);
  const geoData = (await geoResp.json()) as {
    results?: {
      name: string;
      country?: string;
      latitude: number;
      longitude: number;
      timezone?: string;
    }[];
  };
  const loc = geoData.results?.[0];
  if (!loc) {
    throw new Error(`شهری با نام «${city}» پیدا نشد.`);
  }

  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
  const wxResp = await fetch(wxUrl, {
    signal: AbortSignal.timeout(5000),
  });
  if (!wxResp.ok) throw new Error(`Weather HTTP ${wxResp.status}`);
  const wx = (await wxResp.json()) as {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
      weather_code?: number;
    };
    daily?: {
      time?: string[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };

  const code = wx.current?.weather_code ?? 0;
  return {
    sourceUrl: `https://open-meteo.com/`,
    sourceTitle: `Open-Meteo Forecast (${loc.name})`,
    location: `${loc.name}${loc.country ? `, ${loc.country}` : ""}`,
    current: {
      temperatureC: wx.current?.temperature_2m,
      feelsLikeC: wx.current?.apparent_temperature,
      humidityPercent: wx.current?.relative_humidity_2m,
      windSpeedKmh: wx.current?.wind_speed_10m,
      condition: WEATHER_CODE_FA[code] || `کد آب‌وهوا ${code}`,
    },
    forecast3Days: (wx.daily?.time || []).map((date, idx) => ({
      date,
      minC: wx.daily?.temperature_2m_min?.[idx],
      maxC: wx.daily?.temperature_2m_max?.[idx],
    })),
  };
}

async function fetchWebpageContent(rawUrl: string): Promise<{
  title: string;
  url: string;
  content: string;
}> {
  if (!isSafePublicUrl(rawUrl)) {
    throw new Error("آدرس وب معتبر یا قابل دسترس نیست.");
  }

  const resp = await fetch(rawUrl, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(7000),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }

  const contentType = resp.headers.get("content-type") || "";
  const rawBody = await resp.text();

  if (
    contentType.includes("application/json") ||
    contentType.includes("text/plain")
  ) {
    return {
      title: rawUrl,
      url: resp.url || rawUrl,
      content: rawBody.slice(0, 8000),
    };
  }

  const titleMatch = rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanHtmlText(titleMatch?.[1] || rawUrl);

  const stripped = rawBody
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const text = cleanHtmlText(stripped).slice(0, 8500);

  return {
    title,
    url: resp.url || rawUrl,
    content: text || "متنی از این صفحه استخراج نشد.",
  };
}

const searchWebDeclaration: FunctionDeclaration = {
  name: "search_web",
  description:
    "جستجوی زنده در اینترنت برای یافتن اطلاعات به‌روز، اخبار، قیمت‌های بازار ایران (مثل طلا، سکه، دلار)، رویدادها، مستندات و لینک‌های معتبر.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          "عبارت جستجوی دقیق و کامل (هرگز تک‌کلمه‌ای مبهم نفرستید).",
      },
    },
    required: ["query"],
  },
};

const readWebpageDeclaration: FunctionDeclaration = {
  name: "read_webpage",
  description:
    "باز کردن و خواندن متن کامل یک صفحه وب از طریق آدرس URL برای استخراج جزئیات دقیق، قیمت‌ها، خبر کامل یا خلاصه‌سازی لینک.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: "آدرس کامل صفحه وب که با https:// یا http:// شروع می‌شود.",
      },
    },
    required: ["url"],
  },
};

const getCryptoPriceDeclaration: FunctionDeclaration = {
  name: "get_crypto_price",
  description:
    "دریافت قیمت لحظه‌ای و واقعی ارزهای دیجیتال (بیت‌کوین، اتریوم، تتر، سولانا، تون‌کوین و...) به دلار همراه با درصد تغییر ۲۴ ساعته.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      coins: {
        type: Type.STRING,
        description:
          "نام انگلیسی ارزها با کاما، مثلاً bitcoin,ethereum,tether یا خالی برای ارزهای اصلی.",
      },
    },
  },
};

const getWeatherDeclaration: FunctionDeclaration = {
  name: "get_weather",
  description:
    "دریافت وضعیت لحظه‌ای آب‌وهوا، دما، رطوبت، باد و پیش‌بینی ۳ روز آینده برای هر شهر دنیا.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      city: {
        type: Type.STRING,
        description: "نام شهر به انگلیسی، مثلاً Tehran یا Mashhad یا London.",
      },
    },
    required: ["city"],
  },
};

function buildContents(messages: IncomingMessage[]): Content[] {
  return messages
    .filter(
      (m) =>
        m.text.trim().length > 0 || (m.attachments && m.attachments.length > 0)
    )
    .map((m) => {
      const parts: Part[] = [];
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          if (att.mimeType.startsWith("image/")) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.data,
              },
            });
          } else {
            try {
              const decoded = Buffer.from(att.data, "base64").toString("utf-8");
              parts.push({
                text: `فایل پیوست (${att.name || "document"}):\n\`\`\`\n${decoded.slice(0, 30000)}\n\`\`\``,
              });
            } catch {
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: att.data,
                },
              });
            }
          }
        }
      }
      if (m.text.trim().length > 0) {
        parts.push({ text: m.text });
      }
      return {
        role: m.role,
        parts,
      };
    });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/chat/stream", async (req, res) => {
    const body = req.body as StreamRequestBody;
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: "پیامی برای پردازش ارسال نشده است." });
      return;
    }

    let aborted = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    res.on("close", () => {
      if (!res.writableEnded) {
        aborted = true;
      }
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(": connected\n\n");

    heartbeat = setInterval(() => {
      if (!aborted && !res.writableEnded) {
        res.write(": ping\n\n");
      }
    }, 4000);

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!aborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const ai = createAiClient();
      const mode: ReasoningMode = body.mode || "balanced";
      const baseContents = buildContents(body.messages);
      const enableInternet = Boolean(body.webSearch);

      const now = new Date();
      const tehranDateFa = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Tehran",
      }).format(now);
      const utcDate = now.toISOString();

      const basePersonaInstruction =
        body.systemInstruction ||
        "شما پرتو هستید؛ یک دستیار هوش مصنوعی دقیق، خوش‌برخورد، خلاق و حرفه‌ای. به زبان کاربر (معمولاً فارسی روان و استاندارد) پاسخ دهید، از ساختاردهی مارک‌داون خوانا استفاده کنید و کدها را با توضیح شفاف بنویسید.";

      const internetInstruction = enableInternet
        ? `\n\nزمان فعلی: ${tehranDateFa} (UTC: ${utcDate}).\nشما به اینترنت زنده دسترسی دارید و ۴ ابزار واقعی دارید: search_web، read_webpage، get_crypto_price و get_weather.\n- برای قیمت لحظه‌ای ارزهای دیجیتال (بیت‌کوین، اتریوم، تتر و...) حتماً از get_crypto_price استفاده کنید.\n- برای آب‌وهوای هر شهر حتماً از get_weather استفاده کنید.\n- برای اخبار، قیمت طلا/دلار ایران، آمار به‌روز یا رویدادها حتماً از search_web استفاده کنید و در صورت نیاز برای خواندن جزئیات دقیق صفحه، از read_webpage کمک بگیرید.\n- اگر کاربر آدرس اینترنتی (URL) داد، با read_webpage آن را بخوانید.\n- اگر سوال نیازی به اینترنت ندارد (مثل سلام و احوال‌پرسی، نوشتن کد، داستان، یا مفاهیم پایه علمی)، مستقیماً پاسخ دهید.\n- بسیار مهم: مطلقاً از حافظه قدیمی خود عدد، قیمت یا وضعیت هوا نسازید؛ فقط داده‌های واقعی دریافت‌شده از ابزارها را گزارش کنید.`
        : `\n\nزمان فعلی: ${tehranDateFa}.`;

      const systemInstruction = basePersonaInstruction + internetInstruction;

      const primaryModel =
        mode === "fast" ? "gemini-3.1-flash-lite" : "gemini-4-hydrogen";

      const toolDeclarations = [
        searchWebDeclaration,
        readWebpageDeclaration,
        getCryptoPriceDeclaration,
        getWeatherDeclaration,
      ];

      const sourceMap = new Map<string, GroundingSource>();
      let workingContents: Content[] = [...baseContents];
      let usedTools = false;
      let directAnswerFromToolRouter: string | null = null;

      // Step 1: Tool-calling phase when internet access is enabled
      if (enableInternet) {
        const routerModel = "gemini-3.1-flash-lite";

        for (let round = 0; round < 3; round++) {
          if (aborted) break;

          const routerResp = await ai.models.generateContent({
            model: routerModel,
            contents: workingContents,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: toolDeclarations }],
            },
          });

          const calls = routerResp.functionCalls;
          const candidateContent = routerResp.candidates?.[0]?.content;

          if (!calls || calls.length === 0) {
            if (!usedTools && mode === "fast" && routerResp.text) {
              directAnswerFromToolRouter = routerResp.text;
            }
            break;
          }

          usedTools = true;
          if (candidateContent) {
            workingContents = [...workingContents, candidateContent];
          }

          const hasReadCall = calls.some((c) => c.name === "read_webpage");
          const hasCryptoCall = calls.some(
            (c) => c.name === "get_crypto_price"
          );
          const hasWeatherCall = calls.some((c) => c.name === "get_weather");
          if (hasCryptoCall) {
            sendEvent({
              type: "status",
              text: "در حال دریافت قیمت لحظه‌ای از اینترنت...",
            });
          } else if (hasWeatherCall) {
            sendEvent({
              type: "status",
              text: "در حال دریافت وضعیت آب‌وهوا از اینترنت...",
            });
          } else if (hasReadCall) {
            sendEvent({ type: "status", text: "در حال خواندن صفحه وب..." });
          } else {
            sendEvent({ type: "status", text: "در حال جستجو در اینترنت..." });
          }

          const toolResponseParts: Part[] = await Promise.all(
            calls.map(async (call) => {
              const args = (call.args || {}) as Record<string, unknown>;
              if (call.name === "get_crypto_price") {
                try {
                  const data = (await fetchLiveCryptoPrices(
                    typeof args.coins === "string" ? args.coins : undefined
                  )) as { sourceUrl: string; sourceTitle: string };
                  sourceMap.set(data.sourceUrl, {
                    uri: data.sourceUrl,
                    title: data.sourceTitle,
                  });
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: { data },
                    },
                  };
                } catch (err) {
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: {
                        error:
                          err instanceof Error
                            ? err.message
                            : "خطا در دریافت قیمت ارز دیجیتال",
                      },
                    },
                  };
                }
              }

              if (call.name === "get_weather") {
                const city = String(args.city || "Tehran").trim();
                try {
                  const data = (await fetchLiveWeather(city)) as {
                    sourceUrl: string;
                    sourceTitle: string;
                  };
                  sourceMap.set(data.sourceUrl, {
                    uri: data.sourceUrl,
                    title: data.sourceTitle,
                  });
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: { data },
                    },
                  };
                } catch (err) {
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: {
                        error:
                          err instanceof Error
                            ? err.message
                            : "خطا در دریافت وضعیت آب‌وهوا",
                      },
                    },
                  };
                }
              }

              if (call.name === "search_web") {
                const query = String(args.query || "").trim();
                try {
                  const result = await performLiveWebSearch(query);
                  for (const hit of result.results) {
                    if (hit.url) {
                      sourceMap.set(hit.url, {
                        uri: hit.url,
                        title: hit.title || hit.url,
                      });
                    }
                  }
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: {
                        query,
                        instantAnswer: result.instantAnswer || null,
                        results: result.results,
                      },
                    },
                  };
                } catch (err) {
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: {
                        error:
                          err instanceof Error
                            ? err.message
                            : "خطا در جستجوی وب",
                      },
                    },
                  };
                }
              }

              if (call.name === "read_webpage") {
                const url = String(args.url || "").trim();
                try {
                  const page = await fetchWebpageContent(url);
                  sourceMap.set(page.url, {
                    uri: page.url,
                    title: page.title || page.url,
                  });
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: {
                        title: page.title,
                        url: page.url,
                        content: page.content,
                      },
                    },
                  };
                } catch (err) {
                  return {
                    functionResponse: {
                      id: call.id,
                      name: call.name,
                      response: {
                        error:
                          err instanceof Error
                            ? err.message
                            : "خطا در خواندن صفحه",
                      },
                    },
                  };
                }
              }

              return {
                functionResponse: {
                  id: call.id,
                  name: call.name || "unknown",
                  response: { error: "ابزار ناشناخته" },
                },
              };
            })
          );

          workingContents = [
            ...workingContents,
            { role: "user", parts: toolResponseParts },
          ];
        }
      }

      if (aborted) {
        clearInterval(heartbeat);
        return;
      }

      if (directAnswerFromToolRouter) {
        clearInterval(heartbeat);
        sendEvent({ type: "delta", text: directAnswerFromToolRouter });
        sendEvent({ type: "done" });
        res.end();
        return;
      }

      // Step 2: Stream the final response using primary model (with fast timeout fallback)
      if (usedTools) {
        sendEvent({ type: "status", text: "در حال جمع‌بندی پاسخ..." });
      }

      const buildFinalConfig = (modelName: string) => {
        const cfg: Record<string, unknown> = { systemInstruction };
        if (usedTools) {
          cfg.tools = [{ functionDeclarations: toolDeclarations }];
        }
        if (modelName === "gemini-4-hydrogen") {
          cfg.thinkingConfig = {
            thinkingLevel:
              mode === "deep" ? ThinkingLevel.XHIGH : ThinkingLevel.LOW,
          };
        }
        return cfg;
      };

      const openFirstChunk = async (modelName: string, timeoutMs?: number) => {
        const streamPromise = ai.models.generateContentStream({
          model: modelName,
          contents: workingContents,
          config: buildFinalConfig(modelName),
        });
        const stream = timeoutMs
          ? await withTimeout(streamPromise, timeoutMs)
          : await streamPromise;
        const iterator = stream[Symbol.asyncIterator]();
        const first = timeoutMs
          ? await withTimeout(iterator.next(), timeoutMs)
          : await iterator.next();
        return { iterator, first };
      };

      const openFinalStream = async () => {
        const primaryTimeoutMs = mode === "deep" ? 12000 : 5000;
        if (primaryModel === "gemini-4-hydrogen") {
          try {
            return await openFirstChunk(primaryModel, primaryTimeoutMs);
          } catch (err) {
            if (aborted) throw err;
            const { status, lower } = getErrInfo(err);
            const isRateLimit =
              status === 429 ||
              lower.includes("429") ||
              lower.includes("resource_exhausted");
            if (!isTransientUnavailable(err) && !isRateLimit) {
              throw err;
            }
            if (isRateLimit) {
              await new Promise((r) => setTimeout(r, 1200));
              if (aborted) throw err;
            }
          }
        }
        try {
          return await openFirstChunk("gemini-3.1-flash-lite");
        } catch (fallbackErr) {
          const { status, lower } = getErrInfo(fallbackErr);
          const isRateLimit =
            status === 429 ||
            lower.includes("429") ||
            lower.includes("resource_exhausted");
          if (!aborted && isRateLimit) {
            await new Promise((r) => setTimeout(r, 1500));
            return await openFirstChunk("gemini-3.1-flash-lite");
          }
          throw fallbackErr;
        }
      };

      const { iterator, first } = await openFinalStream();

      const processChunk = (c: GenerateContentResponse) => {
        const deltaText = c.text;
        if (deltaText) {
          sendEvent({ type: "delta", text: deltaText });
        }
      };

      if (!first.done && first.value) {
        processChunk(first.value as GenerateContentResponse);
      }

      while (!aborted) {
        const next = await iterator.next();
        if (next.done) break;
        if (next.value) {
          processChunk(next.value as GenerateContentResponse);
        }
      }

      clearInterval(heartbeat);

      if (!aborted) {
        const sources = Array.from(sourceMap.values());
        if (sources.length > 0) {
          sendEvent({ type: "sources", sources });
        }
        sendEvent({ type: "done" });
        res.end();
      }
    } catch (err) {
      clearInterval(heartbeat);
      console.error("Stream error:", err);
      const { message } = formatErrorMessage(err);
      sendEvent({ type: "error", message });
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post("/api/chat/title", async (req, res) => {
    try {
      const { prompt } = req.body as { prompt?: string };
      if (!prompt || typeof prompt !== "string") {
        res.status(400).json({ title: "گفت‌وگوی جدید" });
        return;
      }

      const ai = createAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: `یک عنوان کوتاه و دقیق (حداکثر ۵ کلمه، بدون علامت نقل‌قول و بدون نقطه پایانی) به همان زبانِ متن زیر برای موضوع این گفت‌وگو بنویس:\n\n${prompt.slice(0, 400)}`,
      });

      const title = (response.text || "گفت‌وگوی جدید")
        .replace(/["'«»`*#]/g, "")
        .trim()
        .slice(0, 60);

      res.json({ title: title || "گفت‌وگوی جدید" });
    } catch {
      res.json({ title: "گفت‌وگوی جدید" });
    }
  });

  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const hmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
      },
      appType: "spa",
    });
    if (hmrDisabled) {
      app.get("/@vite/client", async (_req, res, next) => {
        try {
          const result = await vite.transformRequest("/@vite/client");
          if (!result) return next();
          const patched = result.code
            .replace(/await wsTransport\.connect\(handlers\);/g, "return;")
            .replace(
              /ws\.send\(JSON\.stringify\(data\)\);/g,
              "if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));"
            );
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.send(patched);
        } catch {
          next();
        }
      });
    }
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get("/{*path}", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
      });
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Parto AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
