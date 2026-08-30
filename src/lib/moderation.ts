import "server-only";

export interface ModerationResult {
  ok: boolean;
  skipped: boolean;
  scores?: Record<string, number>;
  reason?: string;
}

/**
 * Screen an uploaded logo before it can ever be displayed.
 *
 * Pluggable: if OPENAI_API_KEY is set, images are passed through OpenAI's
 * omni-moderation model. Swap this function's body for Hive / AWS Rekognition
 * if you prefer. With no provider configured it returns {skipped:true} and
 * ALLOWS the image — acceptable for local dev, NEVER for a public board.
 */
export async function moderateImage(publicUrl: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[moderation] OPENAI_API_KEY not set — image passed through unscreened. Do not run a public board like this.",
    );
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{ type: "image_url", image_url: { url: publicUrl } }],
      }),
    });
    if (!res.ok) {
      // Fail CLOSED: if moderation is down, do not approve.
      return { ok: false, skipped: false, reason: `moderation_http_${res.status}` };
    }
    const data = (await res.json()) as {
      results: { flagged: boolean; category_scores: Record<string, number> }[];
    };
    const r = data.results?.[0];
    return {
      ok: !!r && !r.flagged,
      skipped: false,
      scores: r?.category_scores,
      reason: r?.flagged ? "flagged" : undefined,
    };
  } catch (e) {
    return { ok: false, skipped: false, reason: "moderation_error" };
  }
}
