// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelHeaderIcon} from '@app/features/channel/components/channel_header_components/ChannelHeaderIcon';
import {VoicePlaybackVolumeControl} from '@app/features/voice/components/VoicePlaybackVolumeControl';
import type {TrackReferenceOrPlaceholder} from '@livekit/components-react';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import type {Icon} from '@phosphor-icons/react';
import {ArrowSquareOutIcon} from '@phosphor-icons/react';
import type React from 'react';
import {forwardRef, useMemo} from 'react';

const POP_OUT_CALL_DESCRIPTOR = msg({
	message: 'Pop out call',
	comment: 'Tooltip / aria label on the voice call footer button that opens the call in a separate window.',
});

interface VoiceCallCornerControlsProps {
	focusedTrack?: TrackReferenceOrPlaceholder | null;
	guildId?: string | null;
	channelId?: string;
	wrapClassName: string;
	buttonClassName?: string;
	showPopout: boolean;
	onPopOut?: () => void;
	showFullscreen: boolean;
	isFullscreen: boolean;
	fullscreenLabel: string;
	fullscreenIcon: Icon;
	onToggleFullscreen: () => void;
}

export const VoiceCallCornerControls: React.FC<VoiceCallCornerControlsProps> = ({
	focusedTrack,
	guildId,
	channelId,
	wrapClassName,
	buttonClassName,
	showPopout,
	onPopOut,
	showFullscreen,
	isFullscreen,
	fullscreenLabel,
	fullscreenIcon,
	onToggleFullscreen,
}) => {
	const {i18n} = useLingui();
	const PopOutIcon = useMemo(() => {
		const BoldIcon = forwardRef<SVGSVGElement, React.ComponentProps<typeof ArrowSquareOutIcon>>((props, ref) => (
			<ArrowSquareOutIcon
				ref={ref}
				weight="bold"
				data-flx="voice.voice-call-corner-controls.arrow-square-out-icon"
				{...props}
			/>
		));
		BoldIcon.displayName = 'PopOutCallIcon';
		return BoldIcon;
	}, []);
	return (
		<div className={wrapClassName} data-flx="voice.voice-call-corner-controls.wrap">
			<VoicePlaybackVolumeControl
				focusedTrack={focusedTrack}
				guildId={guildId}
				channelId={channelId}
				className={buttonClassName}
			/>
			{showPopout && onPopOut && (
				<ChannelHeaderIcon
					icon={PopOutIcon}
					label={i18n._(POP_OUT_CALL_DESCRIPTOR)}
					className={buttonClassName}
					onClick={onPopOut}
					data-flx="voice.voice-call-corner-controls.channel-header-icon.pop-out"
				/>
			)}
			{showFullscreen && (
				<ChannelHeaderIcon
					icon={fullscreenIcon}
					label={fullscreenLabel}
					className={buttonClassName}
					isSelected={isFullscreen}
					onClick={onToggleFullscreen}
					data-flx="voice.voice-call-corner-controls.channel-header-icon.toggle-fullscreen"
				/>
			)}
		</div>
	);
};
