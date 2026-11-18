/**
 * Importing tables (CSV / TSV / pasted from Excel or Google Sheets, Notion
 * exports) into a database: parsing, guessing each column's property type and
 * turning cells into row values. Pure functions, safe on client and server.
 */

import {
  newId,
  TITLE_PROPERTY_ID,
  type NumberFormat,
  type OptionColor,
  type PropertyDef,
  type PropertyType,
  type RowValue,
  type SelectOption,
} from '@/lib/db-types'

/** Most rows accepted in one import. */
export const MAX_IMPORT_ROWS = 5000

/** Column types offered when importing (computed ones make no sense here). */
export const IMPORTABLE_TYPES: PropertyType[] = [
  'text',
  'number',
  'select',
  'status',
  'multi_select',
  'date',
  'checkbox',
  'url',
  'email',
  'phone',
]

/* ------------------------------------------------------------------ */
/* Reading files                                                       */
/* ------------------------------------------------------------------ */

/**
 * Decodes a file's bytes. Notion and Google Sheets export UTF-8; Excel on
 * Spanish Windows often saves CSV as Windows-1252, so fall back to that.
 */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/* ------------------------------------------------------------------ */
/* CSV parsing                                                         */
/* ------------------------------------------------------------------ */

/** Picks the separator that splits the first lines most consistently. */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  let best = ','
  let bestScore = -1
  for (const d of ['\t', ';', ',', '|']) {
    const counts = sample.map((l) => countOutsideQuotes(l, d))
    if (!counts[0]) continue
    // Same count on every line wins; ties go to the higher count.
    const consistent = counts.filter((c) => c === counts[0]).length
    const score = consistent * 1000 + counts[0]
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === d && !quoted) n++
  }
  return n
}

/** RFC 4180 CSV parser (quoted fields, "" escapes, newlines inside quotes). */
export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const d = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
      } else {
        field += ch
      }
      i++
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === d) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (ch === '\r' && text[i + 1] === '\n') i++
    } else {
      field += ch
    }
    i++
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  // Drop fully empty lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export type ParsedTable = { headers: string[]; rows: string[][] }

/** First line = headers. Pads/trims every row to the header width. */
export function parseTable(text: string): ParsedTable | null {
  const all = parseDelimited(text)
  if (all.length === 0) return null
  const width = Math.max(...all.map((r) => r.length))
  const seen = new Map<string, number>()
  const headers = Array.from({ length: width }, (_, i) => {
    let h = (all[0][i] ?? '').trim() || `Columna ${i + 1}`
    const n = seen.get(h.toLowerCase()) ?? 0
    seen.set(h.toLowerCase(), n + 1)
    if (n) h = `${h} (${n + 1})`
    return h
  })
  const rows = all.slice(1).map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim()))
  return { headers, rows }
}

/* ------------------------------------------------------------------ */
/* Cell parsers                                                        */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
}

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * '2024-03-01', '01/03/2024' (día/mes), '1 de marzo de 2024',
 * 'March 1, 2024', '1 mar 2024'. Notion ranges ('A → B') and times keep
 * only the first date. Returns 'YYYY-MM-DD' or null.
 */
export function parseDate(raw: string, order: 'dmy' | 'mdy' = 'dmy'): string | null {
  const s = raw.split('→')[0].trim().toLowerCase()
  if (!s) return null
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[t\s])/)
  if (m) return isoDate(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:$|\s)/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const dmy = a > 12 ? true : b > 12 ? false : order === 'dmy'
    return dmy ? isoDate(+m[3], b, a) : isoDate(+m[3], a, b)
  }
  // 1 de marzo de 2024 · 1 marzo 2024 · 1-mar-2024
  m = s.match(/^(\d{1,2})(?:\s+de\s+|[\s-]+)([a-záéíóú]+)\.?(?:\s+de\s+|[\s,-]+)(\d{4})(?:$|[\s,])/)
  if (m && MONTHS[m[2]]) return isoDate(+m[3], MONTHS[m[2]], +m[1])
  // March 1, 2024
  m = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:$|[\s,])/)
  if (m && MONTHS[m[1]]) return isoDate(+m[3], MONTHS[m[1]], +m[2])
  return null
}

export type NumberParse = { value: number; format: NumberFormat | null }

