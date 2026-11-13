import { InstanceStatus } from '@companion-module/base'
import {
	API_VERSION,
	PxnodeError,
	type ActivePreset,
	type NodeInfo,
	type Preset,
	type PxnodeClient,
	type Stats,
} from './client.js'

/** Failed polls in a row before the node counts as gone: one slow answer must not flash every button. */
const FAILURES_BEFORE_LOST = 3
/** The longest a node makes a client wait after a wrong password. */
const PASSWORD_WAIT_MS = 16000

export type NodeState = {
	node: NodeInfo
	stats: Stats
	active: ActivePreset
	presets: Preset[]
}

export type ConnectionEvents = {
	onState(state: NodeState | undefined): void
	onStatus(status: InstanceStatus, message?: string): void
	onLog(level: 'debug' | 'info' | 'warn' | 'error', message: string): void
}

/**
 * Polls one node. The node has no push channel, so everything Companion shows comes from here. Polls
 * never overlap, and polling stops for good on a refused password: going on would only lock the node's
 * password check for longer.
 */
export class Connection {
	readonly client: PxnodeClient
	readonly #intervalMs: number
	readonly #events: ConnectionEvents

	#state: NodeState | undefined
	#node: NodeInfo | undefined
	#presets: Preset[] = []
	#version: string | undefined
	#failures = 0
	#status: InstanceStatus | undefined

	#timer: NodeJS.Timeout | undefined
	#polling = false
	#kicked = false
	#stopped = false
	#halted = false

	/** Inputs closed from Companion and not opened since. */
	readonly #held = new Set<number>()
	/** Inputs whose opening has not reached the node yet: a hold input would stay closed. */
	readonly #releases = new Set<number>()
	/** GPI requests go one at a time: on separate connections, a quick tap could arrive release first. */
	#gpi: Promise<void> = Promise.resolve()

	constructor(client: PxnodeClient, intervalMs: number, events: ConnectionEvents) {
		this.client = client
		this.#intervalMs = intervalMs
		this.#events = events
	}

	/** What the node showed at the last poll; undefined while it cannot be reached. */
	get state(): NodeState | undefined {
		return this.#state
	}

	start(): void {
		this.#setStatus(InstanceStatus.Connecting)
		void this.#poll()
	}

	/** Polls now, to show the result of an action without waiting for the next poll. */
	kick(): void {
		if (this.#stopped || this.#halted) return
		if (this.#polling) {
			this.#kicked = true
			return
		}
		clearTimeout(this.#timer)
		void this.#poll()
	}

	/** Stops polling and opens what Companion left closed: nothing else would. */
	async stop(): Promise<void> {
		this.#stopped = true
		clearTimeout(this.#timer)
		await this.#gpi.catch(() => {})
		const inputs = new Set([...this.#held, ...this.#releases])
		this.#held.clear()
		this.#releases.clear()
		if (this.#halted) return
		await Promise.allSettled([...inputs].map(async (input) => this.#sendGpi(input, false)))
	}

	/** Closes or opens an input. An opening that does not arrive is sent again once the node answers. */
	async setGpi(input: number, closed: boolean): Promise<void> {
		return this.#queueGpi(async () => {
			if (closed) {
				this.#releases.delete(input)
				if (!this.#state) throw new Error('the node is not connected')
				this.#held.add(input)
			} else {
				this.#held.delete(input)
				if (!this.#state) {
					this.#releases.add(input)
					throw new Error('the node is not connected')
				}
			}
			try {
				await this.#sendGpi(input, closed)
			} catch (error) {
				// refused, not lost: a pxnode 4 has no inputs, there is nothing to open later
				if (isRefusal(error)) this.#held.delete(input)
				else if (!closed) this.#releases.add(input)
				throw error
			}
		})
	}

	async #queueGpi(task: () => Promise<void>): Promise<void> {
		this.#gpi = this.#gpi.then(task, task)
		return this.#gpi
	}

	async #sendGpi(input: number, closed: boolean): Promise<void> {
		await this.client.post('gpi/press', { input, closed })
	}

	/** In the GPI queue: a late opening must not overtake a press made since. */
	async #sendReleases(): Promise<void> {
		return this.#queueGpi(async () => {
			for (const input of [...this.#releases]) {
				try {
					await this.#sendGpi(input, false)
				} catch (error) {
					if (!isRefusal(error)) throw error
				}
				this.#releases.delete(input)
			}
		})
	}

	async #poll(): Promise<void> {
		this.#polling = true
		let delay = this.#intervalMs
		try {
			await this.#read()
		} catch (error) {
			delay = this.#failed(error)
		}
		this.#polling = false
		if (this.#stopped || this.#halted) return
		if (this.#kicked) delay = 0
		this.#kicked = false
		this.#timer = setTimeout(() => void this.#poll(), delay)
	}

	async #read(): Promise<void> {
		if (!this.#node) {
			// the one route that never needs the password: tells what to expect before sending one
			const node = await this.client.get<NodeInfo>('node')
			if (node.api !== API_VERSION) {
				this.#halt(InstanceStatus.BadConfig, `Unsupported API version ${node.api}, firmware ${node.firmware}`)
				return
			}
			this.#node = node
		}

		const stats = await this.client.get<Stats>('stats')
		const active = await this.client.get<ActivePreset>('presets/active')

		const version = `${stats.config?.saves}/${stats.pxsync?.presets_version}`
		if (version !== this.#version) {
			const { presets } = await this.client.get<{ presets: Preset[] }>('presets')
			this.#node = await this.client.get<NodeInfo>('node')
			this.#presets = presets
			this.#version = version
		}
		if (this.#stopped) return

		if (this.#releases.size > 0) await this.#sendReleases()

		this.#failures = 0
		this.#state = { node: this.#node, stats, active, presets: this.#presets }
		this.#events.onState(this.#state)
		this.#setStatus(InstanceStatus.Ok)
	}

	/** Handles a failed poll, and says when to poll again. */
	#failed(error: unknown): number {
		if (this.#stopped) return 0
		const message = error instanceof Error ? error.message : String(error)

		if (error instanceof PxnodeError) {
			if (error.status === 401) {
				this.#halt(InstanceStatus.AuthenticationFailure, 'Password refused: check it in the connection settings')
				return 0
			}
			if (error.status === 429) {
				// another client's wrong password counts too: the node checks nothing until the wait is over
				this.#setStatus(InstanceStatus.UnknownWarning, 'Waiting after a wrong password')
				return PASSWORD_WAIT_MS
			}
		}

		this.#failures++
		this.#events.onLog('debug', `Poll failed: ${message}`)
		if (this.#failures === FAILURES_BEFORE_LOST) {
			this.#events.onLog('warn', `Node lost: ${message}`)
			this.#setStatus(InstanceStatus.ConnectionFailure, message)
			this.#lost()
		}
		return this.#intervalMs
	}

	#halt(status: InstanceStatus, message: string): void {
		this.#halted = true
		this.#events.onLog('error', message)
		this.#setStatus(status, message)
		this.#lost()
	}

	#setStatus(status: InstanceStatus, message?: string): void {
		if (status === this.#status) return
		this.#status = status
		this.#events.onStatus(status, message)
	}

	/** Forgets the node: what comes back at this address may be another one. */
	#lost(): void {
		this.#node = undefined
		this.#version = undefined
		this.#state = undefined
		this.#events.onState(undefined)
	}
}

function isRefusal(error: unknown): boolean {
	return error instanceof PxnodeError && error.status >= 400 && error.status < 500 && error.status !== 429
}
