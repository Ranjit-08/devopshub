// ─────────────────────────────────────────────────────────
// generate-quiz/index.ts  —  FREE STACK (Groq AI)
// ─────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type" };
const GROQ_KEY   = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return resp({error:"Unauthorized"},401);
    const { data:{user} } = await sb.auth.getUser(auth.replace("Bearer ",""));
    if (!user) return resp({error:"Invalid token"},401);

    const { topic_id, difficulty, question_count, registration_id } = await req.json();
    if (!topic_id || !difficulty || !question_count) return resp({error:"Missing fields"},400);

    // Verify registration
    const { data: reg } = await sb.from("test_registrations").select("*").eq("id",registration_id).eq("user_id",user.id).single();
    if (!reg) return resp({error:"Registration not found"},404);
    if (reg.status==="disqualified") return resp({error:"Test disqualified"},403);

    const { data: topic } = await sb.from("topics")
      .select("*, categories(name, cloud_providers(name))")
      .eq("id",topic_id).single();
    if (!topic) return resp({error:"Topic not found"},404);

    const topicName = topic.full_name||topic.name;
    const provider  = topic.categories?.cloud_providers?.name||"Cloud";

    // Random seed makes every quiz unique
    const seed = Math.random().toString(36).slice(2,8);

    const prompt = `You are a ${provider} certification expert. Create ${question_count} UNIQUE multiple-choice questions about "${topicName}" at ${difficulty} level.
Seed for uniqueness: ${seed}
Return ONLY valid JSON array (no markdown, no extra text):
[
  {
    "question": "Full question text here?",
    "options": ["Option A text","Option B text","Option C text","Option D text"],
    "correct_answer": 0,
    "explanation": "Why this answer is correct in 1-2 sentences"
  }
]
Rules:
- correct_answer is the INDEX (0=A, 1=B, 2=C, 3=D)
- All 4 options must be plausible (no obviously wrong options)
- Mix conceptual and practical questions
- No repeated questions
- Difficulty ${difficulty}: ${difficulty==="beginner"?"basic definitions and simple scenarios":difficulty==="intermediate"?"real configuration and troubleshooting":"deep internals, edge cases, cost optimisation"}
- Return exactly ${question_count} questions`;

    const raw = await callGroq(prompt);
    let questions: any[];
    try {
      const clean = raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
      const s=clean.indexOf("["), e=clean.lastIndexOf("]");
      if(s<0||e<0) throw new Error("No JSON array");
      questions = JSON.parse(clean.slice(s,e+1));
    } catch { return resp({error:"Quiz generation failed — please retry"},500); }

    if (!Array.isArray(questions)||questions.length===0) return resp({error:"No questions generated"},500);

    return resp({ data:{ questions, topic_name:topicName, difficulty, total:questions.length } });
  } catch(e:any) { return resp({error:e.message},500); }
});

async function callGroq(prompt: string) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:"POST",
    headers:{"Authorization":`Bearer ${GROQ_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:GROQ_MODEL,messages:[{role:"user",content:prompt}],max_tokens:4000,temperature:0.9}),
  });
  if(!r.ok) throw new Error(`Groq error ${r.status}: ${await r.text()}`);
  return (await r.json()).choices[0].message.content;
}
function resp(data:any,status=200){ return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}}); }