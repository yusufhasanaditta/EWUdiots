// Supabase Edge Function: read an EWU portal screenshot with Claude vision and
// return the same structure the on-device parser produces.
// Deploy:  supabase functions deploy parse-screenshot
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// The image is never stored; only the structured result is returned.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const DAILY_LIMIT = 20;
const MAX_BYTES = 6 * 1024 * 1024;
const MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const str = { type: "string" };
const num = { type: "number" };
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const row = obj({ code: str, title: str, sec: str, days: str, start: str, end: str, room: str, faculty: str, lab: { type: "boolean" }, enrolled: num, capacity: num });

const SCHEMA = obj({
  page: { type: "string", enum: ["profile", "class_schedule", "advising_slip", "grade_report", "degree_review", "offered_courses", "advising_rules", "pre_advising", "other"] },
  profile: obj({ name: str, id: str, program: str, department: str, email: str, advisor: str, advisorInitial: str, advisorEmail: str, cgpa: num, creditsDone: num, creditsTotal: num, admitted: str }),
  routine: { type: "array", items: row },
  offered: { type: "array", items: row },
  grades: { type: "array", items: obj({ code: str, title: str, cr: num, g: str, sem: str }) },
  faculty: { type: "array", items: obj({ init: str, name: str, email: str }) },
  payments: { type: "array", items: obj({ due: str, amount: num, late: { type: "boolean" } }) },
  rules: obj({ maxCredit: num, minCredit: num, maxPerDay: num, maxCourses: num, minCourses: num }),
});

const SYSTEM = `You read screenshots of the East West University (Bangladesh) student portal and extract academic data as JSON.

Conventions:
- Days use portal letters: S=Sunday M=Monday T=Tuesday W=Wednesday R=Thursday F=Friday A=Saturday. Keep them as written (e.g. "MW", "TR", "S").
- Times are 24-hour "HH:MM" (e.g. "1:30PM" -> "13:30").
- Course codes have no spaces (e.g. "CSE110", "ENG7101", "AIML501"). A row like "CHE109 Lab" is code "CHE109" with lab=true; a lab row with an empty section inherits the section of the course above it.
- Semesters are written "Spring-2026", "Summer-2026" or "Fall-2026".
- Class schedule and advising slip rows go in "routine". Offered-course rows go in "offered", with capacity "19 / 40" meaning enrolled=19, capacity=40.
- Faculty initials, names and emails from schedule tables go in "faculty".
- Advising-slip "Grand Total ... Last Date: D/M/YYYY amount" lines go in "payments" with due as "YYYY-MM-DD".
- Use "" for unknown text, 0 for unknown numbers, false for unknown booleans, and [] for absent lists.

Privacy: never extract phone numbers, home or permanent addresses, national ID, date of birth, blood group, marital status, unique ID or anything about photos, even if visible. Leave those out entirely.
Respond with the JSON only.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Only signed-in (verified EWU email) users
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json({ error: "Please sign in first." }, 401);

  const { count } = await supabase.from("ai_usage").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("created_at", new Date(Date.now() - 864e5).toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `Daily limit of ${DAILY_LIMIT} smart scans reached. Try again tomorrow or use Paste text.` }, 429);

  let body: { image?: string; mediaType?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const image = String(body.image || "").replace(/^data:[^,]+,/, "");
  const mediaType = String(body.mediaType || "image/png");
  if (!image || !MEDIA.has(mediaType)) return json({ error: "Send a PNG, JPEG or WebP screenshot." }, 400);
  if (image.length * 0.75 > MAX_BYTES) return json({ error: "Screenshot is larger than 6 MB." }, 413);

  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/png", data: image } },
          { type: "text", text: "Extract the data from this EWU portal screenshot." },
        ],
      }],
    });

    await supabase.from("ai_usage").insert({ user_id: user.id });

    if (response.stop_reason === "refusal") return json({ error: "This screenshot couldn't be read. Try Paste text instead." }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "Screenshot has too much content. Crop it to one table and retry." }, 422);
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "No data found in the screenshot." }, 422);
    return json(JSON.parse(text.text));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Smart scan is busy. Try again in a minute." }, 503);
    if (err instanceof Anthropic.APIError) return json({ error: `Smart scan failed (${err.status}).` }, 502);
    if (err instanceof SyntaxError) return json({ error: "Smart scan returned unreadable data. Please retry." }, 502);
    throw err;
  }
});
