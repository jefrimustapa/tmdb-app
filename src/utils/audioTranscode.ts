// Decides when a TGStrm stream needs the stereo AAC audio transcode (issue #284).
// Browsers/WebViews often cannot decode Dolby/DTS audio or play surround as stereo: the video plays, the sound is silent.

// Filename hints (fallback when the server could not probe the real codec).
const SURROUND_OR_DOLBY_FILENAME_RE = /(ddp|dd\+|ac3|ac-3|eac3|e-ac-3|atmos|dts|truehd|thd|[345678]ch|surround|(?<!\d)5[._-]1(?!\d)|(?<!\d)7[._-]1(?!\d))/i;

// ffprobe codec names that need the transcode (ffprobe reports DTS-HD as "dts" and Atmos as "eac3"/"truehd").
const TRANSCODE_AUDIO_CODECS = new Set(['eac3', 'ac3', 'dts', 'truehd', 'mlp']);

export interface AudioTranscodeInfo {
  filename?: string;
  /** Real audio codec of the chosen track, from the server probe. */
  audioCodec?: string;
  audioChannels?: number;
}

/** True when the audio must go through the stereo AAC transcode. The real codec wins over the filename. */
export function needsAudioTranscode({ filename, audioCodec, audioChannels }: AudioTranscodeInfo): boolean {
  const codec = (audioCodec || '').toLowerCase();
  if (codec) {
    return TRANSCODE_AUDIO_CODECS.has(codec) || (audioChannels ?? 0) > 2;
  }
  return filename ? SURROUND_OR_DOLBY_FILENAME_RE.test(filename) : false;
}
