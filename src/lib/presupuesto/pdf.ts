/**
 * PDF of a "cómputo y presupuesto", A4 portrait.
 * First: data, parameters, totals, sale price (when loaded) and summary by rubro.
 * Then: the detailed budget, rubro by rubro, item by item.
 */
import { jsPDF } from 'jspdf'
import * as autoTableModule from 'jspdf-autotable'
import type { CellInput, RowInput, UserOptions } from 'jspdf-autotable'
import { precioVenta } from './calculo.ts'
import { derivarDetalle, type Snapshot } from './local.ts'

// The CommonJS build puts the function at `default` (bundlers) or
// `default.default` (plain Node ESM interop); accept both.
type AutoTable = (doc: jsPDF, options: UserOptions) => void
const autoTableExport = (autoTableModule as unknown as { default: AutoTable | { default: AutoTable } }).default
const autoTable: AutoTable = typeof autoTableExport === 'function' ? autoTableExport : autoTableExport.default

const ars = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cant = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const fino = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 })
const $ = (v: number) => `$ ${ars.format(v)}`
const usd = (v: number) => `US$ ${ars.format(v)}`
const pct = (v: number) => `${ars.format(v * 100)} %`

/** The standard PDF fonts only cover Latin-1: replace the few symbols outside it. */
function t(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/[–—−]/g, '-')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/≈/g, '~')
    .replace(/[^\x00-\xFF]/g, '?')
}

const GRIS = 245
const RUBRO = 232
const BORDE = 180

