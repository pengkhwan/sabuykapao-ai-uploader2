export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { sanity } from '../../../../lib/sanity' // ไม่มี /src/

// CORS ครอบทุก response
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
  Vary: 'Origin',
}

const toPub = (id?: string) =>
  id && id.startsWith('drafts.') ? id.slice(7) : (id || '')

async function readTocOnly(docId: string) {
  const q = `*[_id == $id][0]{ "items": coalesce(aiPreview.result.toc, []) }`
  const res = await sanity.fetch(q, { id: docId })
  return Array.isArray(res?.items) ? res.items : []
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const docId = toPub(searchParams.get('docId') || '')
    const debug = searchParams.get('debug') === '1'
    if (!docId) {
      return NextResponse.json(
        { ok: false, error: 'Missing docId' },
        { status: 400, headers: CORS },
      )
    }

    const items = await readTocOnly(docId)
    const body: any = { ok: true, count: items.length, items }

    // ใส่ข้อมูลดิบเพิ่มเมื่อ debug=1
    if (debug) {
      body._debug = { docId }
    }

    return NextResponse.json(body, { status: 200, headers: CORS })
  } catch (e: any) {
    console.error('[get-toc][GET] error:', e?.responseBody || e?.message || e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500, headers: CORS },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    let json: any = null
    try { json = await req.json() } catch {}

    const docId = toPub(json?.docId)
    const debug = !!json?.debug

    if (!docId) {
      return NextResponse.json(
        { ok: false, error: 'Missing docId' },
        { status: 400, headers: CORS },
      )
    }

    const items = await readTocOnly(docId)
    const body: any = { ok: true, count: items.length, items }
    if (debug) body._debug = { docId }

    return NextResponse.json(body, { status: 200, headers: CORS })
  } catch (e: any) {
    console.error('[get-toc][POST] error:', e?.responseBody || e?.message || e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500, headers: CORS },
    )
  }
}
