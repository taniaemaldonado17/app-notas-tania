/**
 * PDF of a work certificate (private works: comitente / contratista, no
 * government letterhead). Page 1 (portrait): work data, advance and repair
 * fund balances, amounts, net in words, signatures. Page 2+ (landscape): the
 * measurement sheet, item by item.
 */
import { jsPDF } from 'jspdf'
import * as autoTableModule from 'jspdf-autotable'
import type { CellInput, RowInput, UserOptions } from 'jspdf-autotable'
import { importeEnLetras } from './letras.ts'

export type PdfItem = {
  id: string
  rubroNumero: number
  rubroDescripcion: string
  codigo: string
  descripcion: string
  unidad: string | null
  cantidad: number
  precioUnitario: number
  importe: number
}

export type PdfCertificado = {
  numero: number
  fecha: string
  periodo: string | null
  rectificado: boolean
  rectificadoEn: string | null
  porcentajeAvance: number
  montoBruto: number
  montoBrutoAcumulado: number
  descuentoAnticipo: number
  anticipoAcumulado: number
  descuentoFondoReparo: number
  sustitucionFondoReparo: number
  fondoReparoAcumulado: number
  montoNeto: number
  saldoObra: number
  saldoAnticipo: number
  lineas: { contratoItemId: string; anterior: number; presente: number; acumulado: number; importePresente: number }[]
}

export type PdfDatos = {
  obra: string
  ubicacion: string | null
  contrato: {
    montoContrato: number
    /** Contract price / costo-costo: the foja divides by it. */
    coeficientePase: number
    anticipoPct: number
    fondoReparoPct: number
    fondoReparoTipo: string
    polizaAseguradora: string | null
    polizaNumero: string | null
    polizaMonto: number | null
    comitente: string | null
    contratista: string | null
    numero: string | null
    mesBasico: string | null
    fechaContrato: string | null
    fechaInicio: string | null
    fechaFin: string | null
    plazo: string | null
  }
  items: PdfItem[]
  certificado: PdfCertificado
}

// The CommonJS build puts the function at `default` (bundlers) or
// `default.default` (plain Node ESM interop); accept both.
type AutoTable = (doc: jsPDF, options: UserOptions) => void
const autoTableExport = (autoTableModule as unknown as { default: AutoTable | { default: AutoTable } }).default
const autoTable: AutoTable = typeof autoTableExport === 'function' ? autoTableExport : autoTableExport.default

/* ------------------------------------------------------------------ */
/* Formato                                                              */
/* ------------------------------------------------------------------ */