/**
 * '210.000,00 €' → 210000 (eur) · 'US$ 1,250.50' → 1250.5 (usd) ·
 * '$ 1.500' → 1500 (ars) · '35%' → 0.35 (percent).
 * `decimal` is the column's decimal separator (see detectDecimal).
 */
export function parseNumber(raw: string, decimal: ',' | '.' = ','): NumberParse | null {
  let s = raw.trim()
  if (!s) return null
  let format: NumberFormat | null = null
  if (/€|\beur\b/i.test(s)) format = 'eur'
  else if (/us\$|u\$s|\busd\b/i.test(s)) format = 'usd'
  else if (/\$|\bars\b/i.test(s)) format = 'ars'
  else if (/%$/.test(s)) format = 'percent'
  s = s.replace(/€|us\$|u\$s|\$|\b(eur|usd|ars)\b|%/gi, '').replace(/\s/g, '')
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (!/^[-+]?\d[\d.,]*$/.test(s) && !/^[-+]?[.,]\d+$/.test(s)) return null
  const thousands = decimal === ',' ? '.' : ','
  s = s.split(thousands).join('')
  if (decimal === ',') s = s.replace(',', '.')
  if ((s.match(/\./g) ?? []).length > 1) return null
  let value = Number(s)
  if (!Number.isFinite(value)) return null
  if (negative) value = -value
  if (format === 'percent') value = value / 100
  return { value, format }
}

/** Decimal separator a column uses, judged from all its values. */
export function detectDecimal(values: string[]): ',' | '.' {
  let comma = 0
  let dot = 0
  for (const raw of values) {
    const s = raw.replace(/[^\d.,]/g, '')
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) comma++
      else dot++
    } else if (lastDot >= 0) {
      const dots = s.split('.').length - 1
      const after = s.length - lastDot - 1
      if (dots === 1 && after !== 3) dot++
    } else if (lastComma >= 0) {
      const commas = s.split(',').length - 1
      const after = s.length - lastComma - 1
      if (commas === 1 && after !== 3) comma++
    }
  }
  // Spanish style unless the column clearly uses a decimal point.
  return dot > comma ? '.' : ','
}

const TRUE_WORDS = new Set(['true', 'yes', 'sí', 'si', 'x', '✓', '✔', '✅', 'verdadero', 'checked', '1'])
const FALSE_WORDS = new Set(['false', 'no', '', 'falso', 'unchecked', '0'])

export function parseCheckbox(raw: string): boolean | null {
  const s = raw.trim().toLowerCase()
  if (TRUE_WORDS.has(s)) return true
  if (FALSE_WORDS.has(s)) return false
  return null
}

const URL_RE = /^(https?:\/\/|www\.)\S+$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[\d\s().-]{6,}$/

function isPhone(s: string): boolean {
  if (!PHONE_RE.test(s)) return false
  const digits = s.replace(/\D/g, '').length
  return digits >= 7 && digits <= 15 && (s.startsWith('+') || /[\s()]/.test(s.trim()))
}

