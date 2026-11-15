/**
 * Small, safe formula language for database properties (no eval).
 *
 *   prop("Valor del contrato") - prop("Honorarios facturados")
 *   if(prop("Valor") > 0, prop("Facturado") / prop("Valor"), 0)
 *   dateBetween(prop("Entrega"), now(), "days")
 *
 * Supports numbers, "strings", true/false, + - * / %, comparisons
 * (== != > < >= <=), && || !, parentheses and the functions listed in
 * FUNCTIONS below.
 */

export type FormulaValue = number | string | boolean | null

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'eof' }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const n = Number(src.slice(i, j))
      if (Number.isNaN(n)) throw new Error(`Número inválido: ${src.slice(i, j)}`)
      tokens.push({ t: 'num', v: n })
      i = j
      continue
    }
    if (c === '"' || c === "'" || c === '“' || c === '”') {
      const close = c === '“' ? '”' : c
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== close && !(close === '"' && src[j] === '”')) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; continue }
        s += src[j]
        j++
      }
      if (j >= src.length) throw new Error('Falta cerrar comillas')
      tokens.push({ t: 'str', v: s })
      i = j + 1
      continue
    }
    if (/[A-Za-z_áéíóúñÁÉÍÓÚÑ]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_áéíóúñÁÉÍÓÚÑ]/.test(src[j])) j++
      tokens.push({ t: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    const two = src.slice(i, i + 2)
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      tokens.push({ t: 'op', v: two })
      i += 2
      continue
    }
    if ('+-*/%()<>!,='.includes(c)) {
      tokens.push({ t: 'op', v: c === '=' ? '==' : c })
      i++
      continue
    }
    throw new Error(`Carácter inesperado: ${c}`)
  }
  tokens.push({ t: 'eof' })
  return tokens
}

type Node =
  | { k: 'lit'; v: FormulaValue }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '>': 4,
  '<': 4,
  '>=': 4,
  '<=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
}

function parse(src: string): Node {
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expectOp = (v: string) => {
    const tk = next()
    if (tk.t !== 'op' || tk.v !== v) throw new Error(`Se esperaba "${v}"`)
  }

  function primary(): Node {
    const tk = next()
    if (tk.t === 'num') return { k: 'lit', v: tk.v }
    if (tk.t === 'str') return { k: 'lit', v: tk.v }
    if (tk.t === 'op' && tk.v === '(') {
      const e = expr(0)
      expectOp(')')
      return e
    }
    if (tk.t === 'op' && (tk.v === '-' || tk.v === '!')) {
      return { k: 'un', op: tk.v, a: expr(7) }
    }
    if (tk.t === 'id') {
      const lower = tk.v.toLowerCase()
      if (lower === 'true' || lower === 'verdadero') return { k: 'lit', v: true }
      if (lower === 'false' || lower === 'falso') return { k: 'lit', v: false }
      const p = peek()
      if (p.t === 'op' && p.v === '(') {
        next()
        const args: Node[] = []
        const close = peek()
        if (!(close.t === 'op' && close.v === ')')) {
          for (;;) {
            args.push(expr(0))
            const sep = next()
            if (sep.t === 'op' && sep.v === ')') break
            if (!(sep.t === 'op' && sep.v === ',')) throw new Error('Se esperaba "," o ")"')
          }
        } else {
          next()
        }
        return { k: 'call', name: lower, args }
      }
      throw new Error(`Nombre desconocido: ${tk.v}`)
    }
    throw new Error('Expresión incompleta')
  }

  function expr(minPrec: number): Node {
    let left = primary()
    for (;;) {
      const tk = peek()
      if (tk.t !== 'op') break
      const prec = PRECEDENCE[tk.v]
      if (prec === undefined || prec <= minPrec - 1 || prec < minPrec) break
      next()
      const right = expr(prec + 1)
      left = { k: 'bin', op: tk.v, a: left, b: right }
    }
    return left
  }

  const tree = expr(0)
  if (peek().t !== 'eof') throw new Error('Sobra texto al final de la fórmula')
  return tree
}

const cache = new Map<string, Node | Error>()
function compile(src: string): Node {
  let hit = cache.get(src)
  if (!hit) {
    try {
      hit = parse(src)
    } catch (err) {
      hit = err instanceof Error ? err : new Error(String(err))
    }
    cache.set(src, hit)
  }
  if (hit instanceof Error) throw hit
  return hit
}

function toNum(v: FormulaValue): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null || v === '') return 0
  const n = Number(String(v).replace(',', '.'))
  return Number.isNaN(n) ? 0 : n
}

function truthy(v: FormulaValue): boolean {
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  return !!v
}