const ars = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cant = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const $ = (v: number) => `$ ${ars.format(v)}`
const $o = (v: number) => (Math.abs(v) < 0.005 ? '-' : $(v))
const pct = (v: number) => `${ars.format(v * 100)} %`
const pctO = (v: number) => (Math.abs(v) < 1e-7 ? '-' : pct(v))
const fecha = (iso: string | null | undefined) => {
  if (!iso) return '-'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

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
const BORDE = 180

/* ------------------------------------------------------------------ */
/* Planilla de medición (certificado y foja)                            */
/* ------------------------------------------------------------------ */

/** Item-by-item measurement sheet: advance (previous, present, accumulated) and amounts. */
function dibujarPlanilla(doc: jsPDF, d: PdfDatos, startY: number, margen: number) {
  const c = d.certificado
  const k = d.contrato
  const anchoH = doc.internal.pageSize.getWidth() - margen * 2
  const lineas = new Map(c.lineas.map((l) => [l.contratoItemId, l]))
  const total = k.montoContrato || 1
  const body: RowInput[] = []
  const tot = { ant: 0, pres: 0, acum: 0 }
  let rubroActual: number | null = null
  const filasRubro: number[] = []

  for (const it of d.items) {
    if (it.rubroNumero !== rubroActual) {
      rubroActual = it.rubroNumero
      const delRubro = d.items.filter((x) => x.rubroNumero === it.rubroNumero)
      const sum = (f: (l: PdfCertificado['lineas'][number] | undefined, x: PdfItem) => number) => delRubro.reduce((s, x) => s + f(lineas.get(x.id), x), 0)
      const importeRubro = sum((_, x) => x.importe)
      const ant = sum((l, x) => (l?.anterior ?? 0) * x.importe)
      const acum = sum((l, x) => (l?.acumulado ?? 0) * x.importe)
      filasRubro.push(body.length)
      body.push([
        String(it.rubroNumero),
        { content: t(it.rubroDescripcion).toUpperCase(), colSpan: 4 },
        $(importeRubro),
        pctO(importeRubro / total),
        pctO(importeRubro ? ant / importeRubro : 0),
        pctO(importeRubro ? (acum - ant) / importeRubro : 0),
        pctO(importeRubro ? acum / importeRubro : 0),
        $o(ant),
        $o(acum - ant),
        $o(acum),
      ])
    }
    const l = lineas.get(it.id)
    const ant = (l?.anterior ?? 0) * it.importe
    const pres = l?.importePresente ?? 0
    const acum = (l?.acumulado ?? 0) * it.importe
    tot.ant += ant
    tot.pres += pres
    tot.acum += acum
    body.push([
      it.codigo,
      t(it.descripcion),
      t(it.unidad) || '-',
      cant.format(it.cantidad),
      $(it.precioUnitario),
      $(it.importe),
      pctO(it.importe / total),
      pctO(l?.anterior ?? 0),
      pctO(l?.presente ?? 0),
      pctO(l?.acumulado ?? 0),
      $o(ant),
      $o(pres),
      $o(acum),
    ])
  }
  const right = { halign: 'right' as const }
  body.push([
    { content: 'TOTAL', colSpan: 5, styles: { fontStyle: 'bold' } },
    { content: $(k.montoContrato), styles: { fontStyle: 'bold', ...right } },
    { content: '100,00 %', styles: right },
    { content: pctO(tot.ant / total), styles: { fontStyle: 'bold', ...right } },
    { content: pctO(tot.pres / total), styles: { fontStyle: 'bold', ...right } },
    { content: pctO(tot.acum / total), styles: { fontStyle: 'bold', ...right } },
    { content: $o(tot.ant), styles: { fontStyle: 'bold', ...right } },
    { content: $o(tot.pres), styles: { fontStyle: 'bold', ...right } },
    { content: $o(tot.acum), styles: { fontStyle: 'bold', ...right } },
  ])

  autoTable(doc, {
    startY,
    theme: 'grid',
    margin: { left: margen, right: margen, bottom: 12 },
    tableWidth: anchoH,
    styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1, lineColor: BORDE, lineWidth: 0.12, textColor: 20, overflow: 'linebreak' },
    headStyles: { fillColor: GRIS, textColor: 20, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    head: [
      [
        { content: 'Ítem', rowSpan: 2 },
        { content: 'Designación', rowSpan: 2 },
        { content: 'Un.', rowSpan: 2 },
        { content: 'Cantidad', rowSpan: 2 },
        { content: 'Precio unitario', rowSpan: 2 },
        { content: 'Importe', rowSpan: 2 },
        { content: 'Incid.', rowSpan: 2 },
        { content: 'Avance del ítem', colSpan: 3 },
        { content: 'Importes certificados', colSpan: 3 },
      ],
      ['Anterior', 'Presente', 'Acumulado', 'Anterior', 'Presente', 'Acumulado'],
    ],
    body,
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 9, halign: 'center' },
      3: { cellWidth: 15, ...right },
      4: { cellWidth: 21, ...right },
      5: { cellWidth: 23, ...right },
      6: { cellWidth: 12, ...right },
      7: { cellWidth: 16, ...right },
      8: { cellWidth: 16, ...right },
      9: { cellWidth: 16, ...right },
      10: { cellWidth: 22, ...right },
      11: { cellWidth: 22, ...right },
      12: { cellWidth: 22, ...right },
    },
    didParseCell: (h) => {
      if (h.section !== 'body') return
      if (filasRubro.includes(h.row.index)) {
        h.cell.styles.fillColor = [232, 236, 244]
        h.cell.styles.fontStyle = 'bold'
        // Rubro rows: the description spans 4 columns, numbers align right.
        if (h.column.index >= 5) h.cell.styles.halign = 'right'
      }
    },
  })
}

/* ------------------------------------------------------------------ */
/* Generación                                                           */
/* ------------------------------------------------------------------ */