/** Notion exports multi-select as 'A, B, C'. */
export function splitMulti(raw: string): string[] {
  return raw
    .split(/\s*[,;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/* ------------------------------------------------------------------ */
/* Type inference                                                      */
/* ------------------------------------------------------------------ */

export type ColumnGuess = {
  type: PropertyType
  numberFormat?: NumberFormat
  decimal: ',' | '.'
  dateOrder: 'dmy' | 'mdy'
}

function dateOrderOf(values: string[]): 'dmy' | 'mdy' {
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/)
    if (!m) continue
    if (+m[1] > 12) return 'dmy'
    if (+m[2] > 12) return 'mdy'
  }
  return 'dmy'
}

/** Guesses the best property type for one column from its values. */
export function guessColumn(header: string, cells: string[]): ColumnGuess {
  const values = cells.map((c) => c.trim()).filter(Boolean)
  const decimal = detectDecimal(values)
  const dateOrder = dateOrderOf(values)
  const base = { decimal, dateOrder }
  const h = header.toLowerCase()
  if (values.length === 0) {
    if (/fecha|date|vencim|deadline|inicio|fin\b|entrega|completion|due\b/.test(h)) return { type: 'date', ...base }
    return { type: 'text', ...base }
  }
  const all = (fn: (v: string) => boolean) => values.every(fn)

  if (all((v) => parseCheckbox(v) !== null) && new Set(values.map((v) => v.toLowerCase())).size <= 2 && !all((v) => /^[01]$/.test(v))) {
    return { type: 'checkbox', ...base }
  }
  if (all((v) => parseDate(v, dateOrder) !== null)) return { type: 'date', ...base }
  if (all((v) => URL_RE.test(v))) return { type: 'url', ...base }
  if (all((v) => EMAIL_RE.test(v))) return { type: 'email', ...base }
  if (all(isPhone)) return { type: 'phone', ...base }
  // Codes like '2024-001' or '0123' stay text: leading zeros would be lost.
  if (all((v) => parseNumber(v, decimal) !== null && !/^0\d/.test(v))) {
    const formats = values.map((v) => parseNumber(v, decimal)?.format).filter(Boolean) as NumberFormat[]
    const numberFormat = formats.length ? mostCommon(formats) : undefined
    return { type: 'number', numberFormat, ...base }
  }

  const longest = Math.max(...values.map((v) => v.length))
  const distinct = new Set(values)

  // Multi-select: comma-separated short labels that repeat across rows.
  if (values.some((v) => v.includes(',')) && longest <= 200) {
    const tokens = values.flatMap(splitMulti)
    const distinctTokens = new Set(tokens)
    const shortTokens = tokens.every((t) => t.length <= 40)
    if (shortTokens && distinctTokens.size <= 50 && distinctTokens.size < tokens.length) {
      return { type: 'multi_select', ...base }
    }
  }

  // Select: few, short, repeated values.
  const limit = Math.max(2, Math.min(30, Math.floor(values.length * 0.6)))
  if (longest <= 50 && distinct.size <= limit && distinct.size < values.length) {
    const isStatus = /estado|status|etapa/.test(h)
    return { type: isStatus ? 'status' : 'select', ...base }
  }
  // A single value repeated in a short table (e.g. all 'Activo').
  if (longest <= 50 && distinct.size === 1 && values.length >= 2) return { type: 'select', ...base }
  // Notion labels like '🟢 Active', '🔴 High': emoji + a word or two.
  if (longest <= 40 && distinct.size <= 30 && all((v) => /^\p{Extended_Pictographic}/u.test(v))) {
    return { type: /estado|status|etapa/.test(h) ? 'status' : 'select', ...base }
  }

  return { type: 'text', ...base }
}

function mostCommon<T>(list: T[]): T {
  const counts = new Map<T, number>()
  for (const x of list) counts.set(x, (counts.get(x) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** Notion-style coloured emojis at the start of an option set its colour. */
const EMOJI_COLORS: [RegExp, OptionColor][] = [
  [/^(🟢|✅|🟩|💚)/u, 'green'],
  [/^(🔴|🟥|❌|⛔|❤️)/u, 'red'],
  [/^(🟠|🟧|🧡)/u, 'orange'],
  [/^(🟡|🟨|💛|⚠️)/u, 'yellow'],
  [/^(🔵|🟦|💙)/u, 'blue'],
  [/^(🟣|🟪|💜)/u, 'purple'],
  [/^(🟤|🟫)/u, 'brown'],
  [/^(⚪|⚫|⬜|⬛|🔲|⏸️)/u, 'gray'],
]
const PALETTE: OptionColor[] = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'red', 'brown', 'gray']

function colorFor(name: string, index: number): OptionColor {
  for (const [re, color] of EMOJI_COLORS) if (re.test(name)) return color
  return PALETTE[index % PALETTE.length]
}

/* ------------------------------------------------------------------ */
/* Building rows                                                       */
/* ------------------------------------------------------------------ */

/** Where an imported column goes. */
export type ColumnTarget =
  | { kind: 'skip' }
  | { kind: 'title' }
  /** A new property of `type` named `name`. */
  | { kind: 'new'; name: string; type: PropertyType; numberFormat?: NumberFormat }
  /** An existing property of the database (appending rows). */
  | { kind: 'existing'; propertyId: string }

export type ImportRow = { title: string; values: Record<string, RowValue> }

export type ImportResult = {
  /** The full property list (existing ones, maybe with new options, + new ones). */
  properties: PropertyDef[]
  rows: ImportRow[]
  /** Ids of properties created by this import, in column order. */
  createdPropertyIds: string[]
}

function findOrAddOption(prop: PropertyDef, name: string): string {
  const options = (prop.options ??= [])
  const key = name.toLowerCase()
  const found = options.find((o) => o.name.toLowerCase() === key)
  if (found) return found.id
  const opt: SelectOption = { id: newId('opt'), name: name.slice(0, 100), color: colorFor(name, options.length) }
  options.push(opt)
  return opt.id
}

/** Turns one cell into a value for `prop` (adds select options as needed). */
function convertCell(raw: string, prop: PropertyDef, guess: ColumnGuess): RowValue | undefined {
  const s = raw.trim()
  if (!s) return undefined
  switch (prop.type) {
    case 'number':
    case 'formula': {
      const n = parseNumber(s, guess.decimal)
      return n ? n.value : undefined
    }
    case 'date':
    case 'created_time':
    case 'updated_time':
      return parseDate(s, guess.dateOrder) ?? undefined
    case 'checkbox':
      return parseCheckbox(s) ? true : undefined
    case 'select':
    case 'status':
      return findOrAddOption(prop, s)
    case 'multi_select': {
      const ids = [...new Set(splitMulti(s).map((t) => findOrAddOption(prop, t)))]
      return ids.length ? ids : undefined
    }
    case 'person':
    case 'relation':
    case 'backlink':
      return undefined
    default:
      return s.slice(0, 10_000)
  }
}

/**
 * Builds properties and rows from a parsed table and a target per column.
 * `existing` are the current properties when appending to a database.
 */
export function buildImport(
  table: ParsedTable,
  targets: ColumnTarget[],
  guesses: ColumnGuess[],
  existing: PropertyDef[] = []
): ImportResult {
  const properties: PropertyDef[] = existing.length
    ? existing.map((p) => ({ ...p, options: p.options ? p.options.map((o) => ({ ...o })) : undefined }))
    : [{ id: TITLE_PROPERTY_ID, name: 'Nombre', type: 'title' }]
  const createdPropertyIds: string[] = []

  // Resolve every column to a property (creating the new ones).
  const colProps: (PropertyDef | 'title' | null)[] = targets.map((t, i) => {
    if (t.kind === 'skip') return null
    if (t.kind === 'title') {
      const title = properties.find((p) => p.type === 'title')
      if (title && !existing.length) title.name = table.headers[i]
      return 'title'
    }
    if (t.kind === 'existing') return properties.find((p) => p.id === t.propertyId) ?? null
    const prop: PropertyDef = { id: newId('prop'), name: t.name.trim() || table.headers[i], type: t.type }
    if (t.type === 'number' && t.numberFormat) prop.numberFormat = t.numberFormat
    if (t.type === 'select' || t.type === 'status' || t.type === 'multi_select') prop.options = []
    properties.push(prop)
    createdPropertyIds.push(prop.id)
    return prop
  })

  const rows: ImportRow[] = table.rows.slice(0, MAX_IMPORT_ROWS).map((cells) => {
    const row: ImportRow = { title: '', values: {} }
    colProps.forEach((prop, i) => {
      if (!prop) return
      const raw = cells[i] ?? ''
      if (prop === 'title') {
        row.title = row.title ? `${row.title} ${raw}`.trim() : raw.slice(0, 2000)
        return
      }
      const v = convertCell(raw, prop, guesses[i])
      if (v !== undefined) row.values[prop.id] = v
    })
    return row
  })

  return { properties, rows, createdPropertyIds }
}

/** Picks a sensible title column: one named like a title, else the first text one. */
export function guessTitleColumn(headers: string[], guesses: ColumnGuess[]): number {
  const named = headers.findIndex((h) => /^(nombre|name|t[ií]tulo|title|tarea|task|proyecto|project( name)?|item( name)?)$/i.test(h.trim()))
  if (named >= 0) return named
  const text = guesses.findIndex((g) => g.type === 'text')
  return text >= 0 ? text : 0
}

/** Database title from a file name: drops extension and Notion's id suffix. */
export function titleFromFileName(name: string): string {
  return (
    name
      .replace(/\.(csv|tsv|txt)$/i, '')
      .replace(/_all$/i, '')
      .replace(/\s+[0-9a-f]{32}$/i, '')
      .replace(/^_+/, '')
      .trim() || 'Base importada'
  )
}