function toDate(v: FormulaValue): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const d = new Date(`${v.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function nowISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const FORMULA_HELP: { sig: string; desc: string }[] = [
  { sig: 'prop("Nombre")', desc: 'Valor de otra propiedad' },
  { sig: 'if(condición, sí, no)', desc: 'Elige según una condición' },
  { sig: 'round(x, decimales)', desc: 'Redondea' },
  { sig: 'min(a, b) · max(a, b)', desc: 'Mínimo y máximo' },
  { sig: 'abs(x) · floor(x) · ceil(x)', desc: 'Valor absoluto y redondeos' },
  { sig: 'empty(x)', desc: 'Verdadero si está vacío' },
  { sig: 'length(x)', desc: 'Largo de un texto' },
  { sig: 'now()', desc: 'Fecha de hoy' },
  { sig: 'dateBetween(a, b, "days")', desc: 'Diferencia entre fechas (days, weeks, months, years)' },
  { sig: 'concat(a, b, …)', desc: 'Une textos' },
]

function call(name: string, args: FormulaValue[]): FormulaValue {
  switch (name) {
    case 'if': return truthy(args[0]) ? (args[1] ?? null) : (args[2] ?? null)
    case 'round': {
      const d = Math.max(0, Math.min(10, Math.trunc(toNum(args[1] ?? 0))))
      const f = 10 ** d
      return Math.round(toNum(args[0]) * f) / f
    }
    case 'floor': return Math.floor(toNum(args[0]))
    case 'ceil': return Math.ceil(toNum(args[0]))
    case 'abs': return Math.abs(toNum(args[0]))
    case 'min': return args.length ? Math.min(...args.map(toNum)) : null
    case 'max': return args.length ? Math.max(...args.map(toNum)) : null
    case 'sqrt': return Math.sqrt(toNum(args[0]))
    case 'tonumber': return toNum(args[0])
    case 'empty': return args[0] === null || args[0] === '' || args[0] === 0 || args[0] === false
    case 'not': return !truthy(args[0])
    case 'and': return args.every(truthy)
    case 'or': return args.some(truthy)
    case 'length': return args[0] === null ? 0 : String(args[0]).length
    case 'concat': return args.map((a) => (a === null ? '' : String(a))).join('')
    case 'now':
    case 'today': return nowISO()
    case 'datebetween': {
      const a = toDate(args[0])
      const b = toDate(args[1])
      if (!a || !b) return null
      const unit = String(args[2] ?? 'days').toLowerCase()
      const days = (a.getTime() - b.getTime()) / 86_400_000
      if (unit.startsWith('week') || unit.startsWith('semana')) return Math.trunc(days / 7)
      if (unit.startsWith('month') || unit.startsWith('mes')) {
        return (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth())
      }
      if (unit.startsWith('year') || unit.startsWith('año')) return a.getUTCFullYear() - b.getUTCFullYear()
      return Math.trunc(days)
    }
    default:
      throw new Error(`Función desconocida: ${name}`)
  }
}

/**
 * Evaluate a formula. `getProp` returns the value of a property by its
 * (case-insensitive) name, or undefined if it does not exist.
 */
export function evaluateFormula(
  src: string,
  getProp: (name: string) => FormulaValue | undefined
): FormulaValue {
  if (!src.trim()) return null
  const tree = compile(src)

  function ev(n: Node): FormulaValue {
    switch (n.k) {
      case 'lit':
        return n.v
      case 'un': {
        const a = ev(n.a)
        return n.op === '-' ? -toNum(a) : !truthy(a)
      }
      case 'bin': {
        if (n.op === '&&') return truthy(ev(n.a)) && truthy(ev(n.b))
        if (n.op === '||') return truthy(ev(n.a)) || truthy(ev(n.b))
        const a = ev(n.a)
        const b = ev(n.b)
        switch (n.op) {
          case '+':
            if (typeof a === 'string' || typeof b === 'string') {
              return `${a ?? ''}${b ?? ''}`
            }
            return toNum(a) + toNum(b)
          case '-': return toNum(a) - toNum(b)
          case '*': return toNum(a) * toNum(b)
          case '/': {
            const d = toNum(b)
            return d === 0 ? null : toNum(a) / d
          }
          case '%': {
            const d = toNum(b)
            return d === 0 ? null : toNum(a) % d
          }
          case '==': return a === b || (typeof a !== 'string' && typeof b !== 'string' && toNum(a) === toNum(b))
          case '!=': return !(a === b || (typeof a !== 'string' && typeof b !== 'string' && toNum(a) === toNum(b)))
          case '>': return typeof a === 'string' && typeof b === 'string' ? a > b : toNum(a) > toNum(b)
          case '<': return typeof a === 'string' && typeof b === 'string' ? a < b : toNum(a) < toNum(b)
          case '>=': return typeof a === 'string' && typeof b === 'string' ? a >= b : toNum(a) >= toNum(b)
          case '<=': return typeof a === 'string' && typeof b === 'string' ? a <= b : toNum(a) <= toNum(b)
          default: throw new Error(`Operador desconocido: ${n.op}`)
        }
      }
      case 'call': {
        if (n.name === 'prop') {
          const arg = n.args[0]
          if (!arg || arg.k !== 'lit' || typeof arg.v !== 'string') {
            throw new Error('prop() necesita el nombre entre comillas')
          }
          const v = getProp(arg.v)
          if (v === undefined) throw new Error(`No existe la propiedad "${arg.v}"`)
          return v
        }
        // Lazy branches for if()
        if (n.name === 'if') {
          return truthy(ev(n.args[0] ?? { k: 'lit', v: null }))
            ? ev(n.args[1] ?? { k: 'lit', v: null })
            : ev(n.args[2] ?? { k: 'lit', v: null })
        }
        return call(n.name, n.args.map(ev))
      }
    }
  }

  const result = ev(tree)
  if (typeof result === 'number' && !Number.isFinite(result)) return null
  return result
}

/** Returns an error message, or null if the formula parses. */
export function checkFormula(src: string): string | null {
  try {
    compile(src)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
