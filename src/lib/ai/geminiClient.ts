// Model id lives in its own constant (not baked into the endpoint string) so
// that when Google retires it again — as it just did with gemini-2.5-flash,
// see the 404 "no longer available to new users" error — there's exactly one
// line to change instead of hunting through the file. gemini-2.5-flash-lite
// is Google's own currently-recommended replacement for retired Flash models
// (cheap, free-tier friendly, plenty fast enough for short trip tips/answers).
const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const STORAGE_KEY_NAME = "mygomap_user_name";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

export type GenderType = "nam" | "nu" | "khac" | "";

export interface CustomStop {
  name: string;
  lat?: number;
  lng?: number;
  address?: string;
  /** Vị trí/Hành chính cụ thể (ví dụ: "Thống Nhất, Đồng Nai" hoặc "TP. Vũng Tàu") */
  locationName?: string;
}

export interface RouteStopPoint {
  /** Khoảng cách tích lũy từ điểm xuất phát (km) */
  distanceFromStartKm: number;
  /** Tên địa danh/hành chính tương ứng trên map (ví dụ: "Huyện Thống Nhất, Đồng Nai") */
  locationName: string;
  /** Tóm tắt các địa điểm gợi ý quanh điểm dừng này */
  summary?: string;
}

export interface TripSummaryInput {
  distanceKm: number;
  durationMinutes: number;
  stopCount: number;
  categories: string[];
}

