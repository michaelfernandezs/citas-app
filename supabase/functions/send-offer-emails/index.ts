import { createClient } from 'npm:@supabase/supabase-js@2';

type Email = { id: string; recipient: string; startsAt: string; expiresAt: string };
Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('OFFER_WORKER_SECRET');
  if (request.method !== 'POST' || !secret || request.headers.get('x-worker-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  const frontendUrl = Deno.env.get('FRONTEND_URL');
  if (!apiKey || !from || !frontendUrl) return new Response('Email configuration missing', { status: 503 });
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc('citas_claim_emails');
  if (error) return new Response('Unable to claim emails', { status: 500 });
  let sent = 0;
  let failed = 0;
  const timezone = Deno.env.get('CLINIC_TIMEZONE') ?? 'UTC';
  for (const email of (data ?? []) as Email[]) {
    try {
      const starts = new Date(email.startsAt).toLocaleString('es-MX', { timeZone: timezone });
      const expires = new Date(email.expiresAt).toLocaleString('es-MX', { timeZone: timezone });
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': email.id },
        body: JSON.stringify({
          from, to: email.recipient, subject: 'Se liberó la cita que esperabas',
          text: `Se liberó una cita para ${starts}. Puedes aceptarla hasta ${expires} entrando a ${frontendUrl}.`,
        }),
      });
      if (!response.ok) { failed++; continue; }
      const ack = await client.rpc('citas_ack_email', { email_id: email.id });
      if (ack.error) { failed++; continue; }
      sent++;
    } catch { failed++; }
  }
  return Response.json({ sent, failed }, { status: failed ? 502 : 200 });
});
