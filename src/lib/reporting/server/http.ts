import { NextRequest, NextResponse } from 'next/server'

type ApiErrorPayload = {
    ok: false
    error: string
}

type ParsedJsonBody<T> =
    | { ok: true; data: T }
    | { ok: false; response: NextResponse<ApiErrorPayload> }

function jsonError(error: string, status: number) {
    return NextResponse.json<ApiErrorPayload>({ ok: false, error }, { status })
}

export async function parseJsonBody<T>(request: NextRequest): Promise<ParsedJsonBody<T>> {
    try {
        const data = (await request.json()) as T
        return { ok: true, data }
    } catch {
        return {
            ok: false,
            response: jsonError('Invalid JSON request body.', 400),
        }
    }
}

export function jsonUnexpectedError(error: unknown, fallbackError: string) {
    const shouldExposeMessage = process.env.NODE_ENV !== 'production'
    const message =
        shouldExposeMessage && error instanceof Error && error.message
            ? error.message
            : fallbackError

    console.error(error)
    return jsonError(message, 500)
}