/** Extra trip context used by the interactive "Hỏi AI" assistant, so answers stay grounded in the actual planned trip. */
export interface TripContext extends TripSummaryInput {
  avoidHighways: boolean;
  startLabel?: string;
  endLabel?: string;
  /** Danh sách điểm dừng custom do người dùng tự chọn trên bản đồ */
  customStops?: CustomStop[];
  /** Chuỗi/Danh sách mô tả tuyến đường hoặc danh sách tỉnh/thành phố đi qua (ví dụ: "QL20 -> Đà Lạt" hoặc ["Đồng Nai", "Lâm Đồng"]) */
  routeVia?: string;
  /** Chi tiết từng mốc dừng trên tuyến kèm vị trí địa lý thực tế */
  routeStopPoints?: RouteStopPoint[];
  /** One short line per stop, e.g. "Điểm dừng 1 (cách 45km): 3 địa điểm gợi ý". */
  stopSummaries: string[];
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Helper đọc thông tin user từ localStorage để phục vụ prompt */
function getUserContext() {
  if (typeof window === "undefined") {
    return {
      name: "",
      gender: "" as GenderType,
      honorific: "bạn",
      userLabel: "bạn",
    };
  }
  const name = localStorage.getItem(STORAGE_KEY_NAME)?.trim() ?? "";
  const gender = (localStorage.getItem(STORAGE_KEY_GENDER) as GenderType) ?? "";

  let honorific = "bạn";
  if (gender === "nam") honorific = "anh";
  else if (gender === "nu") honorific = "chị";

  const userLabel = name ? `${honorific} ${name}` : "bạn";

  return { name, gender, honorific, userLabel };
}

/**
 * Optional feature: asks Gemini's free-tier Flash model for a short, friendly
 * Vietnamese tip about the planned trip. Returns null silently (never throws)
 * whenever no key is configured or the request fails, so the rest of the app
 * always works fully without it.
 */
export async function generateTripTip(
  input: TripSummaryInput,
): Promise<string | null> {
  // const apiKey = process.env.GEMINI_API_KEY;
  // if (!apiKey) return null;
  const { userLabel, honorific } = getUserContext();

  const categoriesText =
    input.categories.length > 0
      ? input.categories.join(", ")
      : "không có mục cụ thể";
  const prompt =
    `Bạn là trợ lý du lịch của ứng dụng MyGoMap, tên là MeoMeo AI. Hành trình dài ${input.distanceKm.toFixed(0)}km, ` +
    `Bạn đang trò chuyện và gợi ý cho người dùng tên là "${userLabel}". Hãy xưng xưng xưng hô là "em" hoặc "MeoMeo AI" và gọi người dùng là "${userLabel}" (hoặc "${honorific}"). ` +
    `mất khoảng ${Math.round(input.durationMinutes)} phút, có ${input.stopCount} điểm dừng chân ` +
    `với các dịch vụ được chọn: ${categoriesText}. Viết đúng 1-2 câu gợi ý ngắn gọn, thân thiện, ` +
    `hữu ích bằng tiếng Việt cho chuyến đi này.`;

  try {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

/**
 * NEW: interactive trip Q&A. Unlike generateTripTip (one-shot, fired
 * automatically), this answers a specific question the user typed, using the
 * same trip's distance/duration/stops/vehicle/categories as grounding context
 * so answers stay relevant to THIS route rather than being generic travel
 * advice.
 *
 * Unlike generateTripTip, this NEVER silently swallows the failure reason —
 * it always returns `errorReason` when something goes wrong (bad API key,
 * wrong/retired model name, 429 quota exceeded, Gemini's safety filter
 * blocking the answer, network error, etc.) so the chat UI can show the real
 * cause instead of one generic "thử lại sau" message for every possible
 * failure. It still never throws.
 */
export interface AskTripAssistantResult {
  text: string | null;
  /** Human-readable reason, only set when `text` is null. */
  errorReason?: string;
}

export async function askTripAssistant(
  question: string,
  context: TripContext,
  signal?: AbortSignal,
): Promise<AskTripAssistantResult> {
  // const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const trimmedQuestion = question.trim();

  // if (!apiKey) {
  //   return {
  //     text: null,
  //     errorReason:
  //       "Thiếu NEXT_PUBLIC_GEMINI_API_KEY — kiểm tra file .env.local rồi khởi động lại app.",
  //   };
  // }
  if (!trimmedQuestion) {
    return { text: null };
  }

  const { userLabel, honorific } = getUserContext();

  const categoriesText =
    context.categories.length > 0
      ? context.categories.join(", ")
      : "không có mục cụ thể";
  const vehicleText = context.avoidHighways
    ? "xe máy (không đi cao tốc)"
    : "ô tô";
  const routeText =
    context.startLabel && context.endLabel
      ? `từ "${context.startLabel}" đến "${context.endLabel}"`
      : "";
  const stopsText =
    context.stopSummaries.length > 0
      ? `Các điểm dừng: ${context.stopSummaries.join(" | ")}.`
      : "Chuyến đi hiện không có điểm dừng nào.";

  // 1. Xử lý các điểm dừng tự chọn trên bản đồ (Custom Stops)
  const customStopsText =
    context.customStops && context.customStops.length > 0
      ? context.customStops
          .map(
            (s, i) =>
              `[Mốc ${i + 1}] ${s.name}${s.locationName ? ` (${s.locationName})` : s.address ? ` (${s.address})` : ""}`,
          )
          .join("; ")
      : "Không có điểm ghim riêng.";

  // 2. Xử lý danh sách các mốc dừng hệ thống kèm vị trí địa lý thực tế & khoảng cách
  const detailedStopsText =
    context.routeStopPoints && context.routeStopPoints.length > 0
      ? context.routeStopPoints
          .map(
            (sp, i) =>
              `+ Trạm ${i + 1} (Cách điểm xuất phát ${sp.distanceFromStartKm.toFixed(0)} km): Vị trí thực tế tại "${sp.locationName}"${sp.summary ? ` - Gợi ý: ${sp.summary}` : ""}`,
          )
          .join("\n")
      : context.stopSummaries.length > 0
        ? context.stopSummaries.join(" | ")
        : "Không có mốc dừng cố định.";

  const routeDetailText = context.routeVia
    ? `Tuyến đường & các khu vực đi qua: ${context.routeVia}.`
    : "";

  // 3. Ghép Prompt mới đầy đủ ngữ cảnh địa lý thực tế
  const prompt =
    `Bạn là trợ lý du lịch của ứng dụng MyGoMap, tên là MeoMeo AI, đang hỗ trợ người dùng là "${userLabel}". ` +
    `Khi trả lời, hãy luôn xưng là "em" (hoặc "MeoMeo") và gọi người dùng là "${userLabel}" (hoặc "${honorific}").\n\n` +
    `THÔNG TIN LỘ TRÌNH & VỊ TRÍ ĐỊA LÝ THỰC TẾ:\n` +
    `- Điểm xuất phát: ${context.startLabel ?? "Chưa rõ"}\n` +
    `- Điểm đến: ${context.endLabel ?? "Chưa rõ"}\n` +
    `- Phương tiện: ${vehicleText}\n` +
    `- Tổng quãng đường & Thời gian: ${context.distanceKm.toFixed(0)} km, khoảng ${Math.round(context.durationMinutes)} phút\n` +
    `- ${routeDetailText}\n` +
    `- Chi tiết các mốc dừng chân thực tế trên lộ trình:\n${detailedStopsText}\n` +
    `- Điểm dừng tự chọn trên map (Custom Stops): ${customStopsText}\n\n` +
    `Người dùng (${userLabel}) hỏi: "${trimmedQuestion}"\n\n` +
    `YÊU CẦU TRẢ LỜI:\n` +
    `Trả lời ngắn gọn (tối đa 4-5 câu), thân thiện, chu đáo bằng tiếng Việt. BẮT BUỘC dựa chính xác vào tên địa danh/tỉnh thành/khu vực tại các mốc dừng được liệt kê ở trên (ví dụ: mốc 100km thuộc Đồng Nai chứ không phải Vũng Tàu).`;

  let response: Response;
  try {
    response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal,
    });
  } catch (err) {
    // Network failure, CORS block, or the request was aborted.
    const reason =
      err instanceof DOMException && err.name === "AbortError"
        ? "yêu cầu bị huỷ hoặc quá thời gian chờ"
        : err instanceof Error
          ? err.message
          : "lỗi mạng không xác định";
    console.error(`[Gemini] askTripAssistant: fetch thất bại — ${reason}`);
    return {
      text: null,
      errorReason: `Không kết nối được tới Gemini (${reason}).`,
    };
  }

  if (!response.ok) {
    // Try to read Gemini's own error message (wrong/retired model name,
    // invalid key, quota exceeded, etc.) instead of just the status code —
    // this is almost always the actual root cause when every question fails.
    let detail = `mã lỗi ${response.status}`;
    try {
      const errorBody = (await response.json()) as {
        error?: { message?: string; status?: string };
      };
      if (errorBody.error?.message) detail = errorBody.error.message;
    } catch {
      // Body wasn't JSON — keep the generic status-code message above.
    }
    console.error(
      `[Gemini] askTripAssistant: HTTP ${response.status} — ${detail}`,
    );
    return { text: null, errorReason: `Gemini báo lỗi: ${detail}` };
  }

  const data = (await response.json()) as GeminiResponse & {
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    // The request itself succeeded (HTTP 200) but Gemini didn't actually
    // return an answer — in practice this is almost always its safety
    // filter blocking the prompt or the reply (finishReason "SAFETY"/
    // "RECITATION", or promptFeedback.blockReason). This is silently
    // indistinguishable from a config problem unless we surface the reason.
    const blockReason =
      data.promptFeedback?.blockReason ??
      candidate?.finishReason ??
      "không rõ lý do";
    console.warn(
      `[Gemini] askTripAssistant: không có nội dung trả về (${blockReason}).`,
    );
    return {
      text: null,
      errorReason: `Gemini không trả lời được câu này (lý do: ${blockReason}).`,
    };
  }

  return { text };
}
