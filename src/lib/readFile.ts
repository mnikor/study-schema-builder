export interface ReadResult {
  name: string
  kind: 'pdf' | 'docx' | 'text'
  text: string
  pages?: number
  sizeMB: number
  base64?: string
  mime?: string
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

export async function readFile(f: File): Promise<ReadResult> {
  const name = f.name
  const lower = name.toLowerCase()
  const sizeMB = f.size / 1024 / 1024
  if (lower.endsWith('.pdf') || f.type === 'application/pdf') {
    const buf = await f.arrayBuffer()
    const base64 = toBase64(buf)
    const pdfjs = await import('pdfjs-dist')
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = worker
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
    const parts: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      let s = ''
      for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof it.str !== 'string') continue
        s += it.str + (it.hasEOL ? '\n' : ' ')
      }
      parts.push(`[Page ${i}]\n${s.replace(/[ \t]+\n/g, '\n')}`)
    }
    return { name, kind: 'pdf', text: parts.join('\n\n'), pages: doc.numPages, sizeMB, base64, mime: 'application/pdf' }
  }
  if (lower.endsWith('.docx')) {
    const mod = (await import('mammoth')) as unknown as { default?: unknown }
    const mammoth = (mod.default ?? mod) as { extractRawText: (o: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }
    const res = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })
    return { name, kind: 'docx', text: res.value, sizeMB }
  }
  if (lower.endsWith('.doc')) throw new Error('Legacy .doc files are not supported — save as .docx or PDF.')
  return { name, kind: 'text', text: await f.text(), sizeMB }
}

const KEYWORDS =
  /synopsis|schema|schematic|study design|design of the study|objective|endpoint|outcome|randomi|allocation|arm\b|arms\b|cohort|group|sequence|washout|dose|escalation|schedule of (activities|assessments|events)|visit|screening|follow-up|follow up|treatment period|index date|baseline|look-?back|eligib|inclusion|exclusion|data source|database|claims|registry|sample size|line of therapy|lines of therapy|population/gi

/** Keep the beginning (synopsis) and the paragraphs most about study design, in document order. */
export function focusText(text: string, limit = 110_000): { text: string; truncated: boolean } {
  const clean = text.replace(/\n{3,}/g, '\n\n')
  if (clean.length <= limit) return { text: clean, truncated: false }
  const head = clean.slice(0, 18_000)
  const rest = clean.slice(18_000)
  const chunks = rest.split(/\n\s*\n/)
  const scored = chunks.map((c, i) => {
    const hits = (c.match(KEYWORDS) ?? []).length
    const tocLike = (c.match(/\.{5,}|\s\d{1,3}\s*$/gm) ?? []).length > 3
    return { i, c, score: tocLike ? 0 : hits / Math.sqrt(Math.max(80, c.length)) }
  })
  const budget = limit - head.length
  const picked = new Set<number>()
  let used = 0
  for (const s of [...scored].sort((a, b) => b.score - a.score)) {
    if (s.score <= 0) break
    if (used + s.c.length > budget) continue
    picked.add(s.i)
    used += s.c.length + 2
  }
  const body = scored.filter((s) => picked.has(s.i)).map((s) => s.c).join('\n\n')
  return { text: `${head}\n\n[…]\n\n${body}`, truncated: true }
}
