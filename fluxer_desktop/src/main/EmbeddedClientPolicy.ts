// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';

export const EMBEDDED_ORIGIN = 'https://client.fluxer.invalid';

export function isEmbeddedUrl(raw: string): boolean {
	try {
		const url = new URL(raw);
		return url.origin === EMBEDDED_ORIGIN && !url.username && !url.password;
	} catch {
		return false;
	}
}

export function embeddedRelativePath(raw: string): string | null {
	if (!isEmbeddedUrl(raw)) return null;
	try {
		const decoded = decodeURIComponent(new URL(raw).pathname);
		if (/[\\:\u0000]/.test(decoded) || decoded.split('/').some((part) => part === '..' || part === '.')) return null;
		return decoded.replace(/^\/+/, '');
	} catch {
		return null;
	}
}

export function resolveEmbeddedFile(root: string, relative: string): string {
	const resolved = path.resolve(root, relative);
	const within = path.relative(root, resolved);
	if (within.startsWith('..') || path.isAbsolute(within) || !within) throw new Error('Invalid embedded asset path');
	return resolved;
}

export function isClientRoute(relative: string): boolean {
	return relative === '' || relative === 'index.html' ||
		/^(channels|login|register|invite|reset-password|forgot-password|verify-email|authorize|oauth2|popout|quick-css-editor|theme-studio)(\/|$)/.test(relative);
}

export const CONTENT_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
	'.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp',
	'.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
	'.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
	'.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif', '.jpeg': 'image/jpeg',
	'.txt': 'text/plain; charset=utf-8',
};
