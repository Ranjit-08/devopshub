// register-test/index.ts — FIXED AUTH
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-auth",
};

const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL   = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
const TG_TOKEN     = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TG_CHAT      = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://devopshub.pages.dev";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Use service role client for DB operations
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify user JWT
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) return resp({ error: "No authorization header" }, 401);
    
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token === "null" || token === "undefined") {
      return resp({ error: "Invalid token — please sign out and sign in again" }, 401);
    }

    const { data: { user }, error: authErr } = await sbAdmin.auth.getUser(token);
    if (authErr || !user) {
      console.error("Auth error:", authErr?.message);
      return resp({ error: "Session expired — please sign out and sign in again" }, 401);
    }

    const { topic_id, difficulty, question_count } = await req.json();
    if (!topic_id || !difficulty || !question_count) {
      return resp({ error: "Missing required fields" }, 400);
    }

    // Get topic and profile
    const [{ data: topic }, { data: profile }] = await Promise.all([
      sbAdmin.from("topics").select("*, categories(name)").eq("id", topic_id).single(),
      sbAdmin.from("profiles").select("full_name, username").eq("id", user.id).maybeSingle(),
    ]);
    if (!topic) return resp({ error: "Topic not found" }, 404);

    // Create registration
    const { data: reg, error: regErr } = await sbAdmin
      .from("test_registrations")
      .insert({
        user_id: user.id, topic_id, difficulty,
        question_count, time_limit_minutes: question_count,
        status: "registered",
      })
      .select().single();
    if (regErr) return resp({ error: regErr.message }, 400);

    const userName  = profile?.full_name || profile?.username || "Learner";
    const topicName = topic.full_name || topic.name;

    // Send email via Resend
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_EMAIL, to: user.email!,
          subject: `✅ Registered: ${topicName} Test — DevOpsHub`,
          html: emailHTML(userName, topicName, difficulty, question_count, reg.id, FRONTEND_URL),
        }),
      });
    } catch (e) { console.error("Email error:", e); }

    // Telegram alert
    if (TG_TOKEN && TG_CHAT) {
      fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG_CHAT, text: `🎯 New Test Registration\n\n👤 ${userName}\n📧 ${user.email}\n📚 ${topicName}\n📊 ${difficulty.toUpperCase()} · ${question_count} Qs`, parse_mode: "Markdown" }),
      }).catch(console.error);
    }

    return resp({ data: reg });
  } catch (e: any) {
    console.error("Error:", e);
    return resp({ error: e.message }, 500);
  }
});

function emailHTML(name: string, topic: string, diff: string, q: number, id: string, url: string) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#03040d;color:#f0f6ff;padding:32px">
<div style="max-width:540px;margin:0 auto;background:#080c1a;border:1px solid rgba(56,189,248,0.2);border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0ea5e9,#7c3aed);padding:28px;text-align:center">
    <div style="font-size:36px">⚡</div>
    <h1 style="color:white;font-size:22px;margin:10px 0">You're Registered!</h1>
  </div>
  <div style="padding:28px">
    <p style="color:#8ba4c7">Hi <strong style="color:#f0f6ff">${name}</strong>,</p>
    <div style="background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.2);border-radius:12px;padding:20px;margin:20px 0;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#38bdf8">${topic}</div>
      <div style="color:#8ba4c7;margin-top:8px">${diff.toUpperCase()} · ${q} Questions · ${q} Minutes · 70% to pass</div>
    </div>
    <div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.2);border-radius:10px;padding:14px;color:#fcd34d;font-size:13px;margin-bottom:20px">
      ⚠️ Do NOT switch tabs during the test — it causes automatic disqualification.
    </div>
    <div style="text-align:center">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#7c3aed);color:white;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none">🚀 Go to DevOpsHub</a>
    </div>
    <p style="color:#4a6080;font-size:12px;margin-top:24px;text-align:center">Reg ID: ${id.slice(0,8).toUpperCase()}</p>
  </div>
</div></body></html>`;
}

function resp(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}