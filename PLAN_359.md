# Plan: Fix tgstrm Pencuri Movie getaddrinfo EAI_AGAIN (#359)

Branch: fix/issue-359-tgstrm-pencuri-movie-eai-again
Issue: https://github.com/jefrimustapa/tmdb-app/issues/359
Status: waiting for approval

## 1. Goal & Acceptance Criteria
- Goal: Prevent resolution failures when cold DNS `getaddrinfo EAI_AGAIN` occurs on first trial.
- Acceptance Criteria:
  - When user searches Pencuri Movie and transient DNS fails, user receives candidates automatically after retry.
  - When user triggers Mini App delivery and transient network fails, delivery continues after retry.

## 2. Files to Modify
- `server/tg-streamer/resolvers/pencuri.js`: Add retry mechanism with backoff for transient network and DNS errors.
- `server/tg-streamer/matching.test.js`: Add unit tests for transient network and DNS retry behavior.

## 3. Technical Approach
1. Add `axiosWithRetry` helper function in `server/tg-streamer/resolvers/pencuri.js`.
2. Retry on errors: `EAI_AGAIN`, `ETIMEDOUT`, `ECONNABORTED`, `ECONNRESET`, `ENOTFOUND`, and 5xx status.
3. Configure max retries to 2 with initial delay 300ms and exponential factor 1.5.
4. Wrap `searchPencariApi`, `fetchPencariLinkDetails`, and `triggerMiniAppDelivery` HTTP requests with retry helper.

## 4. Test Plan
- Boundary Value Analysis (BVA):
  - Attempt 1 fails with `EAI_AGAIN`, attempt 2 succeeds -> returns files successfully.
  - All attempts fail with `EAI_AGAIN` -> returns empty array or false after max retries.
  - Non-transient error (HTTP 404) -> aborts immediately without retries.
- E2E / Integration Verification:
  - Run `npm test` inside `server/tg-streamer` directory.
  - Verify zero test regressions.

## 5. Risks & Non-Goals
- Non-goals:
  - Modifying MSM resolver (MSM already has retry logic).
  - Modifying frontend web scraping service `src/services/pencuriMappingService.ts`.
- Risks:
  - Slow response during persistent outage: bounded by 2 retries and 300ms initial delay.