export function generarPdfCertificado(d: PdfDatos): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const c = d.certificado
  const k = d.contrato
  const margen = 14
  const ancho = doc.internal.pageSize.getWidth() - margen * 2

  const tabla = (opts: UserOptions) =>
    autoTable(doc, {
      theme: 'grid',
      margin: { left: margen, right: margen },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, lineColor: BORDE, lineWidth: 0.15, textColor: 20 },
      headStyles: { fillColor: GRIS, textColor: 20, fontStyle: 'bold' },
      ...opts,
    })
  const finY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  /* ------------------------------ Título ------------------------------ */
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`CERTIFICADO DE OBRA N° ${c.numero}`, margen, 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(t([c.periodo && `Período: ${c.periodo}`, `Fecha: ${fecha(c.fecha)}`].filter(Boolean).join('   ·   ')), margen, 23.5)
  if (c.rectificado) {
    doc.setTextColor(170, 90, 0)
    doc.text(t(`RECTIFICADO${c.rectificadoEn ? ` el ${fecha(c.rectificadoEn)}` : ''}`), margen + ancho, 18, { align: 'right' })
    doc.setTextColor(20)
  }

  /* ---------------------------- Datos de obra ---------------------------- */
  const L = (s: string): CellInput => ({ content: s, styles: { fontStyle: 'bold', fillColor: GRIS } })
  tabla({
    startY: 28,
    body: [
      [L('OBRA'), { content: t(d.obra).toUpperCase(), colSpan: 3, styles: { fontStyle: 'bold' } }],
      [L('UBICACIÓN'), { content: t(d.ubicacion) || '-', colSpan: 3 }],
      [L('COMITENTE'), t(k.comitente) || '-', L('CONTRATISTA'), t(k.contratista) || '-'],
      [L('CONTRATO N°'), t(k.numero) || '-', L('MONTO DE CONTRATO'), $(k.montoContrato)],
      [L('FECHA DE CONTRATO'), fecha(k.fechaContrato), L('MES BÁSICO'), t(k.mesBasico) || '-'],
      [L('INICIO DE OBRA'), fecha(k.fechaInicio), L('FIN DE OBRA'), fecha(k.fechaFin)],
      [L('PLAZO'), t(k.plazo) || '-', L('AVANCE ACUMULADO'), pct(c.porcentajeAvance)],
    ],
    columnStyles: { 0: { cellWidth: 36 }, 2: { cellWidth: 36 } },
  })

  /* ------------------------------ Balances ------------------------------ */
  const seccion = (titulo: string, filas: [string, string, boolean?][], startY: number) => {
    tabla({
      startY,
      head: [[{ content: titulo, colSpan: 2 }]],
      body: filas.map(([a, b, fuerte]) => [
        { content: a, styles: fuerte ? { fontStyle: 'bold' } : {} },
        { content: b, styles: { halign: 'right', ...(fuerte ? { fontStyle: 'bold' } : {}) } },
      ]),
      columnStyles: { 1: { cellWidth: 48 } },
    })
    return finY() + 3
  }

  const anticipoTotal = k.montoContrato * k.anticipoPct
  const fondoTope = k.montoContrato * k.fondoReparoPct
  const brutoAnterior = c.montoBrutoAcumulado - c.montoBruto
  let y = finY() + 4

  if (k.anticipoPct > 0) {
    y = seccion(
      'BALANCE DE ANTICIPO FINANCIERO',
      [
        [`Anticipo financiero (${pct(k.anticipoPct)} del contrato)`, $(anticipoTotal)],
        ['Descuentos anteriores', $o(c.anticipoAcumulado - c.descuentoAnticipo)],
        ['Descuento del presente certificado', $o(c.descuentoAnticipo)],
        ['Total descontado a la fecha', $(c.anticipoAcumulado), true],
        ['Saldo de anticipo a descontar', $(c.saldoAnticipo), true],
      ],
      y
    )
  }

  const poliza = k.fondoReparoTipo === 'poliza'
  const detallePoliza = t(
    [k.polizaAseguradora, k.polizaNumero && `póliza N° ${k.polizaNumero}`, k.polizaMonto && $(k.polizaMonto)].filter(Boolean).join(' - ')
  )
  if (k.fondoReparoPct > 0) {
    y = seccion(
      'BALANCE DEL FONDO DE REPARO',
      [
        [`Fondo de reparo (${pct(k.fondoReparoPct)} del contrato)${poliza ? ` - sustituido por póliza${detallePoliza ? `: ${detallePoliza}` : ''}` : ''}`, $(fondoTope)],
        ['Retenciones anteriores', $o(c.fondoReparoAcumulado - c.descuentoFondoReparo)],
        ['Retención del presente certificado', $o(c.descuentoFondoReparo)],
        ['Total retenido a la fecha', $(c.fondoReparoAcumulado), true],
      ],
      y
    )
  }

  y = seccion(
    'CERTIFICACIÓN DE OBRA',
    [
      ['Importe acumulado de certificados anteriores', $o(brutoAnterior)],
      ['Importe del presente certificado', $(c.montoBruto)],
      ['Total certificado a la fecha', $(c.montoBrutoAcumulado), true],
      ['Falta ejecutar de obra', $(c.saldoObra), true],
    ],
    y
  )

  const filasPresente: [string, string, boolean?][] = [
    ['Importe del presente certificado', $(c.montoBruto)],
    ['Descuento por anticipo financiero', c.descuentoAnticipo ? `- ${$(c.descuentoAnticipo)}` : '-'],
    ['Retención por fondo de reparo', c.descuentoFondoReparo ? `- ${$(c.descuentoFondoReparo)}` : '-'],
  ]
  if (c.sustitucionFondoReparo) filasPresente.push(['Sustitución del fondo de reparo por póliza', `+ ${$(c.sustitucionFondoReparo)}`])
  filasPresente.push(['IMPORTE NETO A COBRAR', $(c.montoNeto), true])
  y = seccion('PRESENTE CERTIFICADO', filasPresente, y)

  tabla({
    startY: y,
    body: [[{ content: `IMPORTE NETO EN LETRAS: ${importeEnLetras(c.montoNeto)}`, styles: { fontStyle: 'bold' } }]],
  })
  y = finY() + 6

  /* ------------------------------- Firmas ------------------------------- */
  const pageH = doc.internal.pageSize.getHeight()
  if (y > pageH - 40) {
    doc.addPage('a4', 'portrait')
    y = 20
  }
  const firmas = [
    ['CONTRATISTA', k.contratista],
    ['DIRECCIÓN DE OBRA', null],
    ['COMITENTE', k.comitente],
  ] as const
  const anchoFirma = (ancho - 8) / 3
  firmas.forEach(([rol, nombre], i) => {
    const x = margen + i * (anchoFirma + 4)
    doc.setDrawColor(BORDE)
    doc.rect(x, y, anchoFirma, 30)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(t(rol), x + 2.5, y + 4.5)
    if (nombre) {
      doc.setFont('helvetica', 'normal')
      doc.text(doc.splitTextToSize(t(nombre), anchoFirma - 5).slice(0, 1), x + 2.5, y + 8.5)
    }
    doc.setFont('helvetica', 'normal')
    doc.setDrawColor(120)
    doc.line(x + 4, y + 22, x + anchoFirma - 4, y + 22)
    doc.setFontSize(7)
    doc.text('Firma y aclaración', x + anchoFirma / 2, y + 25, { align: 'center' })
    doc.text('Fecha:', x + 2.5, y + 28.5)
  })

  /* ------------------------- Planilla de medición ------------------------- */
  doc.addPage('a4', 'landscape')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(t(`PLANILLA DE MEDICIÓN - CERTIFICADO N° ${c.numero}`), margen, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(t(`${d.obra}${c.periodo ? ` - ${c.periodo}` : ''}`), margen, 18.5)

  dibujarPlanilla(doc, d, 22, margen)

  /* ---------------------------- Pie de página ---------------------------- */
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120)
    doc.text(t(`${d.obra} - Certificado N° ${c.numero}`), margen, h - 6)
    doc.text(`Página ${i} de ${paginas}`, w - margen, h - 6, { align: 'right' })
    doc.setTextColor(20)
  }

  return doc.output('arraybuffer')
}

