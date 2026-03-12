// ─────────────────────────────────────────────────────────
// reminder-cron/index.ts  —  FREE STACK
// AI via Groq · Email via Resend · Alerts via Telegram
// Runs automatically every hour via pg_cron (free)
// ─────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type" };
const GROQ_KEY     = Deno.env.get("GROQ_API_KEY")!;
const GROQ_MODEL   = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL   = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
const TG_TOKEN     = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TG_CHAT      = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
const CRON_SECRET  = Deno.env.get("CRON_SECRET");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://devopshub.pages.dev";

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});

  // Security: only the scheduler can call this
  const secret = req.headers.get("x-cron-secret");
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return new Response(JSON.stringify({error:"Forbidden"}),{status:403,headers:cors});
  }

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const results: Record<string,any> = {};

    // ── 1. Send reminders to inactive users (24h+) ───────
    const cutoff = new Date(Date.now()-24*60*60*1000).toISOString();
    const { data:inactiveUsers } = await sb.from("profiles")
      .select("id, full_name, username, email:id")
      .lt("last_active", cutoff)
      .limit(50);

    let emailsSent = 0;
    if (inactiveUsers?.length) {
      for (const u of inactiveUsers) {
        // Get user email from auth.users
        const { data:authUser } = await sb.auth.admin.getUserById(u.id);
        if (!authUser?.user?.email) continue;
        const name = u.full_name || u.username || "Learner";
        await sendEmail(authUser.user.email, `${name}, your DevOps streak is waiting! 🔥`,
          reminderHTML(name, FRONTEND_URL));
        emailsSent++;
      }
    }
    results.reminders_sent = emailsSent;

    // ── 2. Create today's daily challenge ────────────────
    const today = new Date().toISOString().split("T")[0];
    const { data:existing } = await sb.from("daily_challenges").select("id").eq("date",today).single();

    if (!existing) {
      // Pick a random topic for the challenge
      const { data:topics } = await sb.from("topics").select("id, name, full_name").limit(50);
      const topic = topics?.[Math.floor(Math.random()*topics.length)];

      if (topic) {
        const prompt = `Create 1 multiple-choice question about "${topic.full_name||topic.name}" at intermediate difficulty.
Return ONLY valid JSON (no markdown, no extra text):
{
  "question": "Question text?",
  "options": ["Option A","Option B","Option C","Option D"],
  "correct_answer": 0,
  "explanation": "Why this is correct in 1 sentence"
}`;
        try {
          const raw = await callGroq(prompt);
          const clean = raw.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
          const s=clean.indexOf("{"),e=clean.lastIndexOf("}");
          const q = JSON.parse(clean.slice(s,e+1));

          await sb.from("daily_challenges").insert({
            date: today, topic_id:topic.id,
            difficulty:"intermediate", question:q,
          });
          results.daily_challenge_created = topic.full_name||topic.name;
        } catch(e) {
          results.daily_challenge_error = String(e);
        }
      }
    } else {
      results.daily_challenge = "already exists";
    }

    // ── 3. Update streaks ────────────────────────────────
    await sb.rpc("update_all_streaks").catch(()=>{});

    // ── 4. Telegram summary ──────────────────────────────
    if (TG_TOKEN && TG_CHAT) {
      await telegram(`⏰ *Hourly Cron Report*\n\n📧 Reminders sent: ${emailsSent}\n🎯 Daily challenge: ${results.daily_challenge_created||results.daily_challenge||"n/a"}\n🕐 ${new Date().toISOString().slice(0,16)}`);
    }

    results.success = true;
    return new Response(JSON.stringify(results),{headers:{...cors,"Content-Type":"application/json"}});
  } catch(e:any){ return new Response(JSON.stringify({error:e.message}),{status:500,headers:cors}); }
});

async function callGroq(prompt:string){
  const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":`Bearer ${GROQ_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:GROQ_MODEL,messages:[{role:"user",content:prompt}],max_tokens:500,temperature:0.7}),
  });
  if(!r.ok) throw new Error(await r.text());
  return (await r.json()).choices[0].message.content;
}
async function sendEmail(to:string,subject:string,html:string){
  await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{"Authorization":`Bearer ${RESEND_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({from:FROM_EMAIL,to,subject,html}),
  });
}
async function telegram(text:string){
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:TG_CHAT,text,parse_mode:"Markdown"}),
  });
}
function reminderHTML(name:string,url:string){
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#03040d;padding:32px">
<div style="max-width:480px;margin:0 auto;background:#080c1a;border:1px solid rgba(56,189,248,0.2);border-radius:16px;padding:32px;text-align:center">
  <div style="font-size:44px">🔥</div>
  <h2 style="color:#f0f6ff;font-size:20px;margin:12px 0">Your streak is waiting, ${name}!</h2>
  <p style="color:#8ba4c7;font-size:14px;line-height:1.6">Come back and study just one topic today. It only takes 10 minutes to keep your learning streak alive!</p>
  <a href="${url}" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#0ea5e9,#7c3aed);color:white;padding:13px 28px;border-radius:10px;font-weight:700;text-decoration:none">Continue Learning →</a>
</div></body></html>`;
}