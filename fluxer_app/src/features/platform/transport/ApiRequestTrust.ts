// SPDX-License-Identifier: AGPL-3.0-or-later

/** Credentials belong to the configured API, not to the embedded document origin.
 * Absolute caller URLs remain untrusted, even when they point at that API.
 */
export function isTrustedApiRequest(path: string, resolvedUrl: string, baseUrl: string, documentOrigin: string): boolean {
	if (path.startsWith('//') || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return false;
	try {
		const api = new URL(baseUrl, documentOrigin);
		const target = new URL(resolvedUrl);
		const prefix = `${api.pathname.replace(/\/$/, '')}/`;
		return (
			(api.protocol === 'https:' || api.protocol === 'http:') &&
			!api.username && !api.password && !target.username && !target.password &&
			target.origin === api.origin && target.pathname.startsWith(prefix)
		);
	} catch {
		return false;
	}
}
