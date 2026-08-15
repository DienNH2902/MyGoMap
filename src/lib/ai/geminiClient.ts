// Model id lives in its own constant (not baked into the endpoint string) so
// that when Google retires it again — as it just did with gemini-2.5-flash,
// see the 404 "no longer available to new users" error — there's exactly one
// line to change instead of hunting through the file. gemini-2.5-flash-lite
// is Google's own currently-recommended replacement for retired Flash models
// (cheap, free-tier friendly, plenty fast enough for short trip tips/answers).
const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
  /** One short line per stop, e.g. "Điểm dừng 1 (cách 45km): 3 địa điểm gợi ý". */
  stopSummaries: string[];
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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

  const categoriesText =
    input.categories.length > 0
      ? input.categories.join(", ")
      : "không có mục cụ thể";
  const prompt =
    `Bạn là trợ lý du lịch của ứng dụng MyGoMap. Hành trình dài ${input.distanceKm.toFixed(0)}km, ` +
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

  const prompt =
    `Bạn là trợ lý du lịch của ứng dụng MyGoMap, đang hỗ trợ người dùng cho MỘT chuyến đi cụ thể ` +
    `${routeText} bằng ${vehicleText}, dài ${context.distanceKm.toFixed(0)}km, mất khoảng ` +
    `${Math.round(context.durationMinutes)} phút, có ${context.stopCount} điểm dừng với các dịch vụ: ` +
    `${categoriesText}. ${stopsText}\n\n` +
    `Người dùng hỏi: "${trimmedQuestion}"\n\n` +
    `Trả lời ngắn gọn (tối đa 4-5 câu), thân thiện, hữu ích, bằng tiếng Việt, chỉ dựa trên thông tin ` +
    `chuyến đi ở trên kết hợp kiến thức chung về du lịch/đường xá Việt Nam. Nếu câu hỏi không liên quan ` +
    `đến chuyến đi hoặc du lịch, lịch sự từ chối và gợi ý người dùng hỏi về chuyến đi thay vào đó.`;

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
