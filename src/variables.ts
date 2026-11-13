import type { CompanionVariableDefinitions } from '@companion-module/base'
import { GPI_INPUTS, MAX_PRESETS } from './logic.js'
import type ModuleInstance from './main.js'

export type VariablesSchema = Record<string, string | number | boolean>

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: CompanionVariableDefinitions<VariablesSchema> = {
		active_preset: { name: 'Active preset number' },
		active_preset_name: { name: 'Active preset name' },
		node_name: { name: 'Node name' },
		temperature: { name: 'Processor temperature (C)' },
		cpu_load: { name: 'CPU load (%)' },
		zone_role: { name: 'Zone role' },
		input_state: { name: 'Input state: ok, lost or none' },
		input_source: { name: 'Input source IP' },
		input_fps: { name: 'Input packets per second' },
	}
	for (let number = 1; number <= MAX_PRESETS; number++) {
		definitions[`preset_${number}_name`] = { name: `Preset ${number} name` }
	}
	for (let input = 1; input <= GPI_INPUTS; input++) {
		definitions[`gpi_${input}_closed`] = { name: `GPI input ${input} closed (px4i only)` }
		definitions[`gpi_${input}_count`] = { name: `GPI input ${input} closures since start (px4i only)` }
	}
	self.setVariableDefinitions(definitions)
}
