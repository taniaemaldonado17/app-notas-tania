/**
 * Paste from Microsoft Word: Word puts its own HTML on the clipboard, where
 * lists are paragraphs with a "·" drawn in front, colours are any RGB value,
 * titles are just big text and pictures point to files on the user's disk.
 * cleanWordHtml turns that into plain HTML the editor understands (real lists,
 * the editor's colours, alignment, headings, blank lines). Pictures come in
 * the RTF copy of the clipboard (rtfImages) and are uploaded by the caller.
 *
 * Browser only (DOMParser). No imports, so it can be tested in a bare page.
 */

/** True when the clipboard HTML was written by Word (or Outlook, which uses Word). */
export function isWordHtml(html: string): boolean {
  return /urn:schemas-microsoft-com:office:(word|office)|class="?Mso|mso-[a-z-]+:/i.test(html)
}

/* --------------------------------- Colours -------------------------------- */

const NAMED: Record<string, string> = {
  black: '#000000', windowtext: '#000000', white: '#ffffff', red: '#ff0000', darkred: '#8b0000', maroon: '#800000',
  green: '#008000', darkgreen: '#006400', lime: '#00ff00', blue: '#0000ff', navy: '#000080', darkblue: '#00008b',
  yellow: '#ffff00', olive: '#808000', orange: '#ffa500', purple: '#800080', magenta: '#ff00ff', fuchsia: '#ff00ff',
  pink: '#ffc0cb', teal: '#008080', aqua: '#00ffff', cyan: '#00ffff', gray: '#808080', grey: '#808080',
  silver: '#c0c0c0', brown: '#a52a2a', darkcyan: '#008b8b', darkmagenta: '#8b008b', darkyellow: '#808000',
  lightgray: '#d3d3d3', darkgray: '#a9a9a9',
}

function toRgb(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase()
  const named = NAMED[v]
  if (named) return toRgb(named)
  let m = /^#([0-9a-f]{6})$/.exec(v)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number]
  m = /^#([0-9a-f]{3})$/.exec(v)
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number]
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

/**
 * The editor's colour closest to a Word colour ("gray", "red"…), or null for
 * black/white/automatic (left as normal text).
 */
export function paletteColor(value: string | null | undefined, kind: 'text' | 'background' = 'text'): string | null {
  if (!value) return null
  const rgb = toRgb(value)
  if (!rgb) return null
  const [r, g, b] = rgb.map((x) => x / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (l > 0.93) return null // white
  if (s < 0.18 || d < 0.08) {
    if (kind === 'text' && l < 0.3) return null // black / dark grey: normal text
    return 'gray'
  }
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 15 || h >= 340) return 'red'
  if (h < 45) return l < 0.35 ? 'brown' : 'orange'
  if (h < 70) return 'yellow'
  if (h < 170) return 'green'
  if (h < 260) return 'blue'
  if (h < 290) return 'purple'
  return 'pink'
}

/* ---------------------------------- Lists --------------------------------- */

const LIST_IGNORE = /mso-list\s*:\s*ignore/i

function listInfo(p: Element): { level: number; ordered: boolean } | null {
  const style = p.getAttribute('style') ?? ''
  const m = /mso-list\s*:\s*l\d+\s+level(\d+)/i.exec(style)
  if (!m && !/MsoListParagraph/i.test(p.getAttribute('class') ?? '')) return null
  const marker = Array.from(p.querySelectorAll('span')).find((s) => LIST_IGNORE.test(s.getAttribute('style') ?? ''))
  if (!m && !marker) return null
  const text = (marker?.textContent ?? '').replace(/ /g, ' ').trim()
  return { level: m ? Number(m[1]) : 1, ordered: /^[(]?([0-9]+|[a-z]{1,3}|[ivxlc]+)[.)]$/i.test(text) }
}

