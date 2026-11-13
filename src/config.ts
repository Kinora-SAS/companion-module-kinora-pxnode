import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export const DEFAULT_POLL_MS = 1000
const MIN_POLL_MS = 500
const MAX_POLL_MS = 10000

export type ModuleConfig = {
	host: string
	pollInterval: number
}

export type ModuleSecrets = {
	password: string
}

export function pollInterval(config: ModuleConfig): number {
	const interval = Number(config.pollInterval) || DEFAULT_POLL_MS
	return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, interval))
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Node IP address',
			width: 6,
			regex: Regex.IP,
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'Password',
			description: 'Only if the node has one',
			width: 6,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (ms)',
			description: 'How often the node is read. Changes made elsewhere show up after this time',
			width: 6,
			min: MIN_POLL_MS,
			max: MAX_POLL_MS,
			default: DEFAULT_POLL_MS,
		},
	]
}
