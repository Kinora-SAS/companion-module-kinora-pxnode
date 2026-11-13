import type { DropdownChoice } from '@companion-module/base'
import type { Preset } from './client.js'
import type { NodeState } from './connection.js'

/** The most presets a node holds. Companion numbers them from 1, the API from 0. */
export const MAX_PRESETS = 12
export const GPI_INPUTS = 4
export const MAX_FADE_MS = 600000

export type Direction = 'next' | 'previous' | 'random'

/** A Companion preset number as an index of the node's list, or undefined if that slot is empty. */
export function presetIndex(number: unknown, count: number): number | undefined {
	const index = Number(number) - 1
	return Number.isInteger(index) && index >= 0 && index < count ? index : undefined
}

/** The index to go to from the one shown. Next and previous wrap, as on the px4i's inputs. */
export function stepIndex(active: number, count: number, direction: Direction, random = Math.random): number {
	if (direction === 'next') return (active + 1) % count
	if (direction === 'previous') return (active - 1 + count) % count
	if (count < 2) return active
	// any preset but the one shown
	return (active + 1 + Math.floor(random() * (count - 1))) % count
}

export function presetChoices(presets: Preset[]): DropdownChoice<number>[] {
	const choices: DropdownChoice<number>[] = []
	for (let number = 1; number <= MAX_PRESETS; number++) {
		const preset = presets[number - 1]
		choices.push({ id: number, label: preset ? `${number}: ${preset.name}` : `${number}` })
	}
	return choices
}

/** The letters the API takes, whatever order they were selected in. */
export function channelString(channels: unknown): string {
	const selected = Array.isArray(channels) ? channels : []
	return ['r', 'g', 'b', 'w'].filter((channel) => selected.includes(channel)).join('')
}

export function variableValues(state: NodeState | undefined): Record<string, string | number | boolean> {
	const values: Record<string, string | number | boolean> = {
		active_preset: state ? state.active.preset + 1 : '',
		active_preset_name: state?.active.name ?? '',
		node_name: state?.node.name ?? '',
		temperature: state?.stats.temperature_c ?? '',
		cpu_load: state?.stats.cpu_load ?? '',
		zone_role: state?.stats.pxsync?.role ?? '',
		input_state: state?.stats.input ?? '',
		input_source: state?.stats.input_source ?? '',
		input_fps: state?.stats.input_fps ?? '',
	}
	for (let number = 1; number <= MAX_PRESETS; number++) {
		values[`preset_${number}_name`] = state?.presets[number - 1]?.name ?? ''
	}
	for (let input = 1; input <= GPI_INPUTS; input++) {
		const gpi = state?.stats.gpi?.[input - 1]
		values[`gpi_${input}_closed`] = gpi?.closed ?? ''
		values[`gpi_${input}_count`] = gpi?.count ?? ''
	}
	return values
}
