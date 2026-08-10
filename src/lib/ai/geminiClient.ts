const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export interface TripSummaryInput {
  distanceKm: number;
  durationMinutes: number;
  stopCount: number;
  categories: string[];
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
export async function generateTripTip(input: TripSummaryInput): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return null;

  const categoriesText = input.categories.length > 0 ? input.categories.join(', ') : 'không có mục cụ thể';
  const prompt =
    `Bạn là trợ lý du lịch của ứng dụng MyGoMap. Hành trình dài ${input.distanceKm.toFixed(0)}km, ` +
    `mất khoảng ${Math.round(input.durationMinutes)} phút, có ${input.stopCount} điểm dừng chân ` +
    `với các dịch vụ được chọn: ${categoriesText}. Viết đúng 1-2 câu gợi ý ngắn gọn, thân thiện, ` +
    `hữu ích bằng tiếng Việt cho chuyến đi này.`;

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}
