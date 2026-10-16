/** Shared by the local server (server/api.mjs) and the browser (bring-your-own-key mode). */
export const STUDY_SCHEMA: Record<string, unknown>
export const SYSTEM_PROMPT: string
export function userPrompt(o: { text?: string; fileName?: string; studyType?: string; guidelines?: string[]; truncated?: boolean }): string
