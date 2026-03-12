// ─────────────────────────────────────────────────────────
// generate-learning/index.ts  —  FREE STACK (Groq AI)
// Sign up FREE at console.groq.com — no credit card needed
// ─────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const GROQ_KEY   = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return resp({ error: "Unauthorized" }, 401);
    const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return resp({ error: "Invalid token" }, 401);

    const { topic_id, difficulty } = await req.json();
    if (!topic_id || !difficulty) return resp({ error: "topic_id and difficulty required" }, 400);

    const { data: topic } = await sb.from("topics")
      .select("*, categories(name, provider_id, cloud_providers(name))")
      .eq("id", topic_id).single();
    if (!topic) return resp({ error: "Topic not found" }, 404);

    // Check 7-day cache
    const { data: cached } = await sb.from("generated_learning_cache")
      .select("*").eq("topic_id", topic_id).eq("difficulty", difficulty)
      .gt("expires_at", new Date().toISOString()).single();
    if (cached) {
      await sb.from("generated_learning_cache").update({ hit_count: (cached.hit_count||0)+1 }).eq("id", cached.id);
      await saveProgress(sb, user.id, topic_id, difficulty);
      return resp({ data: cached.content, cached: true });
    }

    const providerName = topic.categories?.cloud_providers?.name || "Cloud";
    const topicName    = topic.full_name || topic.name;
    const catName      = topic.categories?.name || "";
    const diffDesc     = difficulty === "beginner" ? "assume no prior knowledge, simple language" :
                         difficulty === "intermediate" ? "assume basic cloud knowledge, cover internals" :
                         "assume strong knowledge, cover advanced patterns";

    const prompt = `You are a ${providerName} expert. Create a ${difficulty} learning module for "${topicName}" (${catName}).
Difficulty note: ${diffDesc}.
Return ONLY valid JSON — no markdown fences, no extra text — in this exact structure:
{
  "topic": "${topicName}",
  "title": "Complete Guide: ${topicName}",
  "difficulty": "${difficulty}",
  "estimated_time": "25 minutes",
  "overview": "3-sentence overview",
  "key_concepts": [{"icon":"🔧","title":"name","explanation":"2-sentence explanation"}],
  "architecture": {"description":"how it fits","components":["Component 1: desc","Component 2: desc","Component 3: desc"]},
  "commands_and_examples": [{"title":"title","description":"what it does","language":"bash","code":"actual code"}],
  "best_practices": [{"title":"name","description":"why and how","importance":"high"}],
  "real_world_use_cases": [{"title":"title","company_example":"Company","description":"how they use it"}],
  "common_mistakes": [{"mistake":"what people do wrong","solution":"the right way"}],
  "summary": "2-sentence summary",
  "next_steps": ["Next topic 1","Next topic 2","Next topic 3"]
}
Include: 4 key_concepts, 3 architecture components, 3 code examples, 4 best_practices, 2 use_cases, 3 mistakes, 3 next_steps.`;

    const t0 = Date.now();
    const raw = await callGroq(prompt);
    const genMs = Date.now() - t0;
    let parsed: any;
    try { parsed = extractJSON(raw); }
    catch { return resp({ error: "AI generation failed — please retry" }, 500); }

    await sb.from("generated_learning_cache").upsert({
      topic_id, difficulty, content: parsed, model_used: GROQ_MODEL, generation_time_ms: genMs,
      expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
    }, { onConflict: "topic_id,difficulty" });
    await saveProgress(sb, user.id, topic_id, difficulty);
    return resp({ data: parsed, cached: false });

  } catch (e: any) { return resp({ error: e.message }, 500); }
});

async function callGroq(prompt: string) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: GROQ_MODEL, messages:[{role:"user",content:prompt}], max_tokens:3000, temperature:0.7 }),
  });
  if (!r.ok) throw new Error(`Groq error ${r.status}: ${await r.text()}`);
  return (await r.json()).choices[0].message.content;
}
function extractJSON(text: string) {
  const clean = text.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s<0||e<0) throw new Error("No JSON in response");
  return JSON.parse(clean.slice(s,e+1));
}
async function saveProgress(sb: any, uid: string, tid: string, diff: string) {
  await sb.from("learning_progress").upsert({ user_id:uid, topic_id:tid, difficulty:diff, status:"completed", last_accessed:new Date().toISOString() }, { onConflict:"user_id,topic_id" });
  await sb.from("profiles").update({ last_active:new Date().toISOString() }).eq("id",uid);
}
function resp(data: any, status=200) {
  return new Response(JSON.stringify(data), { status, headers:{...cors,"Content-Type":"application/json"} });
}