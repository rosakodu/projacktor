"""
Projacktor Media Package.
Modular media probing, transcoding, subtitle processing, and episode resolution.
"""

from .probe import (
    is_header_ready,
    unwrap_stream_source,
    parse_ffprobe_data,
    _parse_ffprobe_data,
    probe_media_file,
    PROBE_CACHE
)
from .transcoder import (
    resolve_transcode_plan,
    build_ffmpeg_stream_command
)
from .subtitles import (
    detect_and_ensure_utf8,
    ensure_utf8_subtitles,
    finalize_vtt,
    is_bitmap_subtitle,
    find_external_subtitles,
    prewarm_subtitle_cache,
    convert_subtitles_to_vtt
)
from .episodes import (
    natural_keys,
    natural_sort_key,
    parse_season_episode,
    episode_sort_key,
    find_target_episode,
    filter_video_files,
    match_episode_to_file,
    match_aria2_file,
    collect_candidate_paths,
    sort_episodes
)

__all__ = [
    "is_header_ready",
    "unwrap_stream_source",
    "parse_ffprobe_data",
    "_parse_ffprobe_data",
    "probe_media_file",
    "PROBE_CACHE",
    "resolve_transcode_plan",
    "build_ffmpeg_stream_command",
    "detect_and_ensure_utf8",
    "ensure_utf8_subtitles",
    "finalize_vtt",
    "is_bitmap_subtitle",
    "find_external_subtitles",
    "prewarm_subtitle_cache",
    "convert_subtitles_to_vtt",
    "natural_keys",
    "natural_sort_key",
    "parse_season_episode",
    "episode_sort_key",
    "find_target_episode",
    "filter_video_files",
    "match_episode_to_file",
    "match_aria2_file",
    "collect_candidate_paths",
    "sort_episodes",
]
