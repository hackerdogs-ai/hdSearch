// BFF proxy → PUT /v1/setup/config (save endpoints). Forwards the signed-in user
// so the API can enforce admin-only edits after first-run setup is complete.
import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const body = await req.text();
  const user = getSession();
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-hd-internal': config.internalSecret };
  if (user?.sub) headers['x-hd-user'] = user.sub;
  try {
    const r = await fetch(`${config.apiUrl}/v1/setup/config`, { method: 'PUT', headers, body, cache: 'no-store' });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: 'api_unreachable', message: (e as Error).message }, { status: 502 });
  }
}
