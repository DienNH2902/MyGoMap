"use client";

import { useEffect, useRef, useState } from "react";
import { askTripAssistant, type TripContext } from "@/lib/ai/geminiClient";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
}

interface AiAssistantPanelProps {
  tripContext: TripContext;
}

/**
 * Floating chat button + panel that lets the user ask free-form questions
 * about the trip they just planned (đèo dốc, nên mang gì, nghỉ ở đâu, v.v.),
 * answered by Gemini using that trip's own distance/duration/stops/vehicle/
 * categories as grounding context — see askTripAssistant in geminiClient.ts.
 *
 * Only rendered by MapExperience once a plan exists AND a Gemini key is
 * configured (checked here too, as a second safety net), so it never shows
 * a chat box that can't actually answer anything.
 */
export function AiAssistantPanel({ tripContext }: AiAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  // const hasGeminiKey = Boolean(process.env.NEXT_PUBLIC_GEMINI_API_KEY);
  // if (!hasGeminiKey) return null;

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: question },
    ]);
    setInput("");
    setIsLoading(true);

    const result = await askTripAssistant(question, tripContext);

    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: "ai",
        text:
          result.text ??
          `Xin lỗi, mình chưa trả lời được câu này. (${result.errorReason ?? "lỗi không xác định"})`,
      },
    ]);
    setIsLoading(false);
  };

  return (
    <div className="absolute bottom-28 left-4 z-40 flex flex-col items-start gap-2 sm:bottom-6">
      {isOpen && (
        <div className="flex h-96 w-80 max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-accent-gold/30 bg-ink/95 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
              Hỏi MeoMeo AI về chuyến đi
            </p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-cream/60 transition hover:text-cream"
              aria-label="Đóng khung chat"
            >
              ✕
            </button>
          </div>

          <div
            ref={listRef}
            className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && (
              <p className="text-xs italic text-cream/40">
                Hỏi MeoMeo về lộ trình này: có nên nghỉ ở đâu, đường có đèo dốc
                không, nên mang theo gì, v.v.
              </p>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto bg-primary/30 text-cream"
                    : "mr-auto bg-white/10 text-cream"
                }`}
              >
                {message.text}
              </div>
            ))}

            {isLoading && (
              <div className="mr-auto max-w-[85%] rounded-xl bg-white/10 px-3 py-2 text-xs italic text-cream/50">
                MeoMeo đang nghĩ…
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 p-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSend();
              }}
              placeholder="Nhập câu hỏi…"
              disabled={isLoading}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-cream placeholder:text-cream/30 focus:border-accent-gold focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
              className="rounded-lg bg-accent-gold px-3 py-2 text-xs font-bold text-ink transition disabled:opacity-40"
            >
              Gửi
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full bg-accent-gold px-4 py-2.5 text-sm font-bold text-ink shadow-2xl border-2 border-white transition-transform hover:scale-105 active:scale-95"
      >
        💬 Hỏi MeoMeo AI
      </button>
    </div>
  );
}
