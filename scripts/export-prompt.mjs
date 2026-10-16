/** Writes the AI instructions and output schema to domino/app/prompt.json for the Python server. */
import fs from 'node:fs'
import { STUDY_SCHEMA, SYSTEM_PROMPT } from '../shared/prompt.mjs'

fs.writeFileSync(new URL('../domino/app/prompt.json', import.meta.url), JSON.stringify({ systemPrompt: SYSTEM_PROMPT, schema: STUDY_SCHEMA }))
console.log('wrote domino/app/prompt.json')
