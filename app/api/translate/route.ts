import { NextResponse } from "next/server";
import { z } from "zod";
import { MissingKeyError, ModelError, translate } from "@/lib/translate/generate";
import { rateLimit } from "@/lib/translate/rate-limit";

const bodySchema = z.object({
  description: z.string().min(3).max(400),
  ruleId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "rule ids are lowercase, digits and hyphens"),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe the rule in a sentence." }, { status: 400 });
  }

  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(key, Date.now());
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Translation is limited to six requests a minute. Try again in ${limit.retryAfterSeconds}s — the rule editor does everything this box does.`,
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    return NextResponse.json(await translate(parsed.data.description, parsed.data.ruleId));
  } catch (error) {
    if (error instanceof MissingKeyError) {
      return NextResponse.json(
        {
          error:
            "No GEMINI_API_KEY is configured, so prose cannot be translated. Add the rule directly — the editor does everything this box does, and every finding, the space map and the export work without it.",
        },
        { status: 501 },
      );
    }
    if (error instanceof ModelError) {
      return NextResponse.json(
        { error: `The model could not produce a rule the engine will accept. ${error.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Translation failed." }, { status: 500 });
  }
}
