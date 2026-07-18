// BFF proxy → GET /v1/setup/status (adds the internal secret server-side).
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const r = await fetch(`${config.apiUrl}/v1/setup/status`, {
      headers: { 'x-hd-internal': config.internalSecret },
      cache: 'no-store',
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch (e) {
    return NextResponse.json({ error: 'api_unreachable', message: (e as Error).message }, { status: 502 });
  }
}
