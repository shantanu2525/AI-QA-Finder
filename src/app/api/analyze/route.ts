import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AI Question Answer Finder — vision analysis endpoint.
 *
 * Browser -> this route -> Gemini / OpenAI -> this route -> browser.
 * API keys never leave the server.
 *
 * Env:
 *   AI_PROVIDER=gemini | openai   (default: gemini)
 *   GEMINI_API_KEY=...            GEMINI_MODEL (optional, default gemini-2.0-flash)
 *   OPENAI_API_KEY=...            OPENAI_MODEL (optional, default gpt-4o-mini)
 *   AI_MOCK=1                     (optional, local testing without keys)
 */

const PROMPT = `You are an expert exam-question solver with vision. Analyze the provided image, which may show a multiple-choice question (a screenshot, or a photo of a screen or paper).

Tasks:
1. Read and transcribe the question text exactly as written.
2. Extract every answer option exactly as written, keeping its label (e.g. "A. Python").
3. Solve the question using only your own knowledge. Completely ignore any highlighting, ticks, circles, or selected/marked answers visible in the image — they may be wrong.
4. Rate your confidence that your answer is correct as an integer from 0 to 100.

Rules:
- Respond with ONLY a JSON object. No markdown, no explanation, no reasoning, no extra words.
- JSON shape: {"question": string, "options": string[], "answer": string, "confidence": number, "status": "answered" | "uncertain"}
- "answer" must be one of the extracted options, written verbatim, whenever options exist.
- If the image does not contain a readable question, return: {"question":"","options":[],"answer":"","confidence":0,"status":"uncertain"}`;

interface ProviderResult {
  question: string;
  options: string[];
  answer: string;
  confidence: number;
  status: "answered" | "uncertain";
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function coerceConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

function normalizeResult(raw: unknown): ProviderResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const question = coerceString(obj.question);
  const options = Array.isArray(obj.options)
    ? obj.options.map(coerceString).filter(Boolean).slice(0, 10)
    : [];
  let answer = coerceString(obj.answer);

  // Align the answer with the extracted option text so highlighting matches.
  if (answer && options.length > 0) {
    const exact = options.find((o) => o.toLowerCase() === answer.toLowerCase());
    if (exact) {
      answer = exact;
    } else {
      const labelOf = (s: string) => {
        const m = s.match(/^\s*([a-z0-9]{1,2})\s*[.)\]:-]/i);
        return m ? m[1].toLowerCase() : null;
      };
      const answerLabel = labelOf(answer);
      const byLabel = answerLabel ? options.find((o) => labelOf(o) === answerLabel) : undefined;
      if (byLabel) answer = byLabel;
    }
  }

  const answered = question.length > 0 && answer.length > 0;
  return {
    question,
    options,
    answer,
    confidence: coerceConfidence(obj.confidence),
    status: answered ? "answered" : "uncertain",
  };
}

async function analyzeWithGemini(base64: string, mimeType: string, apiKey: string): Promise<ProviderResult> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        response_mime_type: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `Gemini request failed (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed?.error?.message) message = `Gemini error: ${parsed.error.message}`;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini returned an empty response. Try a clearer image.");
  return normalizeResult(extractJson(text));
}

async function analyzeWithOpenAI(dataUrl: string, apiKey: string): Promise<ProviderResult> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this question image and respond with only the JSON object." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `OpenAI request failed (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed?.error?.message) message = `OpenAI error: ${parsed.error.message}`;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("OpenAI returned an empty response. Try a clearer image.");
  return normalizeResult(extractJson(text));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
    const image = typeof body?.image === "string" ? body.image : "";

    if (!image.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "No valid image was provided. Please capture, upload, or paste one first." },
        { status: 400 },
      );
    }
    if (image.length > 14_000_000) {
      return NextResponse.json(
        { error: "That image is too large for analysis. Try a smaller or tighter crop." },
        { status: 413 },
      );
    }

    // Local testing hook — never enabled in production unless explicitly set.
    if (process.env.AI_MOCK === "1") {
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({
        question: "Which programming language is primarily used for Android development?",
        options: ["A. Python", "B. Java", "C. HTML", "D. SQL"],
        answer: "B. Java",
        confidence: 96,
        status: "answered",
      });
    }

    const provider = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
    const mimeMatch = image.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    const mimeType = mimeMatch?.[1] ?? "image/jpeg";
    const base64 = mimeMatch?.[2] ?? image.split(",")[1] ?? "";
    if (!base64) {
      return NextResponse.json({ error: "The image data could not be read." }, { status: 400 });
    }

    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        return NextResponse.json(
          { error: "OpenAI is selected but OPENAI_API_KEY is not configured on the server." },
          { status: 500 },
        );
      }
      const result = await analyzeWithOpenAI(image, key);
      return NextResponse.json(result);
    }

    if (provider !== "gemini") {
      return NextResponse.json(
        { error: `Unknown AI_PROVIDER "${provider}". Use "gemini" or "openai".` },
        { status: 500 },
      );
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Gemini is selected but GEMINI_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }
    const result = await analyzeWithGemini(base64, mimeType, key);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[analyze] failed:", error);
    const message =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "The AI took too long to respond. Please try again."
        : error instanceof Error
          ? error.message
          : "Something went wrong while analyzing the image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