export function generarPdfPresupuesto(s: Snapshot, hoy = new Date()): ArrayBuffer {
  const { info, calc } = derivarDetalle(s)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margen = 12
  const ancho = doc.internal.pageSize.getWidth() - margen * 2

  const tabla = (opts: UserOptions) =>
    autoTable(doc, {
      theme: 'grid',
      margin: { left: margen, right: margen, top: 14, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, lineColor: BORDE, lineWidth: 0.15, textColor: 20, overflow: 'linebreak' },
      headStyles: { fillColor: GRIS, textColor: 20, fontStyle: 'bold' },
      ...opts,
    })
  const finY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const derecha = { halign: 'right' as const }
  const fuerte = { fontStyle: 'bold' as const }

  /* ------------------------------ Título ------------------------------ */
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text('CÓMPUTO Y PRESUPUESTO', margen, 16)
  doc.setTextColor(20)
  doc.setFontSize(14)
  const titulo = doc.splitTextToSize(t(info.nombre).toUpperCase(), ancho - 40) as string[]
  doc.text(titulo, margen, 22.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Fecha: ${hoy.toLocaleDateString('es-AR')}`, margen + ancho, 16, { align: 'right' })
  let y = 22.5 + titulo.length * 6
  if (info.descripcion) {
    doc.setTextColor(90)
    const desc = doc.splitTextToSize(t(info.descripcion), ancho) as string[]
    doc.text(desc, margen, y)
    y += desc.length * 3.8 + 1
    doc.setTextColor(20)
  }

  /* ---------------------------- Datos y parámetros ---------------------------- */
  const L = (s: string): CellInput => ({ content: s, styles: { fontStyle: 'bold', fillColor: GRIS } })
  const sup = (v: number | null) => (v ? `${cant.format(v)} m²` : '-')
  tabla({
    startY: y + 1,
    body: [
      ...(info.ubicacion ? [[L('UBICACIÓN'), { content: t(info.ubicacion), colSpan: 3 }]] : []),
      [L('TIPO DE CAMBIO'), info.tipoCambio ? `${$(info.tipoCambio)} por US$` : '-', L('CARGAS SOCIALES'), `${pct(info.cargasSociales)} (mano de obra)`],
      [L('COEF. DE AJUSTE'), `${fino.format(info.coefAjuste)} (materiales y equipos)`, L('RUBROS / ÍTEMS'), `${calc.rubros.length} / ${calc.cantidadItems}`],
      [L('SUP. CUBIERTA'), t(sup(info.superficieCubierta)), L('SUP. DEL PREDIO'), t(sup(info.superficiePredio))],
    ] as RowInput[],
    columnStyles: { 0: { cellWidth: 34 }, 2: { cellWidth: 34 } },
  })

  /* ------------------------------ Totales ------------------------------ */
  const totales: [string, string][] = [['COSTO-COSTO', $(calc.total)]]
  if (calc.totalUsd !== null) totales.push(['EN DÓLARES', usd(calc.totalUsd)])
  if (calc.porM2Cubierto !== null) totales.push(['POR M² CUBIERTO', $(calc.porM2Cubierto)])
  tabla({
    startY: finY() + 3,
    head: [totales.map(([k]) => ({ content: t(k), styles: { halign: 'center' } }))],
    body: [totales.map(([, v], k) => ({ content: v, styles: { halign: 'center', fontStyle: 'bold', fontSize: k === 0 ? 11 : 10 } }))],
  })

  /* ---------------------------- Precio de venta ---------------------------- */
  if (info.gastosGenerales || info.beneficio || info.impuestos) {
    const v = precioVenta(calc.total, info)
    const fila = (a: string, b: string, negrita = false): RowInput => [
      { content: a, styles: negrita ? fuerte : {} },
      { content: b, styles: { ...derecha, ...(negrita ? fuerte : {}) } },
    ]
    tabla({
      startY: finY() + 3,
      head: [[{ content: 'PRECIO DE VENTA', colSpan: 2 }]],
      pageBreak: 'avoid',
      body: [
        fila('Costo-costo', $(calc.total)),
        fila(`Gastos generales (${pct(info.gastosGenerales)})`, $(v.gastosGenerales)),
        fila('Subtotal', $(v.subtotal1)),
        fila(`Beneficio (${pct(info.beneficio)})`, $(v.beneficio)),
        fila('Subtotal', $(v.subtotal2)),
        fila(`Impuestos (${pct(info.impuestos)})`, $(v.impuestos)),
        fila('PRECIO DE VENTA', $(v.precio), true),
        fila('Coeficiente de pase', fino.format(v.coeficiente)),
      ],
      columnStyles: { 1: { cellWidth: 40 } },
      tableWidth: 110,
      margin: { left: margen + ancho - 110, right: margen },
    })
  }

  /* ---------------------------- Resumen por rubro ---------------------------- */
  const conUsd = calc.totalUsd !== null
  tabla({
    startY: finY() + 5,
    head: [
      [
        { content: 'N°', styles: { halign: 'center' } },
        'RUBRO',
        { content: 'COSTO-COSTO', styles: derecha },
        ...(conUsd ? [{ content: 'US$', styles: derecha }] : []),
        { content: 'INCID.', styles: derecha },
      ],
    ],
    body: [
      ...calc.rubros.map((r) => [
        { content: String(r.numero), styles: { halign: 'center' as const } },
        t(r.descripcion),
        { content: $(r.total), styles: derecha },
        ...(conUsd ? [{ content: ars.format(r.totalUsd ?? 0), styles: derecha }] : []),
        { content: pct(r.incidencia), styles: derecha },
      ]),
      [
        { content: '', styles: { fillColor: GRIS } },
        { content: 'TOTAL COSTO-COSTO', styles: { ...fuerte, fillColor: GRIS } },
        { content: $(calc.total), styles: { ...derecha, ...fuerte, fillColor: GRIS } },
        ...(conUsd ? [{ content: ars.format(calc.totalUsd ?? 0), styles: { ...derecha, ...fuerte, fillColor: GRIS } }] : []),
        { content: '100,00 %', styles: { ...derecha, ...fuerte, fillColor: GRIS } },
      ],
    ] as RowInput[],
    columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 34 }, ...(conUsd ? { 3: { cellWidth: 26 }, 4: { cellWidth: 18 } } : { 3: { cellWidth: 18 } }) },
  })

  /* ---------------------------- Presupuesto detallado ---------------------------- */
  // Right after the summary if there's room; otherwise on a new page.
  let yDetalle = finY() + 10
  if (yDetalle > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage()
    yDetalle = 16
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('PRESUPUESTO DETALLADO', margen, yDetalle)

  const cuerpo: RowInput[] = []
  for (const r of calc.rubros) {
    const estilo = { fillColor: RUBRO, fontStyle: 'bold' as const }
    cuerpo.push([
      { content: String(r.numero), styles: estilo },
      { content: t(r.descripcion), colSpan: 4, styles: estilo },
      { content: $(r.total), styles: { ...estilo, halign: 'right' } },
      { content: pct(r.incidencia), styles: { ...estilo, halign: 'right' } },
    ])
    if (!r.items.length) {
      cuerpo.push([{ content: '' }, { content: 'Sin ítems.', colSpan: 6, styles: { textColor: 120, fontStyle: 'italic' } }])
    }
    for (const i of r.items) {
      cuerpo.push([
        i.codigo,
        { content: t(i.descripcion) + (i.observaciones ? `\n${t(i.observaciones)}` : '') },
        t(i.unidad) || '-',
        { content: cant.format(i.cantidad), styles: derecha },
        { content: $(i.puTotal), styles: derecha },
        { content: $(i.subtotal), styles: derecha },
        { content: pct(i.incidencia), styles: derecha },
      ])
    }
  }
  cuerpo.push([
    { content: 'TOTAL COSTO-COSTO', colSpan: 5, styles: { ...fuerte, fillColor: GRIS } },
    { content: $(calc.total), styles: { ...derecha, ...fuerte, fillColor: GRIS } },
    { content: '100,00 %', styles: { ...derecha, ...fuerte, fillColor: GRIS } },
  ])

  tabla({
    startY: yDetalle + 4,
    head: [
      [
        'ÍTEM',
        'DESCRIPCIÓN',
        'UN.',
        { content: 'CANTIDAD', styles: derecha },
        { content: 'P. UNITARIO', styles: derecha },
        { content: 'SUBTOTAL', styles: derecha },
        { content: 'INCID.', styles: derecha },
      ],
    ],
    body: cuerpo,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: 12 },
      2: { cellWidth: 11 },
      3: { cellWidth: 19 },
      4: { cellWidth: 27 },
      5: { cellWidth: 29 },
      6: { cellWidth: 15 },
    },
  })

  /* ---------------------------- Pie de página ---------------------------- */
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120)
    const pie = doc.splitTextToSize(t(`${info.nombre} - Cómputo y presupuesto`), w - margen * 2 - 30) as string[]
    doc.text(pie[0], margen, h - 6)
    doc.text(`Página ${i} de ${paginas}`, w - margen, h - 6, { align: 'right' })
    doc.setTextColor(20)
  }

  return doc.output('arraybuffer')
}
