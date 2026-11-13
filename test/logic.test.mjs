import assert from 'node:assert/strict'
import { test } from 'node:test'
import { channelString, presetChoices, presetIndex, stepIndex, variableValues } from '../dist/logic.js'

test('Companion numbers presets from 1, the API from 0', () => {
	assert.equal(presetIndex(1, 8), 0)
	assert.equal(presetIndex(8, 8), 7)
	assert.equal(presetIndex('3', 8), 2)
})

test('an empty slot or an invalid number gives no preset', () => {
	for (const number of [0, 9, 12, -1, 1.5, 'x', undefined]) assert.equal(presetIndex(number, 8), undefined)
})

test('next and previous wrap', () => {
	assert.equal(stepIndex(7, 8, 'next'), 0)
	assert.equal(stepIndex(0, 8, 'previous'), 7)
})

test('random never picks the preset shown', () => {
	for (const value of [0, 0.5, 0.999])
		assert.notEqual(
			stepIndex(3, 8, 'random', () => value),
			3,
		)
	assert.equal(stepIndex(0, 1, 'random'), 0)
})

test('the dropdown has 12 choices and names the ones that exist', () => {
	const choices = presetChoices([{ name: 'Fire' }])
	assert.equal(choices.length, 12)
	assert.deepEqual(choices[0], { id: 1, label: '1: Fire' })
	assert.deepEqual(choices[11], { id: 12, label: '12' })
})

test('channels are sent in the API order', () => {
	assert.equal(channelString(['w', 'r']), 'rw')
	assert.equal(channelString(undefined), '')
})

test('variables are blank without a node and show the number from 1', () => {
	assert.equal(variableValues(undefined).active_preset, '')
	const state = {
		node: { name: 'Bench' },
		active: { preset: 0, name: 'Solid colour' },
		presets: [{ name: 'Solid colour' }],
		stats: { temperature_c: null, cpu_load: 3, input: 'ok', input_source: '', input_fps: 0 },
	}
	const values = variableValues(state)
	assert.equal(values.active_preset, 1)
	assert.equal(values.preset_1_name, 'Solid colour')
	assert.equal(values.preset_2_name, '')
	assert.equal(values.temperature, '')
	assert.equal(values.gpi_1_count, '')
})
