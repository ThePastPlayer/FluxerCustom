// SPDX-License-Identifier: AGPL-3.0-or-later
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {app, net, session} from 'electron';
import {CONTENT_TYPES, embeddedRelativePath, isClientRoute, isEmbeddedUrl, resolveEmbeddedFile} from './EmbeddedClientPolicy';

// Only packaged bytes can execute with Electron privileges. The server is an API,
// never a source of HTML/JavaScript for this origin; no remote fallback exists.
export async function registerEmbeddedClient(): Promise<void> {
	const root = app.isPackaged
		? path.join(process.resourcesPath, 'embedded-client')
		: path.join(app.getAppPath(), 'embedded-client');
	const manifest = JSON.parse(readFileSync(path.join(root, 'manifest-integrity.json'), 'utf8')) as {
		files: Record<string, string>; csp: string; version: string;
	};
	if (!manifest.files['index.html'] || !manifest.csp) throw new Error('Embedded client manifest is incomplete');
	// Validate executable assets before any privileged document opens.
	for (const [relative, expected] of Object.entries(manifest.files)) {
		if (!/\.(html|js|mjs|wasm)$/.test(relative)) continue;
		const actual = createHash('sha256').update(readFileSync(resolveEmbeddedFile(root, relative))).digest('hex');
		if (actual !== expected) throw new Error('Embedded client integrity check failed: ' + relative);
	}
	await session.defaultSession.protocol.handle('https', async (request) => {
		if (!isEmbeddedUrl(request.url)) {
			return net.fetch(request, {bypassCustomProtocolHandlers: true});
		}
		const relative = embeddedRelativePath(request.url);
		if (relative === null) return new Response('Invalid path', {status: 400});
		if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status: 405});
		const key = Object.hasOwn(manifest.files, relative) ? relative : isClientRoute(relative) ? 'index.html' : null;
		if (!key) return new Response('Embedded asset not found', {status: 404});
		const response = await net.fetch(pathToFileURL(resolveEmbeddedFile(root, key)).href);
		const headers = new Headers(response.headers);
		headers.set('Content-Type', CONTENT_TYPES[path.extname(key)] ?? 'application/octet-stream');
		headers.set('Content-Security-Policy', manifest.csp);
		headers.set('X-Content-Type-Options', 'nosniff');
		headers.set('Cache-Control', 'no-store');
		return new Response(request.method === 'HEAD' ? null : response.body, {status: response.status, headers});
	});
}
