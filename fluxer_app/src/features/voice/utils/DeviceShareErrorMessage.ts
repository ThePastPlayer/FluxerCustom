// SPDX-License-Identifier: AGPL-3.0-or-later
// No raw exception text (which may contain device IDs) is shown to users.
export function deviceShareErrorMessage(error: unknown, locale: string): string {
	const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
	const french = locale.toLowerCase().startsWith('fr');
	if (name === 'NotReadableError' || name === 'TrackStartError') return french
		? 'Périphérique indisponible. Fermez son aperçu ou sa capture dans OBS, Elgato, Discord et les autres onglets, puis réessayez. Vérifiez aussi le câble USB si la carte est déjà libre.'
		: 'Device unavailable. Close its preview or capture in OBS, Elgato, Discord and other tabs, then try again. If it is already free, also check the USB connection.';
	if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return french
		? 'Accès au périphérique refusé. Autorisez Fluxer LePast à utiliser la caméra et, si nécessaire, le microphone dans les réglages du système.'
		: 'Device access denied. Allow Fluxer LePast to use the camera and, if needed, the microphone in your system settings.';
	if (name === 'NotFoundError' || name === 'OverconstrainedError') return french
		? 'Périphérique ou format indisponible. Rebranchez la carte, sélectionnez-la à nouveau ou essayez une définition inférieure. Aucune autre webcam ne sera ouverte à sa place.'
		: 'Device or format unavailable. Reconnect the card, select it again or try a lower resolution. No other webcam will be opened in its place.';
	return french
		? 'La diffusion du périphérique n’a pas démarré. Vérifiez la connexion au vocal et réessayez. La carte peut être libre mais la publication du stream peut échouer.'
		: 'The device stream did not start. Check your voice connection and try again. The device may be available even if publishing the stream fails.';
}
