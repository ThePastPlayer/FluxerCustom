// SPDX-License-Identifier: AGPL-3.0-or-later

import {CallVolumeControl} from '@app/features/voice/components/CallVolumeControl';
import {MediaVerticalVolumeControl} from '@app/features/voice/components/media_player/components/MediaVerticalVolumeControl';
import {resolveVoicePlaybackVolumeTarget} from '@app/features/voice/components/VoicePlaybackVolumeTarget';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import StreamAudioPrefs from '@app/features/voice/state/StreamAudioPrefs';
import {VOICE_VOLUME_MAX_SLIDER_VOLUME} from '@app/features/voice/utils/VoiceVolumeUtils';
import {useLingui} from '@lingui/react/macro';
import type {TrackReferenceOrPlaceholder} from '@livekit/components-react';
import {observer} from 'mobx-react-lite';

interface VoicePlaybackVolumeControlProps {
	focusedTrack?: TrackReferenceOrPlaceholder | null;
	guildId?: string | null;
	channelId?: string;
	className?: string;
}

export const VoicePlaybackVolumeControl = observer(function VoicePlaybackVolumeControl({
	focusedTrack,
	guildId,
	channelId,
	className,
}: VoicePlaybackVolumeControlProps) {
	const {t} = useLingui();
	const target = resolveVoicePlaybackVolumeTarget(focusedTrack, guildId, channelId);
	if (target.kind === 'none') return null;
	if (target.kind === 'call') return <CallVolumeControl className={className} />;
	const volume = StreamAudioPrefs.getVolume(target.streamKey);
	const muted = StreamAudioPrefs.isMuted(target.streamKey);
	return (
		<MediaVerticalVolumeControl
			key={target.streamKey}
			volume={volume / 100}
			isMuted={muted}
			maxVolume={VOICE_VOLUME_MAX_SLIDER_VOLUME}
			className={className}
			iconSize={18}
			ariaLabel={t`Stream volume`}
			onVolumeChange={(value) => {
				StreamAudioPrefs.setVolume(target.streamKey, Math.round(value * 100));
				MediaEngine.applyLocalAudioPreferencesForUser(target.userId);
			}}
			onToggleMute={() => {
				StreamAudioPrefs.setMuted(target.streamKey, !StreamAudioPrefs.isMuted(target.streamKey));
				MediaEngine.applyLocalAudioPreferencesForUser(target.userId);
			}}
			data-flx="voice.playback-volume-control.stream"
		/>
	);
});
