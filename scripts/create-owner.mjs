#!/usr/bin/env node
// Secure server-side owner bootstrap. Run ONCE on your own machine — never in the browser.
//   1. Fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL, OWNER_NAME in .env
//   2. npm run create-owner
// Creates (or reuses) the auth user with a confirmed email and grants the owner role.
// The database allows exactly one owner; public sign-up can never create one.
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, exit } from 'node:process';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL, OWNER_NAME = 'KanaBloom Owner' } = process.env;
let { OWNER_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OWNER_EMAIL) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_EMAIL in .env first.');
  exit(1);
}
if (!OWNER_PASSWORD) {
  const rl = createInterface({ input: stdin, output: stdout });
  OWNER_PASSWORD = await rl.question('Owner password (min 12 chars): ');
  rl.close();
}
// if (OWNER_PASSWORD.length < 12) { console.error('Use an owner password of at least 12 characters.'); exit(1); }

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let userId;
const { data: created, error: createErr } = await db.auth.admin.createUser({
  email: OWNER_EMAIL, password: OWNER_PASSWORD, email_confirm: true, user_metadata: { full_name: OWNER_NAME },
});
if (createErr) {
  if (!/already|registered|exists/i.test(createErr.message)) { console.error('Could not create user:', createErr.message); exit(1); }
  console.log('User already exists — promoting the existing account.');
} else {
  userId = created.user.id;
  console.log('Created auth user', userId);
}

const { data, error } = await db.rpc('promote_to_owner', { p_email: OWNER_EMAIL });
if (error) { console.error('Could not grant owner role:', error.message); exit(1); }
console.log('✔', data);
console.log('Log in at /login with the owner email; you will be taken to /admin.');
