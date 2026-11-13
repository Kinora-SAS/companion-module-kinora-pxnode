export const API_VERSION = 1
const TIMEOUT_MS = 2000
const BUSY_RETRIES = 2
const BUSY_RETRY_MS = 100

export type NodeInfo = {
	name: string
	model: string
	firmware: string
	api: number
	password?: boolean
}

export type GpiState = { closed: boolean; closed_ms: number; count: number }

export type Stats = {
	input: 'ok' | 'lost' | 'none'
	input_source: string
	input_fps: number
	temperature_c: number | null
	cpu_load: number
	blackout: boolean
	full_color?: boolean
	gpi?: GpiState[]
	config?: { saves: number }
	pxsync?: { role: string; presets_version: number }
}

export type ActivePreset = { preset: number; name: string; fading: boolean; previewing: boolean }
export type Preset = { name: string }

/** An HTTP answer other than 2xx, with the error code the node gave. */
export class PxnodeError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message)
	}
}

/** The node's HTTP API: HTTP/1.0, one request per connection, JSON both ways. */
export class PxnodeClient {
	readonly #base: string
	readonly #authorization: string | undefined

	constructor(host: string, password: string) {
		this.#base = `http://${host}`
		this.#authorization = password ? 'Basic ' + Buffer.from(`:${password}`).toString('base64') : undefined
	}

	async get<T>(path: string): Promise<T> {
		return this.#request<T>('GET', path)
	}

	async put<T>(path: string, body: object): Promise<T> {
		return this.#request<T>('PUT', path, body)
	}

	async post<T>(path: string, body: object = {}): Promise<T> {
		return this.#request<T>('POST', path, body)
	}

	async #request<T>(method: string, path: string, body?: object): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			try {
				return await this.#once<T>(method, path, body)
			} catch (error) {
				// the node has 8 connections: busy means try again shortly
				if (!(error instanceof PxnodeError) || error.status !== 503 || attempt >= BUSY_RETRIES) throw error
				await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS))
			}
		}
	}

	async #once<T>(method: string, path: string, body?: object): Promise<T> {
		const headers: Record<string, string> = {}
		if (this.#authorization) headers.Authorization = this.#authorization
		if (body) headers['Content-Type'] = 'application/json'

		const response = await fetch(`${this.#base}/api/${path}`, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
		const text = await response.text()

		let json: unknown
		try {
			json = JSON.parse(text)
		} catch {
			throw new PxnodeError(response.status, 'response', `${path}: answer is not JSON (HTTP ${response.status})`)
		}
		if (!response.ok) {
			const { error, field, message } = json as { error?: string; field?: string; message?: string }
			const detail = [error, field, message].filter(Boolean).join(' ')
			throw new PxnodeError(response.status, error ?? 'http', `${path}: ${detail || `HTTP ${response.status}`}`)
		}
		return json as T
	}
}
