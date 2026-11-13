import { GPI_INPUTS, presetChoices, presetIndex } from './logic.js'
import type ModuleInstance from './main.js'

export type FeedbacksSchema = {
	preset_active: { type: 'boolean'; options: { preset: number } }
	preview_running: { type: 'boolean'; options: Record<string, never> }
	blackout_on: { type: 'boolean'; options: Record<string, never> }
	full_color_on: { type: 'boolean'; options: Record<string, never> }
	input_lost: { type: 'boolean'; options: Record<string, never> }
	gpi_closed: { type: 'boolean'; options: { input: number } }
}

/** The colours of the node's web page. */
export const ON = { bgcolor: 0x38bdf8, color: 0x0b1222 }
export const ALERT = { bgcolor: 0xf87171, color: 0x0b1222 }

export function UpdateFeedbacks(self: ModuleInstance): void {
	const state = () => self.connection?.state

	self.setFeedbackDefinitions({
		preset_active: {
			name: 'Preset is active',
			type: 'boolean',
			defaultStyle: ON,
			options: [
				{
					type: 'dropdown',
					id: 'preset',
					label: 'Preset',
					default: 1,
					choices: presetChoices(state()?.presets ?? []),
				},
			],
			callback: ({ options }) => {
				const current = state()
				return current !== undefined && presetIndex(options.preset, current.presets.length) === current.active.preset
			},
		},
		preview_running: {
			name: 'Preview running',
			type: 'boolean',
			defaultStyle: ON,
			options: [],
			callback: () => state()?.active.previewing ?? false,
		},
		blackout_on: {
			name: 'Blackout on',
			type: 'boolean',
			defaultStyle: ALERT,
			options: [],
			callback: () => state()?.stats.blackout ?? false,
		},
		full_color_on: {
			name: 'Full colour on',
			type: 'boolean',
			defaultStyle: ON,
			options: [],
			callback: () => state()?.stats.full_color ?? false,
		},
		input_lost: {
			name: 'Input lost',
			type: 'boolean',
			defaultStyle: ALERT,
			options: [],
			callback: () => state()?.stats.input === 'lost',
		},
		gpi_closed: {
			name: 'GPI input closed (px4i only)',
			type: 'boolean',
			defaultStyle: ON,
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
			],
			callback: ({ options }) => state()?.stats.gpi?.[Number(options.input) - 1]?.closed ?? false,
		},
	})
}
