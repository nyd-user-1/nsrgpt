// Where the chat's paper search runs (2026-11-07): the NSR-CPT encoder and the 277,068 NSR-CPT vectors on AWS
// Lambda (services/nsr-search). One backend since Hugging Face was dropped (its Docker Spaces need a paid plan), so
// the composer shows no picker, only the warm countdown.

export type SearchBackend = "lambda"

export const DEFAULT_SEARCH_BACKEND: SearchBackend = "lambda"
export const isSearchBackend = (id: unknown): id is SearchBackend => id === "lambda"

/** How long Lambda keeps the function loaded after a call, for the composer's countdown. */
export const LAMBDA_WARM_MS = 10 * 60 * 1000
