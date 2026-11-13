import type {
	CompanionButtonStyleProps,
	CompanionPresetDefinitions,
	CompanionPresetSection,
} from '@companion-module/base'
import { ALERT, ON } from './feedbacks.js'
import { GPI_INPUTS, MAX_PRESETS, type Direction } from './logic.js'
import type { ModuleSchema } from './main.js'
import type ModuleInstance from './main.js'

const BACKGROUND = 0x0b1222
const FADE = { fade_ms: 0, zone: false }

function style(text: string): CompanionButtonStyleProps {
	return { text, size: 'auto', color: 0xffffff, bgcolor: BACKGROUND }
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const ids = { presets: [] as string[], navigation: [] as string[], outputs: [] as string[], gpi: [] as string[] }

	for (let number = 1; number <= MAX_PRESETS; number++) {
		const id = `preset_${number}`
		ids.presets.push(id)
		presets[id] = {
			type: 'simple',
			name: `Preset ${number}`,
			style: style(`${number}\n$(${self.label}:preset_${number}_name)`),
			steps: [{ down: [{ actionId: 'launch_preset', options: { preset: number, ...FADE } }], up: [] }],
			feedbacks: [{ feedbackId: 'preset_active', options: { preset: number }, style: ON }],
		}
	}

	const steps: [Direction, string][] = [
		['previous', 'Previous'],
		['next', 'Next'],
		['random', 'Random'],
	]
	for (const [direction, name] of steps) {
		const id = `step_${direction}`
		ids.navigation.push(id)
		presets[id] = {
			type: 'simple',
			name: `${name} preset`,
			style: style(name),
			steps: [{ down: [{ actionId: 'step_preset', options: { direction, ...FADE } }], up: [] }],
			feedbacks: [],
		}
	}

	ids.outputs.push('blackout', 'full_color', 'identify')
	presets['blackout'] = {
		type: 'simple',
		name: 'Blackout',
		style: style('Blackout'),
		steps: [{ down: [{ actionId: 'blackout', options: { state: 'toggle', ...FADE } }], up: [] }],
		feedbacks: [{ feedbackId: 'blackout_on', options: {}, style: ALERT }],
	}
	presets['full_color'] = {
		type: 'simple',
		name: 'Full colour',
		style: style('Full colour'),
		steps: [
			{
				down: [{ actionId: 'full_color', options: { state: 'toggle', channels: ['r', 'g', 'b', 'w'], ...FADE } }],
				up: [],
			},
		],
		feedbacks: [{ feedbackId: 'full_color_on', options: {}, style: ON }],
	}
	presets['identify'] = {
		type: 'simple',
		name: 'Identify node',
		style: style('Identify'),
		steps: [{ down: [{ actionId: 'identify', options: {} }], up: [] }],
		feedbacks: [],
	}

	for (let input = 1; input <= GPI_INPUTS; input++) {
		const id = `gpi_${input}`
		ids.gpi.push(id)
		presets[id] = {
			type: 'simple',
			name: `GPI input ${input}`,
			style: style(`IN ${input}`),
			steps: [
				{
					down: [{ actionId: 'gpi', options: { input, state: 'press' } }],
					up: [{ actionId: 'gpi', options: { input, state: 'release' } }],
				},
			],
			feedbacks: [{ feedbackId: 'gpi_closed', options: { input }, style: ON }],
		}
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{ id: 'presets', name: 'Presets', definitions: ids.presets },
		{ id: 'navigation', name: 'Navigation', definitions: ids.navigation },
		{ id: 'outputs', name: 'Outputs', definitions: ids.outputs },
		{ id: 'gpi', name: 'GPI (px4i only)', definitions: ids.gpi },
	]
	self.setPresetDefinitions(structure, presets)
}
