import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { UpdateActions } from '../dist/actions.js'
import { PxnodeClient } from '../dist/client.js'
import { UpdateFeedbacks } from '../dist/feedbacks.js'
import { UpdatePresets } from '../dist/presets.js'
import { FakeNode } from './fake-node.mjs'

let fake, actions, feedbacks, logs, state

/** What the actions need of the instance, without Companion around it. */
function instance(client) {
	return {
		label: 'pxnode',
		connection: { get state() { return state } }, // prettier-ignore
		client: () => client,
		log: (level, message) => logs.push(`${level}: ${message}`),
		run: async (_name, action) => {
			await action(client, state)
		},
		setGpi: async () => {},
		setActionDefinitions: (definitions) => (actions = definitions),
		setFeedbackDefinitions: (definitions) => (feedbacks = definitions),
	}
}

const fire = async (id, options) => actions[id].callback({ options }, {})
const writes = (path) => fake.seen(path).filter((request) => request.method === 'PUT')

beforeEach(async () => {
	fake = new FakeNode()
	const self = instance(new PxnodeClient(await fake.listen(), ''))
	logs = []
	state = {
		presets: fake.presets,
		active: { preset: 1, previewing: false },
		stats: { blackout: true, input: 'lost', gpi: [{ closed: true }] },
	}
	UpdateActions(self)
	UpdateFeedbacks(self)
})

afterEach(async () => fake.close())

test('launch sends the number less one, and the zone as group', async () => {
	await fire('launch_preset', { preset: 3, fade_ms: 500, zone: true })
	assert.deepEqual(writes('presets/active')[0].body, { preset: 2, fade_ms: 500, group: true })
})

test('launching an empty slot sends nothing and warns', async () => {
	await fire('launch_preset', { preset: 9, fade_ms: 0, zone: false })
	assert.equal(writes('presets/active').length, 0)
	assert.match(logs[0], /^warn: .*no preset 9/)
})

test('next starts from what the node shows now', async () => {
	fake.active.preset = 2
	await fire('step_preset', { direction: 'next', fade_ms: 0, zone: false })
	assert.equal(writes('presets/active')[0].body.preset, 0)
})

test('a toggle reads the node before writing', async () => {
	await fire('blackout', { state: 'toggle', fade_ms: 0, zone: false })
	const [read, write] = fake.seen('blackout')
	assert.equal(read.method, 'GET')
	assert.equal(write.method, 'PUT')
})

test('a fixed state does not read the node', async () => {
	await fire('blackout', { state: 'on', fade_ms: 0, zone: false })
	assert.equal(fake.seen('blackout').length, 1)
	assert.equal(fake.seen('blackout')[0].body.on, true)
})

test('full colour sends its channels when on, none when off', async () => {
	await fire('full_color', { state: 'on', channels: ['w', 'r'], fade_ms: 0, zone: false })
	await fire('full_color', { state: 'off', channels: ['r'], fade_ms: 100, zone: true })
	const [on, off] = writes('full-color')
	assert.deepEqual(on.body, { on: true, channels: 'rw', fade_ms: 0, group: false })
	assert.deepEqual(off.body, { on: false, fade_ms: 100, group: true })
})

test('full colour without a channel sends nothing', async () => {
	await fire('full_color', { state: 'on', channels: [], fade_ms: 0, zone: false })
	assert.equal(writes('full-color').length, 0)
})

test('feedbacks read the state, the preset by its number from 1', () => {
	const check = (id, options = {}) => feedbacks[id].callback({ options }, {})
	assert.equal(check('preset_active', { preset: 2 }), true)
	assert.equal(check('preset_active', { preset: 1 }), false)
	assert.equal(check('blackout_on'), true)
	assert.equal(check('input_lost'), true)
	assert.equal(check('gpi_closed', { input: 1 }), true)
	assert.equal(check('gpi_closed', { input: 4 }), false)
	assert.equal(check('full_color_on'), false)
})

test('feedbacks are off without a node', () => {
	state = undefined
	assert.equal(feedbacks.preset_active.callback({ options: { preset: 1 } }, {}), false)
	assert.equal(feedbacks.blackout_on.callback({ options: {} }, {}), false)
})

test('the button presets all use actions and feedbacks that exist', () => {
	let structure, presets
	UpdatePresets({
		label: 'pxnode',
		setPresetDefinitions: (s, p) => ([structure, presets] = [s, p]),
	})
	const ids = structure.flatMap((section) => section.definitions)
	assert.deepEqual(ids.toSorted(), Object.keys(presets).toSorted())
	assert.equal(ids.length, 12 + 3 + 3 + 4)
	for (const preset of Object.values(presets)) {
		for (const { actionId } of [...preset.steps[0].down, ...preset.steps[0].up]) assert.ok(actions[actionId], actionId)
		for (const { feedbackId } of preset.feedbacks) assert.ok(feedbacks[feedbackId], feedbackId)
	}
	assert.equal(presets.preset_3.steps[0].down[0].options.preset, 3)
	assert.match(presets.preset_3.style.text, /\$\(pxnode:preset_3_name\)/)
})
