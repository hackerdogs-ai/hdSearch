// BFF proxy → POST /v1/setup/test (reachability probe for the wizard's gated Next).
import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  try {
    const r = await fetch(`${config.apiUrl}/v1/setup/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hd-internal': config.internalSecret },
      body,
      cache: 'no-store',
    });
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
  } catch (e) {
    return NextResponse.json({ reachable: false, detail: (e as Error).message }, { status: 502 });
  }
}
