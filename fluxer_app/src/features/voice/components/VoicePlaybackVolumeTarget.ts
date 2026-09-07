// SPDX-License-Identifier: AGPL-3.0-or-later

import {getStreamKey} from '@app/features/voice/components/StreamKeys';
import {
	asVoiceTrackSource,
	isScreenShareAudioPublicationLike,
	type VoiceTrackPublicationSourceLike,
	VoiceTrackSource,
} from '@app/features/voice/engine/VoiceTrackSource';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';

interface PlaybackTrack {
	source: unknown;
	participant: {
		identity: string;
		isLocal: boolean;
		audioTrackPublications: ReadonlyMap<string, VoiceTrackPublicationSourceLike>;
	};
}

export type VoicePlaybackVolumeTarget =
	| {kind: 'call'}
	| {kind: 'none'}
	| {kind: 'stream'; streamKey: string; userId: string};

export function resolveVoicePlaybackVolumeTarget(
	track: PlaybackTrack | null | undefined,
	guildId: string | null | undefined,
	channelId: string | undefined,
): VoicePlaybackVolumeTarget {
	if (asVoiceTrackSource(track?.source) !== VoiceTrackSource.ScreenShare) return {kind: 'call'};
	// A silent/own stream must not silently fall back to muting the whole call.
	if (!track || track.participant.isLocal || !channelId) return {kind: 'none'};
	const {userId, connectionId} = parseVoiceParticipantIdentity(track.participant.identity);
	if (!userId || !connectionId) return {kind: 'none'};
	if (![...track.participant.audioTrackPublications.values()].some(isScreenShareAudioPublicationLike)) {
		return {kind: 'none'};
	}
	return {kind: 'stream', streamKey: getStreamKey(guildId, channelId, connectionId), userId};
}