/** Word list paragraphs → nested <ul>/<ol>. */
function rebuildLists(doc: Document) {
  const paras = Array.from(doc.body.querySelectorAll('p'))
  let stack: { list: HTMLElement; level: number; ordered: boolean }[] = []
  let lastP: Element | null = null
  for (const p of paras) {
    const info = listInfo(p)
    if (!info) {
      stack = []
      lastP = null
      continue
    }
    // A list ends when something else comes between its paragraphs.
    if (lastP && p.previousElementSibling !== lastP) stack = []
    for (const s of Array.from(p.querySelectorAll('span'))) if (LIST_IGNORE.test(s.getAttribute('style') ?? '')) s.remove()
    const li = doc.createElement('li')
    const inner = doc.createElement('p')
    inner.innerHTML = p.innerHTML
    copyBlockStyle(p, inner)
    li.appendChild(inner)

    while (stack.length && (stack[stack.length - 1].level > info.level)) stack.pop()
    let top = stack[stack.length - 1]
    if (top && top.level === info.level && top.ordered !== info.ordered) {
      stack.pop()
      top = stack[stack.length - 1]
    }
    if (!top || top.level < info.level) {
      const list = doc.createElement(info.ordered ? 'ol' : 'ul')
      if (top) {
        const parentLi = top.list.lastElementChild
        ;(parentLi ?? top.list).appendChild(list)
      } else {
        p.parentNode?.insertBefore(list, p)
      }
      stack.push({ list, level: info.level, ordered: info.ordered })
      top = stack[stack.length - 1]
    }
    top.list.appendChild(li)
    lastP = p
    // Keep `p` in place (hidden) until the next one is checked, then drop it.
    p.setAttribute('data-word-list-done', '')
  }
  for (const p of Array.from(doc.body.querySelectorAll('p[data-word-list-done]'))) p.remove()
}

/* --------------------------- Paragraph formatting ------------------------- */

function copyBlockStyle(from: Element, to: HTMLElement) {
  const align = (from.getAttribute('align') || (from as HTMLElement).style?.textAlign || '').toLowerCase()
  if (align === 'center' || align === 'right' || align === 'justify') to.style.textAlign = align
}

/** Size in points of a CSS font-size ("16.0pt", "21px"), or null. */
function pt(size: string | null | undefined): number | null {
  if (!size) return null
  const m = /([\d.]+)\s*(pt|px)/i.exec(size)
  if (!m) return null
  return m[2].toLowerCase() === 'px' ? Number(m[1]) * 0.75 : Number(m[1])
}

function textNodes(el: Element): Text[] {
  const out: Text[] = []
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.textContent ?? '').replace(/ /g, ' ').trim()) out.push(n as Text)
  return out
}

/** Heading level for a paragraph written in big letters (Word "títulos" made by hand). */
function headingLevelFor(p: HTMLElement): 1 | 2 | 3 | null {
  const cls = p.getAttribute('class') ?? ''
  if (/MsoTitle\b/i.test(cls)) return 1
  if (/MsoSubtitle/i.test(cls)) return 3
  const texts = textNodes(p)
  const length = texts.reduce((n, t) => n + (t.textContent ?? '').length, 0)
  if (!texts.length || length > 200) return null
  let min = Infinity
  let allBold = true
  for (const t of texts) {
    let size: number | null = null
    let bold = false
    for (let el = t.parentElement; el && el !== p.parentElement; el = el.parentElement) {
      if (size === null) size = pt(el.style?.fontSize)
      if (/^(B|STRONG)$/.test(el.tagName) || /^(bold|[6-9]00)$/.test(el.style?.fontWeight ?? '')) bold = true
    }
    min = Math.min(min, size ?? 11)
    if (!bold) allBold = false
  }
  if (min >= 20) return 1
  if (min >= 15) return 2
  if (min >= 13 && allBold) return 3
  return null
}

/** Word colours/highlights → the editor's colours; everything else on spans goes. */
function cleanInline(doc: Document) {
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('span, font, b, i, u, strong, em, a'))) {
    const color = paletteColor(el.getAttribute('color') || el.style.color, 'text')
    const style = el.getAttribute('style') ?? ''
    const hl = /mso-highlight\s*:\s*([a-z]+)/i.exec(style)?.[1]
    const bg = paletteColor(hl || el.style.backgroundColor || el.style.background, 'background')
    const bold = /^(bold|[6-9]00)$/.test(el.style.fontWeight)
    const italic = el.style.fontStyle === 'italic'
    const underline = /underline/.test(el.style.textDecoration)
    el.removeAttribute('style')
    el.removeAttribute('class')
    el.removeAttribute('lang')
    if (el.tagName === 'FONT') el.removeAttribute('color')
    if (color) el.style.color = color
    if (bg) el.style.backgroundColor = bg
    // Bold/italic set by style (not with <b>/<i>) are kept as tags.
    let target: HTMLElement = el
    for (const [on, tag] of [[bold, 'strong'], [italic, 'em'], [underline, 'u']] as const) {
      if (!on) continue
      const w = doc.createElement(tag)
      while (target.firstChild) w.appendChild(target.firstChild)
      target.appendChild(w)
      target = w
    }
    if (el.tagName === 'FONT') {
      const span = doc.createElement('span')
      if (color) span.style.color = color
      if (bg) span.style.backgroundColor = bg
      while (el.firstChild) span.appendChild(el.firstChild)
      el.replaceWith(span)
    }
  }
}

