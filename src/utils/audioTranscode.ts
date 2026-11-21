// Decides when a TGStrm stream needs the stereo AAC audio transcode (issue #284, #357).
// Browsers/WebViews often cannot decode Dolby/DTS audio or play surround as stereo: the video plays, the sound is silent.
// Also, dual-audio videos (e.g. Hindi + English) need audio transcode to isolate and output the English track.

// Filename hints (fallback when the server could not probe the real codec).
const SURROUND_OR_DOLBY_FILENAME_RE = /(ddp|dd\+|ac3|ac-3|eac3|e-ac-3|atmos|dts|truehd|thd|[345678]ch|surround|(?<!\d)5[._-]1(?!\d)|(?<!\d)7[._-]1(?!\d))/i;

// Filename hints for dual-audio or multi-audio releases
export const DUAL_OR_MULTI_AUDIO_FILENAME_RE =
  /\b(dual[ ._-]?audio|multi[ ._-]?audio|tri[ ._-]?audio)\b|[\[\(][^\]\)]*\bdual\b[^\]\)]*[\]\)]|\b(hindi\s*[-_.+&]\s*english|english\s*[-_.+&]\s*hindi|hin\s*[-_.+&]\s*eng|eng\s*[-_.+&]\s*hin)\b|[\[\(][^\]\)]*\b(?:hin|hindi|tam|tamil|tel|telugu|kor|korean|jap|japanese|rus|russian|spa|spanish|fre|french|ger|german|chi|chinese|mandarin)\b[^\]\)]*(\+|&)[^\]\)]*\b(?:eng|english)\b[^\]\)]*[\]\)]|[\[\(][^\]\)]*\b(?:eng|english)\b[^\]\)]*(\+|&)[^\]\)]*\b(?:hin|hindi|tam|tamil|tel|telugu|kor|korean|jap|japanese|rus|russian|spa|spanish|fre|french|ger|german|chi|chinese|mandarin)\b[^\]\)]*[\]\)]/i;

// ffprobe codec names that need the transcode (ffprobe reports DTS-HD as "dts" and Atmos as "eac3"/"truehd").
const TRANSCODE_AUDIO_CODECS = new Set(['eac3', 'ac3', 'dts', 'truehd', 'mlp']);

export interface AudioTranscodeInfo {
  filename?: string;
  /** Real audio codec of the chosen track, from the server probe. */
  audioCodec?: string;
  audioChannels?: number;
  /** True when the media contains multiple audio streams (e.g. Dual Audio). */
  hasMultipleAudio?: boolean;
  /** Total count of audio streams found by ffprobe. */
  audioTrackCount?: number;
}

export function isDualOrMultiAudioFilename(filename?: string): boolean {
  if (!filename) return false;
  return DUAL_OR_MULTI_AUDIO_FILENAME_RE.test(filename);
}

/** True when the audio must go through the stereo AAC transcode. The real codec/probe wins over the filename. */
export function needsAudioTranscode({
  filename,
  audioCodec,
  audioChannels,
  hasMultipleAudio,
  audioTrackCount,
}: AudioTranscodeInfo): boolean {
  // If the server probe detected multiple audio streams, always route to audio transcode
  // so the server isolates the preferred English audio stream.
  if (hasMultipleAudio === true || (audioTrackCount !== undefined && audioTrackCount > 1)) {
    return true;
  }

  const codec = (audioCodec || '').toLowerCase();
  if (codec) {
    if (TRANSCODE_AUDIO_CODECS.has(codec) || (audioChannels ?? 0) > 2) {
      return true;
    }
    // If ffprobe explicitly confirmed single audio track, trust probe over filename.
    if (hasMultipleAudio === false || audioTrackCount === 1) {
      return false;
    }
    // If multi-track status is unprobed, check if filename indicates dual audio
    if (filename && isDualOrMultiAudioFilename(filename)) {
      return true;
    }
    return false;
  }

  // Fallback to filename hints when the codec is unknown
  if (filename) {
    return SURROUND_OR_DOLBY_FILENAME_RE.test(filename) || isDualOrMultiAudioFilename(filename);
  }

  return false;
}
