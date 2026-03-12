// ─────────────────────────────────────────────────────────
// submit-test/index.ts  —  FREE STACK
// Email via Resend (free) · Telegram alerts (free)
// ─────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type" };
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL   = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
const TG_TOKEN     = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TG_CHAT      = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://devopshub.pages.dev";

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return resp({error:"Unauthorized"},401);
    const { data:{user} } = await sb.auth.getUser(auth.replace("Bearer ",""));
    if (!user) return resp({error:"Invalid token"},401);

    const { registration_id, answers, questions, time_taken_seconds } = await req.json();

    const { data:reg } = await sb.from("test_registrations")
      .select("*, topics(name, full_name)").eq("id",registration_id).eq("user_id",user.id).single();
    if (!reg) return resp({error:"Registration not found"},404);
    if (reg.status==="disqualified") return resp({error:"Test was disqualified"},403);
    if (reg.status==="completed")    return resp({error:"Already submitted"},400);

    // ── Score calculation ────────────────────────────────
    let correct = 0;
    const total = questions.length;
    questions.forEach((q:any, i:number) => {
      if (answers[i]!==undefined && Number(answers[i])===Number(q.correct_answer)) correct++;
    });
    const percentage = (correct / total) * 100;
    const passed     = percentage >= 70;

    // ── Save quiz attempt ────────────────────────────────
    await sb.from("quiz_attempts").insert({
      registration_id, user_id:user.id, topic_id:reg.topic_id,
      difficulty:reg.difficulty, questions, answers,
      score:correct*10, total_questions:total, correct_answers:correct,
      time_taken_seconds, percentage, passed,
      completed_at:new Date().toISOString(),
    });

    // ── Update registration ──────────────────────────────
    await sb.from("test_registrations")
      .update({ status:"completed", completed_at:new Date().toISOString() })
      .eq("id",registration_id);

    // ── Update user skill score ──────────────────────────
    const xp = passed ? Math.round(percentage) + 50 : Math.round(percentage * 0.3);
    await sb.rpc("increment_skill_score", { p_user_id:user.id, p_amount:xp });
    await sb.from("profiles").update({
      total_tests_taken: sb.rpc("coalesce_increment", { col:"total_tests_taken", uid:user.id }),
      last_active: new Date().toISOString(),
    }).eq("id",user.id);

    // ── Issue certificate if passed ──────────────────────
    let certificate = null;
    if (passed) {
      const certNum = `CERT-${new Date().getFullYear()}-${reg.topics?.name?.replace(/\s+/g,"").toUpperCase().slice(0,6)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const { data:cert } = await sb.from("certificates").insert({
        user_id:user.id, topic_id:reg.topic_id,
        registration_id, difficulty:reg.difficulty,
        score:correct*10, percentage, certificate_number:certNum,
        issued_at:new Date().toISOString(),
      }).select().single();
      certificate = cert;
    }

    // ── Get updated profile ──────────────────────────────
    const { data:profile } = await sb.from("profiles").select("full_name,username,skill_score").eq("id",user.id).single();
    const userName  = profile?.full_name||profile?.username||"Learner";
    const topicName = reg.topics?.full_name||reg.topics?.name||"DevOps";

    // ── Email results via Resend ─────────────────────────
    await sendEmail({
      to: user.email!,
      subject: `${passed?"🎉 You Passed":"📊 Your Results"}: ${topicName} — DevOpsHub`,
      html: resultsEmailHTML(userName, topicName, correct, total, percentage, passed, certificate, FRONTEND_URL),
    });

    // ── Telegram alert ───────────────────────────────────
    if (TG_TOKEN && TG_CHAT) {
      await telegram(`${passed?"🏆 PASSED":"❌ FAILED"} Test Result\n\n👤 ${userName}\n📚 ${topicName}\n📊 ${correct}/${total} = ${percentage.toFixed(1)}%\n🎯 ${reg.difficulty.toUpperCase()}\n${certificate?`🎓 Cert: ${certificate.certificate_number}`:""}`);
    }

    return resp({ data:{ score:correct, total, percentage, passed, certificate, xp_earned:xp } });
  } catch(e:any){ return resp({error:e.message},500); }
});

async function sendEmail({ to, subject, html }: { to:string; subject:string; html:string }) {
  const r = await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{"Authorization":`Bearer ${RESEND_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({from:FROM_EMAIL,to,subject,html}),
  });
  if(!r.ok) console.error("Resend error:", await r.text());
}

async function telegram(text:string) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:TG_CHAT,text,parse_mode:"Markdown"}),
  });
}

function resultsEmailHTML(name:string,topic:string,score:number,total:number,pct:number,passed:boolean,cert:any,url:string){
  const color = pct>=90?"#34d399":pct>=70?"#38bdf8":"#f87171";
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#03040d;color:#f0f6ff;padding:32px">
<div style="max-width:540px;margin:0 auto;background:#080c1a;border:1px solid rgba(56,189,248,0.2);border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0ea5e9,#7c3aed);padding:28px;text-align:center">
    <div style="font-size:44px">${passed?"🎉":"📊"}</div>
    <h1 style="color:white;font-size:22px;margin:10px 0">${passed?"Test Passed!":"Your Results"}</h1>
  </div>
  <div style="padding:28px">
    <p style="color:#8ba4c7;font-size:15px">Hi <strong style="color:#f0f6ff">${name}</strong>,</p>
    <div style="text-align:center;margin:20px 0">
      <div style="font-size:56px;font-weight:800;color:${color}">${pct.toFixed(1)}%</div>
      <div style="color:#8ba4c7;font-size:16px">${score} / ${total} correct</div>
      <div style="display:inline-block;margin-top:12px;padding:6px 20px;border-radius:20px;background:${passed?"rgba(52,211,153,0.15)":"rgba(248,113,113,0.15)"};color:${passed?"#34d399":"#f87171"};font-weight:700;border:1px solid ${passed?"rgba(52,211,153,0.3)":"rgba(248,113,113,0.3)"}">${passed?"✅ PASSED":"❌ NOT PASSED"}</div>
    </div>
    ${cert?`<div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.25);border-radius:12px;padding:16px;text-align:center;margin-bottom:20px"><div style="font-size:28px">🏆</div><div style="color:#fbbf24;font-weight:700;margin-top:6px">Certificate of Completion</div><div style="color:#8ba4c7;font-size:13px;margin-top:4px;font-family:monospace">${cert.certificate_number}</div></div>`:""}
    ${!passed?`<div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:10px;padding:14px;color:#93c5fd;font-size:13px;margin-bottom:20px">💡 You need 70% to pass. Study the topic again and try once more — you can do it!</div>`:""}
    <div style="text-align:center">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#7c3aed);color:white;padding:14px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px">${passed?"📊 View Dashboard":"📚 Study More"}</a>
    </div>
  </div>
</div></body></html>`;
}

function resp(data:any,status=200){ return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}}); }