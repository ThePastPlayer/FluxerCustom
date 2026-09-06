// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type CapturedScreenShareTracks,
	type DeviceScreenShareCaptureOptions,
	logger,
	stopMediaTrack,
	stopUnselectedStreamTracks,
} from '@app/features/voice/engine/voice_screen_share_manager/shared';

interface BuildConstraintsOptions {
	useExactDeviceId: boolean;
	includeResolution: boolean;
}

export function getDeviceMediaConstraints(
	options: DeviceScreenShareCaptureOptions | undefined,
	flags: BuildConstraintsOptions,
): MediaStreamConstraints {
	const resolution = options?.resolution;
	const videoConstraints: MediaTrackConstraints = {};
	if (options?.videoDeviceId && options.videoDeviceId !== 'default') {
		videoConstraints.deviceId = flags.useExactDeviceId
			? {exact: options.videoDeviceId}
			: {ideal: options.videoDeviceId};
	}
	if (resolution && flags.includeResolution) {
		videoConstraints.width = {ideal: resolution.width};
		videoConstraints.height = {ideal: resolution.height};
		videoConstraints.frameRate = resolution.frameRate;
	}
	let audioConstraints: MediaTrackConstraints | false = false;
	if (options?.audioDeviceId !== undefined) {
		audioConstraints = {
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
		};
		if (options.audioDeviceId && options.audioDeviceId !== 'default') {
			audioConstraints.deviceId = flags.useExactDeviceId
				? {exact: options.audioDeviceId}
				: {ideal: options.audioDeviceId};
		}
	}
	return {
		video: videoConstraints,
		audio: audioConstraints,
	};
}

const RESOLUTION_CONSTRAINT_NAMES = new Set(['width', 'height', 'frameRate', 'aspectRatio']);

function readOverconstrainedField(error: unknown): string | undefined {
	if (!(error instanceof Error) || !('constraint' in error)) {
		return undefined;
	}
	const constraint = error.constraint;
	return typeof constraint === 'string' && constraint.length > 0 ? constraint : undefined;
}

function getOverconstrainedFieldName(error: unknown): string | undefined {
	if (!(error instanceof Error) || error.name !== 'OverconstrainedError') {
		return undefined;
	}
	return readOverconstrainedField(error);
}

function summarizeGetUserMediaError(error: unknown): Record<string, unknown> {
	if (!(error instanceof Error)) {
		return {error: String(error)};
	}
	const summary: Record<string, unknown> = {name: error.name, message: error.message};
	const constraint = readOverconstrainedField(error);
	if (constraint !== undefined) {
		summary.constraint = constraint;
	}
	return summary;
}

export async function createDeviceReplacementTracks(
	options?: DeviceScreenShareCaptureOptions,
): Promise<CapturedScreenShareTracks> {
	const exactConstraints = getDeviceMediaConstraints(options, {useExactDeviceId: true, includeResolution: true});
	let stream: MediaStream;
	let constraints = exactConstraints;
	for (let attempt = 0; ; attempt++) {
		try {
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			break;
		} catch (error) {
			const field = getOverconstrainedFieldName(error);
			if (attempt === 0 && field && RESOLUTION_CONSTRAINT_NAMES.has(field)) {
				constraints = getDeviceMediaConstraints(options, {useExactDeviceId: true, includeResolution: false});
			} else if (attempt < 2 && error instanceof Error && error.name === 'NotReadableError') {
				// A UVC driver can finish releasing its preview after track.stop() returns.
				await new Promise((resolve) => globalThis.setTimeout(resolve, 400 * (attempt + 1)));
			} else {
				throw error;
			}
			logger.warn('Retrying selected capture device', {...summarizeGetUserMediaError(error), attempt: attempt + 1});
		}
	}
	const videoTrack = stream.getVideoTracks()[0];
	if (!videoTrack) {
		stream.getTracks().forEach(stopMediaTrack);
		throw new Error('No video track found in device screen share capture');
	}
	const audioTrack = stream.getAudioTracks()[0];
	stopUnselectedStreamTracks(stream, [videoTrack, audioTrack]);
	return {
		videoTrack,
		audioTrack,
	};
}
