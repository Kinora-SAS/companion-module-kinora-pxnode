import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { InstanceStatus } from '@companion-module/base'
import { PxnodeClient, PxnodeError } from '../dist/client.js'
import { Connection } from '../dist/connection.js'
import { FakeNode } from './fake-node.mjs'

const POLL_MS = 20

let fake, host, connection, statuses

function connect(password = '') {
	statuses = []
	connection = new Connection(new PxnodeClient(host, password), POLL_MS, {
		onState: () => {},
		onStatus: (status) => statuses.push(status),
		onLog: () => {},
	})
	connection.start()
	return connection
}

async function until(condition, what) {
	for (let i = 0; i < 200; i++) {
		if (condition()) return
		await sleep(10)
	}
	assert.fail(`timed out waiting for ${what}`)
}

beforeEach(async () => {
	fake = new FakeNode()
	host = await fake.listen()
})

afterEach(async () => {
	await connection?.stop()
	connection = undefined
	await fake.close()
})

test('reads the node, including answers without Content-Length', async () => {
	connect()
	await until(() => connection.state, 'state')
	assert.equal(connection.state.node.model, 'px4i')
	assert.equal(connection.state.stats.temperature_c, 40)
	assert.equal(connection.state.active.name, 'Fire')
	assert.equal(connection.state.presets.length, 3)
	assert.equal(statuses.at(-1), InstanceStatus.Ok)
})

test('reads the preset list again only when it changes', async () => {
	connect()
	await until(() => fake.seen('stats').length >= 4, 'polls')
	assert.equal(fake.seen('presets').length, 1)
	fake.presets = [{ name: 'One' }]
	fake.stats.pxsync.presets_version = 2
	await until(() => connection.state.presets.length === 1, 'new list')
})

test('sends the password as Basic with an empty user name', async () => {
	fake.password = 'stage left'
	connect('stage left')
	await until(() => connection.state, 'state')
	assert.equal(fake.seen('stats')[0].authorization, 'Basic OnN0YWdlIGxlZnQ=')
})

test('a refused password stops polling for good', async () => {
	fake.password = 'right'
	connect('wrong')
	await until(() => statuses.includes(InstanceStatus.AuthenticationFailure), 'failure')
	const asked = fake.requests.length
	await sleep(POLL_MS * 5)
	connection.kick()
	await sleep(POLL_MS)
	assert.equal(fake.requests.length, asked)
	assert.equal(connection.state, undefined)
})

test('refuses an API version it does not know', async () => {
	fake.node.api = 2
	connect()
	await until(() => statuses.includes(InstanceStatus.BadConfig), 'bad config')
	assert.equal(fake.seen('stats').length, 0)
})

test('retries when the node is busy', async () => {
	fake.busy = 2
	const client = new PxnodeClient(host, '')
	assert.equal((await client.get('stats')).cpu_load, 20)
})

test('reports the field a node refuses', async () => {
	await fake.close()
	const net = await import('node:net')
	const server = net.createServer((socket) => {
		socket.on('data', () => {
			const text = '{"error":"invalid","field":"preset","message":"out of range"}'
			socket.end(`HTTP/1.0 400 Bad\r\nContent-Length: ${text.length}\r\n\r\n${text}`)
		})
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const client = new PxnodeClient(`127.0.0.1:${server.address().port}`, '')
	await assert.rejects(client.put('presets/active', { preset: 40 }), (error) => {
		assert.ok(error instanceof PxnodeError)
		assert.equal(error.status, 400)
		assert.match(error.message, /invalid preset out of range/)
		return true
	})
	await new Promise((resolve) => server.close(resolve))
	host = await fake.listen()
})

test('one failed poll keeps the state, three lose the node, it comes back', async () => {
	connect()
	await until(() => connection.state, 'state')
	const port = fake.port
	await fake.close()
	await until(() => statuses.includes(InstanceStatus.ConnectionFailure), 'lost')
	assert.equal(connection.state, undefined)
	await fake.listen(port)
	await until(() => connection.state, 'back')
	assert.equal(statuses.at(-1), InstanceStatus.Ok)
})

test('a tap reaches the node in order', async () => {
	connect()
	await until(() => connection.state, 'state')
	fake.delays['gpi/press'] = 30
	await Promise.all([connection.setGpi(1, true), connection.setGpi(1, false)])
	assert.deepEqual(
		fake.seen('gpi/press').map((request) => request.body.closed),
		[true, false],
	)
})

test('a release lost with the connection is sent when the node returns', async () => {
	connect()
	await until(() => connection.state, 'state')
	await connection.setGpi(2, true)
	const port = fake.port
	await fake.close()
	await assert.rejects(connection.setGpi(2, false))
	await fake.listen(port)
	await until(() => fake.seen('gpi/press').some((request) => request.body.closed === false), 'release')
	assert.deepEqual(fake.seen('gpi/press').at(-1).body, { input: 2, closed: false })
	const sent = fake.seen('gpi/press').length
	await sleep(POLL_MS * 4)
	assert.equal(fake.seen('gpi/press').length, sent)
})

test('a press not released is opened when the connection stops', async () => {
	connect()
	await until(() => connection.state, 'state')
	await connection.setGpi(3, true)
	await connection.stop()
	assert.deepEqual(fake.seen('gpi/press').at(-1).body, { input: 3, closed: false })
})

test('a pxnode 4 refuses GPI and nothing stays pending', async () => {
	fake.node.model = 'pxnode 4'
	connect()
	await until(() => connection.state, 'state')
	await assert.rejects(connection.setGpi(1, true), PxnodeError)
	await assert.rejects(connection.setGpi(1, false), PxnodeError)
	const sent = fake.seen('gpi/press').length
	await sleep(POLL_MS * 4)
	await connection.stop()
	assert.equal(fake.seen('gpi/press').length, sent)
})
