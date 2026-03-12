// ─────────────────────────────────────────────────────────
// generate-lab/index.ts  —  FREE STACK (Groq AI)
// ─────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type" };
const GROQ_KEY   = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return resp({error:"Unauthorized"},401);
    const { data:{user} } = await sb.auth.getUser(auth.replace("Bearer ",""));
    if (!user) return resp({error:"Invalid token"},401);

    const { topic_id, difficulty } = await req.json();
    if (!topic_id||!difficulty) return resp({error:"topic_id and difficulty required"},400);

    const { data: topic } = await sb.from("topics")
      .select("*, categories(name, cloud_providers(name))").eq("id",topic_id).single();
    if (!topic) return resp({error:"Topic not found"},404);

    // 3-day cache
    const { data: cached } = await sb.from("generated_labs_cache")
      .select("*").eq("topic_id",topic_id).eq("difficulty",difficulty)
      .gt("expires_at",new Date().toISOString()).single();
    if (cached) return resp({data:cached.content,cached:true});

    const topicName = topic.full_name||topic.name;
    const provider  = topic.categories?.cloud_providers?.name||"Cloud";

    const prompt = `You are a ${provider} hands-on trainer. Create a complete step-by-step lab for "${topicName}" at ${difficulty} level.
Return ONLY valid JSON (no markdown, no extra text):
{
  "lab_title": "Hands-on Lab: ${topicName}",
  "difficulty": "${difficulty}",
  "estimated_time": "30-45 minutes",
  "objective": "What the student will achieve by the end",
  "prerequisites": ["Prerequisite 1","Prerequisite 2"],
  "steps": [
    {
      "step_number": 1,
      "title": "Step title",
      "description": "What this step does and why",
      "commands": [
        {
          "description": "What this command does",
          "language": "bash",
          "command": "actual command here",
          "expected_output": "what you should see"
        }
      ],
      "notes": "Optional tip or warning"
    }
  ],
  "summary": "What was accomplished",
  "cleanup": "Commands to undo/delete what was created"
}
Include 5-7 steps with real, working commands. ${difficulty==="beginner"?"Start from scratch, explain everything.":difficulty==="intermediate"?"Focus on real-world patterns.":"Cover advanced configurations and edge cases."}`;

    const raw = await callGroq(prompt);
    let parsed: any;
    try {
      const clean = raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
      const s=clean.indexOf("{"),e=clean.lastIndexOf("}");
      if(s<0||e<0) throw new Error("No JSON");
      parsed = JSON.parse(clean.slice(s,e+1));
    } catch { return resp({error:"Lab generation failed — please retry"},500); }

    await sb.from("generated_labs_cache").upsert({
      topic_id, difficulty, content:parsed, model_used:GROQ_MODEL,
      expires_at: new Date(Date.now()+3*24*60*60*1000).toISOString(),
    },{ onConflict:"topic_id,difficulty" });

    return resp({data:parsed,cached:false});
  } catch(e:any){ return resp({error:e.message},500); }
});

async function callGroq(prompt: string) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":`Bearer ${GROQ_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:GROQ_MODEL,messages:[{role:"user",content:prompt}],max_tokens:3500,temperature:0.6}),
  });
  if(!r.ok) throw new Error(`Groq error ${r.status}: ${await r.text()}`);
  return (await r.json()).choices[0].message.content;
}
function resp(data:any,status=200){ return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}}); }