/* ------------------------------------------------------------------ */
/* Foja de medición para el contratista (costo-costo)                   */
/* ------------------------------------------------------------------ */

/**
 * Same advance as the certificate, at costo-costo prices (contract price /
 * pass coefficient), with no advance payment or repair fund: what's paid to
 * the contractor for the period. A4 landscape.
 */
export function generarPdfFoja(d: PdfDatos): ArrayBuffer {
  const coef = d.contrato.coeficientePase || 1
  const c = d.certificado
  // Contract amounts back to costo-costo.
  const cc: PdfDatos = {
    ...d,
    contrato: { ...d.contrato, montoContrato: d.contrato.montoContrato / coef },
    items: d.items.map((i) => ({ ...i, precioUnitario: i.precioUnitario / coef, importe: i.importe / coef })),
    certificado: { ...c, lineas: c.lineas.map((l) => ({ ...l, importePresente: l.importePresente / coef })) },
  }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const margen = 12
  const ancho = doc.internal.pageSize.getWidth() - margen * 2
  const k = d.contrato

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(t(`FOJA DE MEDICIÓN N° ${c.numero}`), margen, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90)
  doc.text(t('Para pago al contratista - importes a costo-costo (sin coeficiente de pase, anticipo ni fondo de reparo)'), margen, 20)
  doc.setTextColor(20)
  doc.text(t([c.periodo && `Período: ${c.periodo}`, `Fecha: ${fecha(c.fecha)}`].filter(Boolean).join('   ·   ')), margen + ancho, 15, { align: 'right' })

  const L = (s: string): CellInput => ({ content: s, styles: { fontStyle: 'bold', fillColor: GRIS } })
  autoTable(doc, {
    startY: 23,
    theme: 'grid',
    margin: { left: margen, right: margen },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.3, lineColor: BORDE, lineWidth: 0.15, textColor: 20 },
    body: [
      [L('OBRA'), { content: t(d.obra).toUpperCase(), styles: { fontStyle: 'bold' } }, L('CONTRATISTA'), t(k.contratista) || '-'],
      [L('UBICACIÓN'), t(d.ubicacion) || '-', L('CONTRATO N°'), t(k.numero) || '-'],
    ],
    columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 28 }, 3: { cellWidth: 70 } },
  })
  const finY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  dibujarPlanilla(doc, cc, finY() + 4, margen)

  /* Totals at costo-costo */
  const totalCc = cc.contrato.montoContrato
  const presente = cc.certificado.lineas.reduce((s, l) => s + l.importePresente, 0)
  const acumulado = cc.items.reduce((s, i) => s + (cc.certificado.lineas.find((l) => l.contratoItemId === i.id)?.acumulado ?? 0) * i.importe, 0)
  let y = finY() + 5
  if (y > doc.internal.pageSize.getHeight() - 62) {
    doc.addPage('a4', 'landscape')
    y = 18
  }
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: margen + ancho - 120, right: margen },
    tableWidth: 120,
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.5, lineColor: BORDE, lineWidth: 0.15, textColor: 20 },
    head: [[{ content: 'RESUMEN A COSTO-COSTO', colSpan: 2, styles: { fillColor: GRIS, textColor: 20 } }]],
    body: [
      ['Total de obra (costo-costo)', { content: $(totalCc), styles: { halign: 'right' } }],
      ['Acumulado anterior', { content: $o(acumulado - presente), styles: { halign: 'right' } }],
      [{ content: 'A PAGAR EN ESTA FOJA', styles: { fontStyle: 'bold' } }, { content: $(presente), styles: { halign: 'right', fontStyle: 'bold' } }],
      ['Acumulado a la fecha', { content: $(acumulado), styles: { halign: 'right' } }],
      ['Saldo de obra', { content: $(totalCc - acumulado), styles: { halign: 'right' } }],
    ],
  })

  /* Signatures: contractor and site management */
  y = finY() + 8
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage('a4', 'landscape')
    y = 18
  }
  const anchoFirma = 80
  ;([['CONTRATISTA', k.contratista], ['DIRECCIÓN DE OBRA', null]] as const).forEach(([rol, nombre], i) => {
    const x = margen + i * (anchoFirma + 8)
    doc.setDrawColor(BORDE)
    doc.rect(x, y, anchoFirma, 28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(t(rol), x + 2.5, y + 4.5)
    if (nombre) {
      doc.setFont('helvetica', 'normal')
      doc.text(doc.splitTextToSize(t(nombre), anchoFirma - 5).slice(0, 1), x + 2.5, y + 8.5)
    }
    doc.setFont('helvetica', 'normal')
    doc.setDrawColor(120)
    doc.line(x + 4, y + 20, x + anchoFirma - 4, y + 20)
    doc.setFontSize(7)
    doc.text('Firma y aclaración', x + anchoFirma / 2, y + 23, { align: 'center' })
    doc.text('Fecha:', x + 2.5, y + 26.5)
  })

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    const w = doc.internal.pageSize.getWidth()
    const h = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120)
    doc.text(t(`${d.obra} - Foja de medición N° ${c.numero} (costo-costo)`), margen, h - 6)
    doc.text(`Página ${i} de ${paginas}`, w - margen, h - 6, { align: 'right' })
    doc.setTextColor(20)
  }
  return doc.output('arraybuffer')
}
