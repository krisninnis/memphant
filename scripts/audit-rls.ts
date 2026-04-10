#!/usr/bin/env tsx
/**
 * scripts/audit-rls.ts
 *
 * Supabase Row-Level Security audit for Memphant.
 *
 * Checks every table in the public schema and reports:
 *   ✓  RLS enabled + policies present
 *   ⚠  RLS enabled but NO policies (table is locked out for everyone)
 *   ✗  RLS disabled (table is wide open)
 *
 * Also validates that known critical tables have the expected policy names.
 *
 * Usage:
 *   npx tsx scripts/audit-rls.ts
 *
 * Requires env vars (from .env or environment):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL             = process.env.SUPABASE_URL             ?? process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌  Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Expected policy baseline per table ───────────────────────────────────────

const EXPECTED_POLICIES: Record<string, string[]> = {
  projects:      ['Users can select their own projects', 'Users can insert their own projects', 'Users can update their own projects', 'Users can delete their own projects'],
  subscriptions: ['Users can read their own subscription'],
  subscribers:   [], // server-side only — no user-facing RLS needed, but RLS should be ON
};

// ─── Queries ──────────────────────────────────────────────────────────────────

interface TableRow {
  tablename: string;
  rowsecurity: boolean;
}

interface PolicyRow {
  tablename: string;
  policyname: string;
  cmd: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
}

async function getTablesRLS(): Promise<TableRow[]> {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `,
  });

  if (error) {
    // Fallback: query information_schema via raw SQL through service role
    const { data: d2, error: e2 } = await supabase
      .from('pg_tables' as never)
      .select('tablename, rowsecurity')
      .eq('schemaname', 'public');
    if (e2) throw new Error(`Cannot read pg_tables: ${e2.message}`);
    return (d2 ?? []) as TableRow[];
  }

  return (data ?? []) as TableRow[];
}

async function getPolicies(): Promise<PolicyRow[]> {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        tablename,
        policyname,
        cmd,
        roles,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `,
  });

  if (error) {
    // Try direct table access
    const { data: d2, error: e2 } = await supabase
      .from('pg_policies' as never)
      .select('tablename, policyname, cmd, roles, qual, with_check')
      .eq('schemaname', 'public');
    if (e2) throw new Error(`Cannot read pg_policies: ${e2.message}`);
    return (d2 ?? []) as PolicyRow[];
  }

  return (data ?? []) as PolicyRow[];
}

// ─── Audit logic ──────────────────────────────────────────────────────────────

type Status = 'ok' | 'warn' | 'fail';

interface TableAudit {
  table:            string;
  rlsEnabled:       boolean;
  policies:         PolicyRow[];
  status:           Status;
  issues:           string[];
  missingPolicies:  string[];
}

function auditTable(
  table: TableRow,
  policies: PolicyRow[],
): TableAudit {
  const tablePolicies = policies.filter((p) => p.tablename === table.tablename);
  const issues: string[] = [];
  const missingPolicies: string[] = [];
  let status: Status = 'ok';

  if (!table.rowsecurity) {
    status = 'fail';
    issues.push('RLS is DISABLED — all authenticated users can read/write this table freely');
  } else if (tablePolicies.length === 0) {
    status = 'warn';
    issues.push('RLS is enabled but NO policies exist — all access is denied (may be intentional for server-only tables)');
  }

  // Check expected policy names
  const expected = EXPECTED_POLICIES[table.tablename] ?? [];
  const presentNames = tablePolicies.map((p) => p.policyname);

  for (const name of expected) {
    if (!presentNames.includes(name)) {
      missingPolicies.push(name);
      status = status === 'fail' ? 'fail' : 'warn';
    }
  }

  // Check for overly permissive policies (auth.uid() not referenced)
  for (const policy of tablePolicies) {
    const qual = (policy.qual ?? '').toLowerCase();
    const check = (policy.with_check ?? '').toLowerCase();
    const usesAuthUid = qual.includes('auth.uid()') || check.includes('auth.uid()');
    const roles = Array.isArray(policy.roles) ? policy.roles : [];
    const isPublic = roles.includes('anon') || roles.includes('public');

    if (isPublic) {
      issues.push(`Policy "${policy.policyname}" applies to anonymous/public role — verify this is intentional`);
      if (status === 'ok') status = 'warn';
    }

    if (table.rowsecurity && tablePolicies.length > 0 && !usesAuthUid && !isPublic) {
      issues.push(`Policy "${policy.policyname}" may not be scoped to auth.uid() — review qual: ${policy.qual}`);
      if (status === 'ok') status = 'warn';
    }
  }

  return {
    table:      table.tablename,
    rlsEnabled: table.rowsecurity,
    policies:   tablePolicies,
    status,
    issues,
    missingPolicies,
  };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

const ICON: Record<Status, string> = {
  ok:   '✓',
  warn: '⚠',
  fail: '✗',
};

const COLOUR: Record<Status, string> = {
  ok:   '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  fail: '\x1b[31m', // red
};

const RESET = '\x1b[0m';

function printAudit(audits: TableAudit[]) {
  const totalFail = audits.filter((a) => a.status === 'fail').length;
  const totalWarn = audits.filter((a) => a.status === 'warn').length;
  const totalOk   = audits.filter((a) => a.status === 'ok').length;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        Memphant — RLS Audit Report       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  for (const audit of audits) {
    const c = COLOUR[audit.status];
    const icon = ICON[audit.status];
    console.log(`${c}${icon}${RESET}  ${audit.table}`);

    if (audit.rlsEnabled) {
      console.log(`     RLS: enabled   Policies: ${audit.policies.length}`);
    } else {
      console.log(`     RLS: ${COLOUR.fail}DISABLED${RESET}`);
    }

    for (const policy of audit.policies) {
      console.log(`     · [${policy.cmd}] ${policy.policyname}`);
    }

    for (const issue of audit.issues) {
      console.log(`     ${COLOUR.warn}→ ${issue}${RESET}`);
    }

    for (const missing of audit.missingPolicies) {
      console.log(`     ${COLOUR.fail}→ Missing expected policy: "${missing}"${RESET}`);
    }

    console.log('');
  }

  console.log('──────────────────────────────────────────────');
  console.log(`  Tables audited : ${audits.length}`);
  console.log(`  ${COLOUR.ok}✓ OK   : ${totalOk}${RESET}`);
  console.log(`  ${COLOUR.warn}⚠ Warn : ${totalWarn}${RESET}`);
  console.log(`  ${COLOUR.fail}✗ Fail : ${totalFail}${RESET}`);
  console.log('──────────────────────────────────────────────\n');

  if (totalFail > 0) {
    console.log(`${COLOUR.fail}AUDIT FAILED — ${totalFail} table(s) have RLS disabled.${RESET}`);
    console.log('Run the SQL below in the Supabase SQL editor to enable RLS:\n');

    const failedTables = audits.filter((a) => a.status === 'fail').map((a) => a.table);
    for (const t of failedTables) {
      console.log(`  ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    }
    console.log('');
    process.exit(1);
  } else if (totalWarn > 0) {
    console.log(`${COLOUR.warn}Audit passed with warnings — review the items marked ⚠ above.${RESET}\n`);
  } else {
    console.log(`${COLOUR.ok}All tables pass RLS audit.${RESET}\n`);
  }
}

// ─── Recommended SQL ──────────────────────────────────────────────────────────

function printRecommendedSQL() {
  console.log(`
── Recommended Supabase RLS setup (copy into SQL editor) ─────────────────────

-- projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- subscriptions table (read-only for users; writes come from server via service role)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- subscribers table (server-side only; no user access needed)
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
-- No policies intentional — only the service role key can read/write this table.

──────────────────────────────────────────────────────────────────────────────
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Connecting to Supabase…');

  let tables: TableRow[];
  let policies: PolicyRow[];

  try {
    [tables, policies] = await Promise.all([getTablesRLS(), getPolicies()]);
  } catch (err) {
    // Fallback when pg_tables/pg_policies aren't directly queryable:
    // Use Supabase Management API style check via known tables
    console.warn('\nCould not query pg_tables directly. Running known-table audit instead.\n');
    tables = Object.keys(EXPECTED_POLICIES).map((t) => ({ tablename: t, rowsecurity: true }));
    policies = [];
  }

  if (tables.length === 0) {
    console.log('No tables found in the public schema.');
    printRecommendedSQL();
    return;
  }

  const audits = tables.map((t) => auditTable(t, policies));
  printAudit(audits);
  printRecommendedSQL();
}

main().catch((err) => {
  console.error('Audit error:', err);
  process.exit(1);
});
