// ─────────────────────────────────────────────────────────
// ask-ai/index.ts  —  Free-form AI Q&A for DevOpsHub
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
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const auth = req.headers.get("Authorization");
    if (!auth) return resp({ error: "Unauthorized" }, 401);
    const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return resp({ error: "Invalid token" }, 401);

    const { question } = await req.json();
    if (!question || question.trim().length < 3) {
      return resp({ error: "Please enter a valid question" }, 400);
    }

    const prompt = `You are an expert DevOps and Cloud engineer with deep knowledge of AWS, Kubernetes, Docker, Terraform, CI/CD, and all major DevOps tools.

A student on DevOpsHub asks: "${question}"

Give a clear, practical answer structured as:
1. Direct answer (2-3 sentences)
2. Key points or steps (numbered if applicable)
3. A real example or command if relevant
4. A quick tip to remember

Be educational and encouraging. Use **bold** for key terms and \`code\` for commands. Under 400 words.`;

    const aiResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 700,
        temperature: 0.5,
      }),
    });

    const aiData = await aiResp.json();
    const answer = aiData.choices?.[0]?.message?.content;
    if (!answer) throw new Error("AI did not return an answer");

    return resp({ data: { answer, question } });
  } catch (e: any) {
    return resp({ error: e.message }, 500);
  }
});

function resp(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}