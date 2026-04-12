type ApiErrorPayload = {
    ok: false
    error: string
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
    return Boolean(
        value &&
        typeof value === 'object' &&
        'ok' in value &&
        (value as { ok: unknown }).ok === false &&
        'error' in value &&
        typeof (value as { error: unknown }).error === 'string',
    )
}

export async function parseApiJson<T>(response: Response, fallbackErrorMessage: string): Promise<T | ApiErrorPayload> {
    const rawText = await response.text()

    if (!rawText.trim()) {
        if (!response.ok) {
            return { ok: false, error: `${fallbackErrorMessage} (HTTP ${response.status})` }
        }

        return { ok: false, error: 'Server returned an empty response.' }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(rawText)
    } catch {
        if (!response.ok) {
            return { ok: false, error: `${fallbackErrorMessage} (HTTP ${response.status})` }
        }

        return { ok: false, error: 'Server returned an invalid JSON response.' }
    }

    if (isApiErrorPayload(parsed)) {
        return parsed
    }

    if (!response.ok) {
        return { ok: false, error: fallbackErrorMessage }
    }

    return parsed as T
}