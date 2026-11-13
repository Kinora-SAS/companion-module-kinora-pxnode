import type { SomeCompanionActionInputField } from '@companion-module/base'
import type { ActivePreset } from './client.js'
import {
	channelString,
	GPI_INPUTS,
	MAX_FADE_MS,
	presetChoices,
	presetIndex,
	stepIndex,
	type Direction,
} from './logic.js'
import type ModuleInstance from './main.js'

type Switch = 'on' | 'off' | 'toggle'
type Fade = { fade_ms: number; zone: boolean }

export type ActionsSchema = {
	launch_preset: { options: Fade & { preset: number } }
	step_preset: { options: Fade & { direction: Direction } }
	blackout: { options: Fade & { state: Switch } }
	full_color: { options: Fade & { state: Switch; channels: string[] } }
	identify: { options: Record<string, never> }
	gpi: { options: { input: number; state: 'press' | 'release' } }
}

const fadeOptions: SomeCompanionActionInputField<'fade_ms' | 'zone'>[] = [
	{
		type: 'number',
		id: 'fade_ms',
		label: 'Fade (ms)',
		default: 0,
		min: 0,
		max: MAX_FADE_MS,
		asInteger: true,
		clampValues: true,
	},
	{
		type: 'checkbox',
		id: 'zone',
		label: 'Whole zone',
		default: false,
	},
]

const switchOption: SomeCompanionActionInputField<'state'> = {
	type: 'dropdown',
	id: 'state',
	label: 'State',
	default: 'toggle',
	disableAutoExpression: true,
	choices: [
		{ id: 'toggle', label: 'Toggle' },
		{ id: 'on', label: 'On' },
		{ id: 'off', label: 'Off' },
	],
}

export function UpdateActions(self: ModuleInstance): void {
	const presets = self.connection?.state?.presets ?? []

	/** The API's field for a switch: toggles read the node first, as the last poll may be out of date. */
	const resolve = async (state: Switch, path: string): Promise<boolean> => {
		if (state !== 'toggle') return state === 'on'
		const { on } = await self.client().get<{ on: boolean }>(path)
		return !on
	}

	self.setActionDefinitions({
		launch_preset: {
			name: 'Launch preset',
			description: 'Presets show in Standalone mode only',
			options: [
				{
					type: 'dropdown',
					id: 'preset',
					label: 'Preset',
					default: 1,
					choices: presetChoices(presets),
				},
				...fadeOptions,
			],
			callback: async ({ options }) => {
				await self.run('Launch preset', async (client, state) => {
					const preset = presetIndex(options.preset, state.presets.length)
					if (preset === undefined) {
						self.log('warn', `Launch preset: the node has no preset ${options.preset}`)
						return
					}
					await client.put('presets/active', { preset, fade_ms: options.fade_ms, group: options.zone })
				})
			},
		},
		step_preset: {
			name: 'Next, previous or random preset',
			description: 'Random picks any preset but the one shown',
			options: [
				{
					type: 'dropdown',
					id: 'direction',
					label: 'Go to',
					default: 'next',
					choices: [
						{ id: 'next', label: 'Next' },
						{ id: 'previous', label: 'Previous' },
						{ id: 'random', label: 'Random' },
					],
				},
				...fadeOptions,
			],
			callback: async ({ options }) => {
				await self.run('Step preset', async (client, state) => {
					const { preset: active } = await client.get<ActivePreset>('presets/active')
					const preset = stepIndex(active, state.presets.length, options.direction)
					if (preset === active) return
					await client.put('presets/active', { preset, fade_ms: options.fade_ms, group: options.zone })
				})
			},
		},
		blackout: {
			name: 'Blackout',
			options: [switchOption, ...fadeOptions],
			callback: async ({ options }) => {
				await self.run('Blackout', async (client) => {
					const on = await resolve(options.state, 'blackout')
					await client.put('blackout', { on, fade_ms: options.fade_ms, group: options.zone })
				})
			},
		},
		full_color: {
			name: 'Full colour',
			options: [
				switchOption,
				{
					type: 'multidropdown',
					id: 'channels',
					label: 'Channels',
					default: ['r', 'g', 'b', 'w'],
					minSelection: 1,
					sortSelection: true,
					isVisibleExpression: `$(options:state) != 'off'`,
					choices: [
						{ id: 'r', label: 'Red' },
						{ id: 'g', label: 'Green' },
						{ id: 'b', label: 'Blue' },
						{ id: 'w', label: 'White' },
					],
				},
				...fadeOptions,
			],
			callback: async ({ options }) => {
				await self.run('Full colour', async (client) => {
					const on = await resolve(options.state, 'full-color')
					const channels = channelString(options.channels)
					if (on && !channels) {
						self.log('warn', 'Full colour: choose at least one channel')
						return
					}
					await client.put('full-color', {
						on,
						...(on ? { channels } : {}),
						fade_ms: options.fade_ms,
						group: options.zone,
					})
				})
			},
		},
		identify: {
			name: 'Identify node',
			options: [],
			callback: async () => {
				await self.run('Identify', async (client) => client.post('actions/identify'))
			},
		},
		gpi: {
			name: 'GPI input (px4i only)',
			description: 'A hold input stays closed until it gets a release: put Press on button down, Release on button up',
			options: [
				{
					type: 'number',
					id: 'input',
					label: 'Input',
					default: 1,
					min: 1,
					max: GPI_INPUTS,
					asInteger: true,
				},
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'press',
					choices: [
						{ id: 'press', label: 'Press' },
						{ id: 'release', label: 'Release' },
					],
				},
			],
			callback: async ({ options }) => {
				await self.setGpi(Number(options.input), options.state === 'press')
			},
		},
	})
}