/** Word paragraphs: headings by size, alignment, empty lines kept as spacing. */
function cleanParagraphs(doc: Document) {
  for (const p of Array.from(doc.body.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6'))) {
    if (p.closest('li, td, th')) {
      if (p.tagName === 'P') {
        const align = p.getAttribute('align') || p.style.textAlign
        p.removeAttribute('class')
        p.removeAttribute('style')
        p.removeAttribute('align')
        if (align === 'center' || align === 'right' || align === 'justify') p.style.textAlign = align
      }
      continue
    }
    const empty = !(p.textContent ?? '').replace(/ /g, ' ').trim() && !p.querySelector('img')
    const level = p.tagName === 'P' && !empty ? headingLevelFor(p) : null
    const out = doc.createElement(level ? `h${level}` : p.tagName.toLowerCase())
    copyBlockStyle(p, out)
    // An empty line in Word is spacing on purpose: keep it as an empty line.
    out.innerHTML = empty ? '<br>' : p.innerHTML
    p.replaceWith(out)
  }
}

/** Pictures: file:// sources can't be read by the browser; use `images` (in order) instead. */
function replaceImages(doc: Document, images: string[]): number {
  let used = 0
  let missing = 0
  for (const img of Array.from(doc.body.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? ''
    if (/^(https?:|data:image\/(png|jpe?g|gif|webp))/i.test(src)) continue
    const url = images[used]
    if (url) {
      img.setAttribute('src', url)
      used++
    } else {
      img.remove()
      missing++
    }
  }
  return missing
}

/**
 * Word clipboard HTML → clean HTML for the editor. `images`: URLs of the
 * pictures in the order they appear (see rtfImages). Returns the HTML and how
 * many pictures could not be brought.
 */
export function cleanWordHtml(html: string, images: string[] = []): { html: string; missingImages: number } {
  const start = html.indexOf('<!--StartFragment-->')
  const end = html.indexOf('<!--EndFragment-->')
  const fragment = start >= 0 && end > start ? html.slice(start + 20, end) : html
  const doc = new DOMParser().parseFromString(`<body>${fragment.replace(/<o:p>[\s\S]*?<\/o:p>/gi, (m) => (m.includes('&nbsp;') ? '' : m))}</body>`, 'text/html')
  // VML shapes and Office-only tags.
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (el.tagName.includes(':')) el.replaceWith(...Array.from(el.childNodes))
  }
  for (const s of Array.from(doc.body.querySelectorAll('style, meta, link, xml, script'))) s.remove()
  rebuildLists(doc)
  cleanParagraphs(doc)
  cleanInline(doc)
  const missingImages = replaceImages(doc, images)
  return { html: doc.body.innerHTML, missingImages }
}

/* ------------------------------ RTF pictures ------------------------------ */

/**
 * Pictures inside the RTF copy Word also puts on the clipboard, in order
 * (PNG and JPEG only; the old metafile duplicates are skipped).
 */
export function rtfImages(rtf: string): { type: 'image/png' | 'image/jpeg'; bytes: Uint8Array }[] {
  const out: { type: 'image/png' | 'image/jpeg'; bytes: Uint8Array }[] = []
  let i = 0
  while ((i = rtf.indexOf('{\\pict', i)) >= 0) {
    // Find the end of the group.
    let depth = 0
    let j = i
    for (; j < rtf.length; j++) {
      const c = rtf[j]
      if (c === '\\') {
        j++
        continue
      }
      if (c === '{') depth++
      else if (c === '}' && --depth === 0) break
    }
    const group = rtf.slice(i, j + 1)
    const before = rtf.slice(Math.max(0, i - 40), i)
    i = j + 1
    if (/\\nonshppict/.test(before)) continue
    const type = /\\pngblip/.test(group) ? 'image/png' : /\\jpegblip/.test(group) ? 'image/jpeg' : null
    if (!type) continue
    // The picture data is a run of hex digits starting with the file's signature.
    const compact = group.replace(/\s+/g, '')
    const at = compact.search(type === 'image/png' ? /89504e470d0a1a0a/i : /ffd8ff/i)
    const hex = at >= 0 ? /^[0-9a-f]+/i.exec(compact.slice(at))?.[0] : undefined
    if (!hex || hex.length < 32) continue
    const bytes = new Uint8Array(Math.floor(hex.length / 2))
    for (let k = 0; k < bytes.length; k++) bytes[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16)
    out.push({ type, bytes })
  }
  return out
}
