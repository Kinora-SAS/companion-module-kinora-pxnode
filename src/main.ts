import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { PxnodeClient } from './client.js'
import { GetConfigFields, pollInterval, type ModuleConfig, type ModuleSecrets } from './config.js'
import { Connection, type NodeState } from './connection.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { variableValues } from './logic.js'
import { UpdatePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	connection: Connection | undefined
	#presetNames = ''
	#feedbackState = ''
	#variables: Record<string, string | number | boolean> = {}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
		UpdateVariableDefinitions(this)
		await this.configUpdated(config, secrets)
	}

	async destroy(): Promise<void> {
		await this.connection?.stop()
		this.connection = undefined
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		await this.destroy()
		this.#onState(undefined)

		if (!config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter the IP address of the node')
			return
		}
		this.connection = new Connection(new PxnodeClient(config.host, secrets?.password ?? ''), pollInterval(config), {
			onState: (state) => this.#onState(state),
			onStatus: (status, message) => this.updateStatus(status, message),
			onLog: (level, message) => this.log(level, message),
		})
		this.connection.start()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** The client of a connected node, for code already running inside {@link run}. */
	client(): PxnodeClient {
		if (!this.connection) throw new Error('no connection')
		return this.connection.client
	}

	/** Runs an action against the node, then polls to show its result at once. */
	async run(name: string, action: (client: PxnodeClient, state: NodeState) => Promise<unknown>): Promise<void> {
		const connection = this.connection
		if (!connection?.state) {
			this.log('warn', `${name}: the node is not connected`)
			return
		}
		try {
			await action(connection.client, connection.state)
		} catch (error) {
			this.log('error', `${name}: ${error instanceof Error ? error.message : String(error)}`)
		}
		connection.kick()
	}

	async setGpi(input: number, closed: boolean): Promise<void> {
		const connection = this.connection
		if (!connection) return
		try {
			await connection.setGpi(input, closed)
		} catch (error) {
			this.log('error', `GPI input ${input}: ${error instanceof Error ? error.message : String(error)}`)
		}
		connection.kick()
	}

	#onState(state: NodeState | undefined): void {
		if (state) {
			// the dropdowns show the names of the node's list
			const names = JSON.stringify(state.presets.map((preset) => preset.name))
			if (names !== this.#presetNames) {
				this.#presetNames = names
				UpdateActions(this)
				UpdateFeedbacks(this)
			}
		}

		const values = variableValues(state)
		const changed = Object.fromEntries(Object.entries(values).filter(([id, value]) => this.#variables[id] !== value))
		if (Object.keys(changed).length > 0) this.setVariableValues(changed)
		this.#variables = values

		const feedbackState = JSON.stringify([
			state?.active.preset,
			state?.active.previewing,
			state?.presets.length,
			state?.stats.blackout,
			state?.stats.full_color,
			state?.stats.input,
			state?.stats.gpi?.map((gpi) => gpi.closed),
		])
		if (feedbackState !== this.#feedbackState) {
			this.#feedbackState = feedbackState
			this.checkAllFeedbacks()
		}
	}
}
