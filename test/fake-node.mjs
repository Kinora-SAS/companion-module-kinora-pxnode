import net from 'node:net'

/** Answers like the firmware: HTTP/1.0, one request per connection, some answers without Content-Length. */
export class FakeNode {
	requests = []
	password = ''
	busy = 0
	delays = {}
	node = { name: 'Bench', model: 'px4i', firmware: '2.0.2', api: 1, password: false }
	stats = {
		input: 'none',
		input_source: '',
		input_fps: 0,
		temperature_c: 40,
		cpu_load: 20,
		blackout: false,
		full_color: false,
		gpi: [{ closed: false, closed_ms: 0, count: 0 }],
		config: { saves: 1 },
		pxsync: { role: 'alone', presets_version: 1 },
	}
	active = { preset: 1, name: 'Fire', fading: false, previewing: false }
	presets = [{ name: 'Solid colour' }, { name: 'Fire' }, { name: 'Ocean' }]

	async listen(port = 0) {
		this.server = net.createServer((socket) => this.#connection(socket))
		this.sockets = new Set()
		this.server.on('connection', (socket) => {
			this.sockets.add(socket)
			socket.on('close', () => this.sockets.delete(socket))
		})
		await new Promise((resolve) => this.server.listen(port, '127.0.0.1', resolve))
		this.port = this.server.address().port
		return `127.0.0.1:${this.port}`
	}

	async close() {
		for (const socket of this.sockets) socket.destroy()
		await new Promise((resolve) => this.server.close(resolve))
	}

	seen(path) {
		return this.requests.filter((request) => request.path === path)
	}

	#connection(socket) {
		let data = ''
		socket.on('error', () => {})
		socket.on('data', (chunk) => {
			data += chunk
			const end = data.indexOf('\r\n\r\n')
			if (end < 0) return
			const head = data.slice(0, end)
			const length = Number(/content-length: (\d+)/i.exec(head)?.[1] ?? 0)
			const body = data.slice(end + 4)
			if (body.length < length) return
			const [method, url] = head.split(' ')
			const path = url.replace('/api/', '')
			const authorization = /authorization: (.+)/i.exec(head)?.[1]?.trim()
			const request = { method, path, body: body ? JSON.parse(body) : undefined, authorization }
			this.requests.push(request)
			const [status, json, bare] = this.#answer(request)
			const headers = `HTTP/1.0 ${status} X\r\nContent-Type: application/json\r\nConnection: close\r\n`
			const text = JSON.stringify(json)
			const sized = bare ? '' : `Content-Length: ${text.length}\r\n`
			setTimeout(() => socket.end(`${headers}${sized}\r\n${text}`), this.delays[path] ?? 0)
		})
	}

	#answer({ method, path, body, authorization }) {
		if (this.busy > 0) {
			this.busy--
			return [503, { error: 'busy' }]
		}
		if (path === 'node') return [200, this.node]
		if (this.password) {
			const expected = 'Basic ' + Buffer.from(`:${this.password}`).toString('base64')
			if (!authorization) return [401, { error: 'password-required' }]
			if (authorization !== expected) return [401, { error: 'password-wrong' }]
		}
		if (path === 'stats') return [200, this.stats, true]
		if (path === 'presets/active') {
			if (method === 'PUT') this.active.preset = body.preset
			return [200, this.active]
		}
		if (path === 'presets') return [200, { active: 0, presets: this.presets, revision: 1 }]
		if (path === 'gpi/press') {
			if (this.node.model !== 'px4i') return [404, { error: 'not-found' }]
			return [200, { inputs: [] }]
		}
		return [200, { ok: true }]
	}
}
