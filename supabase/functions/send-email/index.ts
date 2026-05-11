/**
 * send-email — Supabase Edge Function
 *
 * Sends emails via Resend, merges template variables, logs results,
 * and creates an activity record for each successful send.
 *
 * Secrets: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Body: { template_id, recipients: [{ contact_id, client_id, email, variables: {} }], sent_by, from_mode? }
 * from_mode: 'csm' (default) | 'noreply' — only admin/manager can use 'noreply'
 */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const allowedOrigins = [
  "https://donccx.vercel.app",
  "http://localhost:5173",
]

function getCorsHeaders(origin: string | null) {
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "https://donccx.vercel.app",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    }
  }
  const isVercelPreview = origin.includes("vercel.app") && origin.includes("donccx")
  if (allowedOrigins.includes(origin) || isVercelPreview) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    }
  }
  return {
    "Access-Control-Allow-Origin": "https://donccx.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }
}

function mergeTags(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
}

serve(async (req) => {
  const origin = req.headers.get("origin")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(origin) })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    })

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader) return json({ error: "Missing authorization token" }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, "").trim()
    if (!token) return json({ error: "Invalid authorization token" }, 401)

    const sbUrl = Deno.env.get("SUPABASE_URL")!
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const authRes = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: sbKey },
    })
    if (!authRes.ok) return json({ error: "Unauthorized" }, 401)

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json()
    const { template_id, recipients, sent_by, from_mode: rawFromMode } = body as {
      template_id: string
      recipients: Array<{
        contact_id: number
        client_id: number
        email: string
        variables: Record<string, string>
      }>
      sent_by: string
      from_mode?: string
    }

    const from_mode: "csm" | "noreply" = rawFromMode === "noreply" ? "noreply" : "csm"

    if (!template_id || !Array.isArray(recipients) || recipients.length === 0) {
      return json({ error: "template_id and recipients[] required" }, 400)
    }

    // ── Fetch sender profile ──────────────────────────────────────────────────
    const profileRes = await fetch(
      `${sbUrl}/rest/v1/profiles?id=eq.${sent_by}&select=name,email,role`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    )
    const profileRows = await profileRes.json()
    const senderProfile = profileRows?.[0] as { name: string; email: string; role: string } | undefined

    // ── Validate from_mode permission ─────────────────────────────────────────
    if (from_mode === "noreply") {
      const role = senderProfile?.role ?? ""
      if (role !== "admin" && role !== "manager") {
        return json({ error: "Apenas admin ou manager podem usar o remetente noreply" }, 403)
      }
    }

    // ── Resolve from address ──────────────────────────────────────────────────
    const fromAddress = from_mode === "noreply"
      ? "DONC <noreply@donc.com.br>"
      : `${senderProfile?.name ?? "DONC"} <${senderProfile?.email ?? "onboarding@resend.dev"}>`

    // ── Fetch template ────────────────────────────────────────────────────────
    const tplRes = await fetch(
      `${sbUrl}/rest/v1/email_templates?id=eq.${template_id}&select=*`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
    )
    const tplRows = await tplRes.json()
    if (!tplRows?.length) return json({ error: "Template not found" }, 404)
    const tpl = tplRows[0]

    const resendKey = Deno.env.get("RESEND_API_KEY")
    if (!resendKey) return json({ error: "RESEND_API_KEY not configured" }, 500)

    const logs: Array<{ contact_id: number; email: string; status: string; error?: string }> = []
    let sentCount   = 0
    let failedCount = 0

    for (const recipient of recipients) {
      const mergedSubject = mergeTags(tpl.subject, recipient.variables)
      const mergedHtml    = mergeTags(tpl.html_body, recipient.variables)

      // ── Send via Resend ───────────────────────────────────────────────────
      let status      = "sent"
      let errorMsg: string | null = null

      try {
        const sendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:    fromAddress,
            to:      recipient.email,
            subject: mergedSubject,
            html:    mergedHtml,
          }),
        })
        if (!sendRes.ok) {
          const errBody = await sendRes.text()
          throw new Error(`Resend ${sendRes.status}: ${errBody}`)
        }
      } catch (err) {
        status   = "failed"
        errorMsg = String(err)
        console.error("send-email: resend error:", errorMsg)
      }

      // ── Log to email_logs ─────────────────────────────────────────────────
      await fetch(`${sbUrl}/rest/v1/email_logs`, {
        method: "POST",
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          template_id:     template_id,
          client_id:       recipient.client_id,
          contact_id:      recipient.contact_id,
          sent_by:         sent_by,
          recipient_email: recipient.email,
          subject:         mergedSubject,
          status,
          error_message:   errorMsg,
          from_mode,
        }),
      })

      if (status === "sent") {
        sentCount++

        // ── Fetch contact name for activity description ───────────────────
        let contactName = recipient.email
        try {
          const ctRes = await fetch(
            `${sbUrl}/rest/v1/contacts?id=eq.${recipient.contact_id}&select=name`,
            { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
          )
          const ctRows = await ctRes.json()
          if (ctRows?.[0]?.name) contactName = ctRows[0].name
        } catch (_) { /* non-fatal */ }

        // ── Insert activity ───────────────────────────────────────────────
        await fetch(`${sbUrl}/rest/v1/activities`, {
          method: "POST",
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            type:           "email",
            description:    `E-mail enviado para ${contactName}: ${mergedSubject}`,
            client_id:      recipient.client_id,
            responsible_id: sent_by,
            activity_date:  new Date().toISOString().slice(0, 10),
            status:         "concluida",
          }),
        })
      } else {
        failedCount++
      }

      logs.push({ contact_id: recipient.contact_id, email: recipient.email, status, error: errorMsg ?? undefined })
    }

    return json({ sent: sentCount, failed: failedCount, logs })

  } catch (err) {
    console.error("send-email:", err)
    return json({ error: String(err) }, 500)
  }
})
