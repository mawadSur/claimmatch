/**
 * Read-only probes that the code needs after migrations 0010–0012.
 * Used by /api/health/schema. Never returns row data or secrets.
 */

export interface SchemaProbeError {
  message: string;
  code?: string;
}

export interface SchemaProbeClient {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (n: number) => PromiseLike<{ error: SchemaProbeError | null }>;
    };
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: SchemaProbeError | null }>;
}

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  lawsuits: ['last_seen_at', 'missed_feed_count'],
  profiles: ['first_ref'],
  share_links: ['id'],
  share_link_clicks: ['id'],
};

export const REQUIRED_FUNCTIONS = ['persist_first_attribution'] as const;

export interface SchemaCheckResult {
  ok: boolean;
  present: string[];
  missing: string[];
}

function isMissingRelation(error: SchemaProbeError): boolean {
  const code = error.code ?? '';
  const msg = error.message.toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}

function isMissingColumn(error: SchemaProbeError): boolean {
  const code = error.code ?? '';
  const msg = error.message.toLowerCase();
  return (
    code === '42703' ||
    msg.includes('column') && (msg.includes('does not exist') || msg.includes('could not find'))
  );
}

function isMissingFunction(error: SchemaProbeError): boolean {
  const code = error.code ?? '';
  const msg = error.message.toLowerCase();
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
}

async function probeTable(
  client: SchemaProbeClient,
  table: string,
  columns: string[],
): Promise<{ present: string[]; missing: string[] }> {
  const present: string[] = [];
  const missing: string[] = [];
  const { error } = await client.from(table).select(columns.join(',')).limit(0);
  if (!error) {
    present.push(table, ...columns.map((c) => `${table}.${c}`));
    return { present, missing };
  }
  if (isMissingRelation(error)) {
    missing.push(table, ...columns.map((c) => `${table}.${c}`));
    return { present, missing };
  }
  if (isMissingColumn(error)) {
    present.push(table);
    for (const column of columns) {
      const one = await client.from(table).select(column).limit(0);
      if (!one.error) present.push(`${table}.${column}`);
      else if (isMissingColumn(one.error) || isMissingRelation(one.error)) {
        missing.push(`${table}.${column}`);
      } else {
        // Unexpected error: treat the column as present so a flaky probe
        // does not page the catalog. The table-level miss is the 503 case.
        present.push(`${table}.${column}`);
      }
    }
    return { present, missing };
  }
  // Privilege / network / "not signed in" style errors mean the object exists.
  present.push(table, ...columns.map((c) => `${table}.${c}`));
  return { present, missing };
}

async function probeFunction(
  client: SchemaProbeClient,
  name: string,
): Promise<{ present: string[]; missing: string[] }> {
  const { error } = await client.rpc(name, {
    p_utm_source: '',
    p_utm_medium: '',
    p_utm_campaign: '',
    p_utm_content: '',
    p_ref: '',
  });
  if (!error || !isMissingFunction(error)) {
    return { present: [name], missing: [] };
  }
  return { present: [], missing: [name] };
}

/** Confirm the columns and functions the app needs exist. Read-only probes. */
export async function checkRequiredSchema(client: SchemaProbeClient): Promise<SchemaCheckResult> {
  const present: string[] = [];
  const missing: string[] = [];

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const result = await probeTable(client, table, columns);
    present.push(...result.present);
    missing.push(...result.missing);
  }
  for (const fn of REQUIRED_FUNCTIONS) {
    const result = await probeFunction(client, fn);
    present.push(...result.present);
    missing.push(...result.missing);
  }

  return { ok: missing.length === 0, present, missing };
}
