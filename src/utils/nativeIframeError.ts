/**
 * Native HTTP-error filter for the embed player (issue #295).
 *
 * The Android shell reports any iframe document answered with status >= 400 as a load failure. Some
 * embeds (FlaxMovies) always answer 404 but still serve a working page, so for providers flagged
 * `ignoreHttp404` that status alone must not fail the player. Failover is left to the watchdog.
 */
export function shouldIgnoreNativeIframeError(
  provider: { ignoreHttp404?: boolean },
  detail: { code?: number } | null | undefined,
): boolean {
  return provider.ignoreHttp404 === true && detail?.code === 404;
}
