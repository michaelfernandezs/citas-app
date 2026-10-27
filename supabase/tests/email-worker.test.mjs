// Prueba el handler con Auth, DB y Resend simulados; no envía correos reales.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import ts from '../../frontend/node_modules/typescript/lib/typescript.js';

let handler, variables, calls, fetchCalls, claimError, providerStatus;
const email = { id: 'email-1', recipient: 'patient@example.com', startsAt: '2026-11-01T12:00:00Z', expiresAt: '2026-10-31T12:00:00Z' };
globalThis.Deno = { env: { get: name => variables[name] }, serve: value => { handler = value; } };
globalThis.__workerCreateClient = () => ({ rpc: async (name, args) => {
  calls.push([name, args]);
  return name === 'citas_claim_emails' ? { data: [email], error: claimError } : { error: null };
} });
globalThis.fetch = async (url, options) => {
  fetchCalls.push([url, options]);
  return new Response('{}', { status: providerStatus });
};
const source = (await readFile(new URL('../functions/send-offer-emails/index.ts', import.meta.url), 'utf8'))
  .replace("import { createClient } from 'npm:@supabase/supabase-js@2';", 'const createClient = (...args) => globalThis.__workerCreateClient(...args);');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
beforeEach(() => {
  calls = []; fetchCalls = []; claimError = null; providerStatus = 200;
  variables = { OFFER_WORKER_SECRET: 'worker-secret', RESEND_API_KEY: 'test-resend', EMAIL_FROM: 'test@example.com', FRONTEND_URL: 'https://frontend.example.com', CLINIC_TIMEZONE: 'UTC' };
});
const request = (secret = 'worker-secret') => new Request('https://example.com', { method: 'POST', headers: { 'x-worker-secret': secret } });

test('rejects unauthenticated calls before accessing database or mail provider', async () => {
  assert.equal((await handler(request('wrong'))).status, 401);
  assert.equal(calls.length, 0); assert.equal(fetchCalls.length, 0);
});
test('does not claim messages when email configuration is incomplete', async () => {
  delete variables.RESEND_API_KEY;
  assert.equal((await handler(request())).status, 503); assert.equal(calls.length, 0);
});
test('returns a failure when the database cannot claim messages', async () => {
  claimError = { message: 'DB unavailable' };
  assert.equal((await handler(request())).status, 500); assert.equal(fetchCalls.length, 0);
});
test('keeps messages retryable if the provider rejects delivery', async () => {
  providerStatus = 429;
  assert.equal((await handler(request())).status, 502);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'citas_claim_emails');
});
test('acknowledges delivery and supplies a stable idempotency key', async () => {
  const response = await handler(request());
  assert.deepEqual(await response.json(), { sent: 1, failed: 0 });
  assert.deepEqual(calls[1], ['citas_ack_email', { email_id: 'email-1' }]);
  assert.equal(fetchCalls[0][1].headers['Idempotency-Key'], 'email-1');
});
