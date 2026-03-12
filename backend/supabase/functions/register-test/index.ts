// ─────────────────────────────────────────────────────────
// register-test/index.ts  —  FREE STACK
// Email via Resend (free — resend.com, no card needed)
// Alerts via Telegram (always free)
// ─────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type" };
const RESEND_KEY      = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL      = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
const TG_TOKEN        = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TG_CHAT         = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
const FRONTEND_URL    = Deno.env.get("FRONTEND_URL") || "https://devopshub.pages.dev";

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return resp({error:"Unauthorized"},401);
    const { data:{user} } = await sb.auth.getUser(auth.replace("Bearer ",""));
    if (!user) return resp({error:"Invalid token"},401);

    const { topic_id, difficulty, question_count } = await req.json();

    const [{ data:topic }, { data:profile }] = await Promise.all([
      sb.from("topics").select("*, categories(name)").eq("id",topic_id).single(),
      sb.from("profiles").select("full_name, username").eq("id",user.id).single(),
    ]);
    if (!topic) return resp({error:"Topic not found"},404);

    const { data:reg, error } = await sb.from("test_registrations").insert({
      user_id: user.id, topic_id, difficulty, question_count,
      time_limit_minutes: question_count, status:"registered",
    }).select().single();
    if (error) return resp({error:error.message},400);

    const userName  = profile?.full_name||profile?.username||"Learner";
    const topicName = topic.full_name||topic.name;

    // ── Email via Resend ──────────────────────────────────
    await sendEmail({
      to: user.email!,
      subject: `✅ Registered: ${topicName} Test — DevOpsHub`,
      html: registrationEmailHTML(userName, topicName, difficulty, question_count, reg.id, FRONTEND_URL),
    });

    // ── Telegram admin alert ──────────────────────────────
    if (TG_TOKEN && TG_CHAT) {
      await telegram(`🎯 *New Test Registration*\n\n👤 User: ${userName}\n📧 ${user.email}\n📚 Topic: ${topicName}\n📊 ${difficulty.toUpperCase()} · ${question_count} Qs\n🆔 ${reg.id.slice(0,8)}`);
    }

    return resp({ data: reg });
  } catch(e:any){ return resp({error:e.message},500); }
});

async function sendEmail({ to, subject, html }: { to:string; subject:string; html:string }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization":`Bearer ${RESEND_KEY}`, "Content-Type":"application/json" },
    body: JSON.stringify({ from:FROM_EMAIL, to, subject, html }),
  });
  if (!r.ok) console.error("Resend error:", await r.text());
}

async function telegram(text: string) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ chat_id:TG_CHAT, text, parse_mode:"Markdown" }),
  });
}

function registrationEmailHTML(name:string, topic:string, diff:string, qCount:number, regId:string, url:string) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#03040d;color:#f0f6ff;padding:32px">
<div style="max-width:540px;margin:0 auto;background:#080c1a;border:1px solid rgba(56,189,248,0.2);border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0ea5e9,#7c3aed);padding:28px;text-align:center">
    <div style="font-size:36px">⚡</div>
    <h1 style="color:white;font-size:22px;margin:10px 0">You're Registered!</h1>
  </div>
  <div style="padding:28px">
    <p style="color:#8ba4c7;font-size:15px">Hi <strong style="color:#f0f6ff">${name}</strong>,</p>
    <p style="color:#8ba4c7;font-size:15px">You have successfully registered for:</p>
    <div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:12px;padding:20px;margin:20px 0;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#38bdf8">${topic}</div>
      <div style="color:#8ba4c7;margin-top:8px">${diff.toUpperCase()} • ${qCount} Questions • ${qCount} Minutes • 70% to pass</div>
    </div>
    <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:10px;padding:14px;color:#fcd34d;font-size:13px;margin-bottom:20px">
      ⚠️ <strong>Important:</strong> Do NOT switch tabs or minimise during the test. It will cause automatic disqualification.
    </div>
    <div style="text-align:center">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#7c3aed);color:white;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px">🚀 Go to DevOpsHub</a>
    </div>
    <p style="color:#4a6080;font-size:12px;margin-top:24px;text-align:center">Registration ID: ${regId.slice(0,8).toUpperCase()}</p>
  </div>
</div></body></html>`;
}

function resp(data:any,status=200){ return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}}); }