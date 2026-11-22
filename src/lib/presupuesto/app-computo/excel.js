/*
 * excel.js — Importa y exporta proyectos en el formato de planilla de cómputo y presupuesto.
 *
 * Hojas: Resumen, Presupuesto, Analisis de Precios, Insumos, Computo metrico.
 * El Excel exportado lleva fórmulas y también sus valores calculados, así que otro software
 * que lea solo valores (sin recalcular) los encuentra igual.
 *
 * Requiere ExcelJS (incluido en js/vendor/exceljs.min.js) y calculo.js.
 * En Node.js: const CPExcel = require("./excel.js"); CPExcel.exportar(proyecto, require("exceljs")).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./calculo.js"));
  else root.CPExcel = factory(root.CPCalculo);
})(typeof self !== "undefined" ? self : this, function (C) {
  "use strict";

  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function norm(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function parseNum(s) {
    s = String(s == null ? "" : s).trim().replace(/\s|\$/g, "");
    if (s === "") return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var v = Number(s); return isFinite(v) ? v : null;
  }
  /** Valor visible de una celda de ExcelJS (resultado de fórmula, texto enriquecido, etc.). */
  function cv(cell) {
    var v = cell && cell.value;
    if (v == null) return null;
    if (typeof v === "object") {
      if (v instanceof Date) return v;
      if ("result" in v) { v = v.result; return (v && typeof v === "object") ? null : (v == null ? null : v); }
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join("");
      if ("text" in v) return v.text;
      return null;
    }
    return v;
  }
  function cn(c) { var v = cv(c); if (v === null || v === "") return null; return typeof v === "number" ? v : parseNum(v); }
  function cs(c) { var v = cv(c); return v == null ? "" : String(v).trim(); }
  function hoja(wb, clave) { return wb.worksheets.filter(function (w) { return norm(w.name).replace(/\s/g, "").indexOf(clave) >= 0; })[0]; }

  /**
   * Lee un .xlsx (ArrayBuffer) y devuelve { proyecto, notas }.
   * Empareja ítems, análisis y mediciones por código. Si un código está repetido en Presupuesto,
   * usa el análisis que aparece en el mismo orden y renumera.
   */
  async function importar(buffer, nombreArchivo, ExcelJS) {
    ExcelJS = ExcelJS || (typeof self !== "undefined" && self.ExcelJS);
    var wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    var wsI = hoja(wb, "insumo"), wsA = hoja(wb, "analisis"), wsC = hoja(wb, "computo"), wsP = hoja(wb, "presupuesto");
    if (!wsP || !wsI) throw new Error("El archivo no tiene las hojas Presupuesto e Insumos.");
    var meta = { nombre: String(nombreArchivo || "Proyecto importado").replace(/\.xlsx$/i, ""), creado: Date.now(),
      tc: cn(wsI.getCell("E4")) || 0, cargas: cn(wsI.getCell("E5")) || 0, coef: cn(wsI.getCell("E6")) || 1, gg: 0, ben: 0, imp: 0, rubros: [] };
    var ins = [], vistos = {}, r, k;
    for (r = 9; r <= wsI.rowCount; r++) {
      var c = cs(wsI.getCell(r, 1)); if (!c || vistos[c]) continue; vistos[c] = 1;
      var t = cs(wsI.getCell(r, 4)); if (!C.TIPOS[t]) t = "MAT";
      var p = cn(wsI.getCell(r, 7)); if (p === null) p = cn(wsI.getCell(r, 5)) || 0;
      ins.push({ c: c, d: cs(wsI.getCell(r, 2)), u: cs(wsI.getCell(r, 3)), t: t, p: p, f: cs(wsI.getCell(r, 6)) });
    }
    var bloques = [];
    if (wsA) for (r = 1; r <= wsA.rowCount; r++) {
      if (cs(wsA.getCell(r, 6)) === "Unidad:") {
        var b = { code: cs(wsA.getCell(r, 1)), lines: [] }; k = r + 2;
        while (k <= wsA.rowCount && cs(wsA.getCell(k, 6)) !== "Materiales") {
          var ic = cs(wsA.getCell(k, 3)); if (ic) b.lines.push({ c: ic, q: cn(wsA.getCell(k, 5)) || 0 }); k++;
        }
        bloques.push(b); r = k;
      }
    }
    var meds = [];
    if (wsC) for (r = 5; r <= wsC.rowCount; r++) {
      var mc = cs(wsC.getCell(r, 1)); if (!mc) continue;
      var m = { code: mc, s: cs(wsC.getCell(r, 2)), d: cs(wsC.getCell(r, 3)) };
      C.CAMPOS_MEDICION.forEach(function (kk, j) { var v = cn(wsC.getCell(r, 4 + j)); if (v !== null) m[kk] = v; });
      meds.push(m);
    }
    [wsP, hoja(wb, "resumen")].filter(Boolean).forEach(function (ws) {
      ws.eachRow(function (row) { row.eachCell(function (cell) {
        var tx = norm(cs(cell)); var key = tx.indexOf("gastos generales") === 0 ? "gg" : tx.indexOf("beneficio") === 0 ? "ben" : tx.indexOf("impuestos") === 0 ? "imp" : null;
        if (key) for (var c2 = cell.col + 1; c2 <= cell.col + 3; c2++) { var v = cn(ws.getCell(row.number, c2)); if (v !== null && v > 0 && v < 1) { meta[key] = v; break; } }
      }); });
    });
    var items = [], vistosI = {}, usadosB = [], usadosM = [], rubro = null;
    for (r = 5; r <= wsP.rowCount; r++) {
      var a = cs(wsP.getCell(r, 1)), d = cs(wsP.getCell(r, 2)), u = cs(wsP.getCell(r, 3));
      if (/total/i.test(d) && !u) break;
      if (d && !u && a) { rubro = { id: uid(), n: d }; meta.rubros.push(rubro); continue; }
      if (u && rubro) {
        var n = vistosI[a] || 0; vistosI[a] = n + 1;
        var B = bloques.filter(function (x) { return x.code === a; })[n]; if (B) usadosB.push(B);
        var md = [];
        if (n === 0) md = meds.filter(function (x) { return x.code === a; }).map(function (x) { usadosM.push(x); var o = {}; Object.keys(x).forEach(function (kk) { if (kk !== "code") o[kk] = x[kk]; }); return o; });
        if (!md.length) md = [{ s: "", d: "Cantidad importada", n: cn(wsP.getCell(r, 4)) || 0 }];
        var rid = rubro.id;
        items.push({ id: uid(), r: rid, o: items.filter(function (i) { return i.r === rid; }).length + 1, d: d, u: u, obs: cs(wsP.getCell(r, 11)), apu: B ? B.lines : [], med: md });
      }
    }
    if (!items.length) throw new Error("No encontré ítems en la hoja Presupuesto (se esperan desde la fila 5).");
    var IM = C.indexarInsumos(ins), faltan = {};
    items.forEach(function (it) { it.apu.forEach(function (l) { if (!IM[l.c]) faltan[l.c] = 1; }); });
    Object.keys(faltan).forEach(function (c) { ins.push({ c: c, d: "Insumo " + c + " (no estaba en la hoja Insumos)", u: "u", t: "MAT", p: 0, f: "Creado al importar" }); });
    var notas = [];
    if (meds.length - usadosM.length) notas.push("Se descartaron " + (meds.length - usadosM.length) + " mediciones de ítems que no están en el presupuesto.");
    if (bloques.length - usadosB.length) notas.push("Se descartaron " + (bloques.length - usadosB.length) + " análisis de ítems que no están en el presupuesto.");
    var rep = Object.keys(vistosI).filter(function (x) { return vistosI[x] > 1; }).length;
    if (rep) notas.push("Había " + rep + " códigos de ítem repetidos: quedaron renumerados.");
    if (Object.keys(faltan).length) notas.push("Faltaban " + Object.keys(faltan).length + " insumos: se crearon con precio 0.");
    return { proyecto: { id: uid(), meta: meta, ins: ins, items: items }, notas: notas };
  }

  /** Genera el .xlsx de un proyecto. Devuelve un ArrayBuffer (Buffer en Node). */
  async function exportar(proyecto, ExcelJS) {
    ExcelJS = ExcelJS || (typeof self !== "undefined" && self.ExcelJS);
    var st = C.estructura(proyecto), IM = st.insMap, M = proyecto.meta, wb = new ExcelJS.Workbook();
    var pc = function (i) { return C.precioCalculo(i, M); };
    var F = { name: "Arial", size: 10 }, FB = Object.assign({}, F, { bold: true });
    var AZUL = Object.assign({}, F, { color: { argb: "FF0000FF" } }), VERDE = Object.assign({}, F, { color: { argb: "FF008000" } });
    var HDR = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } }, RUB = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } }, AMA = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    var MON = "#,##0.00";
    var wsR = wb.addWorksheet("Resumen"), wsP = wb.addWorksheet("Presupuesto"), wsA = wb.addWorksheet("Analisis de Precios"), wsI = wb.addWorksheet("Insumos"), wsC = wb.addWorksheet("Computo metrico");
    function put(ws, r, c, v, o) { o = o || {}; var cell = ws.getCell(r, c); cell.value = v; cell.font = o.font || F; if (o.fmt) cell.numFmt = o.fmt; if (o.fill) cell.fill = o.fill; if (o.wrap) cell.alignment = { wrapText: true, vertical: "top" }; return cell; }
    function fx(f, res) { return { formula: f, result: isFinite(res) ? res : 0 }; }
    function hdr(ws, r, vals) { vals.forEach(function (v, i) { var c = put(ws, r, i + 1, v, { font: Object.assign({}, FB, { color: { argb: "FFFFFFFF" } }), fill: HDR }); c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; }); }
    function anchos(ws, a) { a.forEach(function (w, i) { ws.getColumn(i + 1).width = w; }); }

    // Insumos
    put(wsI, 1, 1, "INSUMOS – PRECIOS BASE (ARS)", { font: Object.assign({}, FB, { size: 13 }) });
    put(wsI, 4, 1, "Tipo de cambio de referencia (ARS/USD)"); put(wsI, 4, 5, +M.tc || 0, { fmt: MON, fill: AMA, font: AZUL });
    put(wsI, 5, 1, "Cargas sociales + asistencia + seguros s/ básico UOCRA"); put(wsI, 5, 5, +M.cargas || 0, { fmt: "0%", fill: AMA, font: AZUL });
    put(wsI, 6, 1, "Coeficiente de ajuste general de materiales y equipos"); put(wsI, 6, 5, M.coef == null ? 1 : +M.coef, { fmt: "0.00", fill: AMA, font: AZUL });
    hdr(wsI, 8, ["Código", "Descripción", "Un.", "Tipo", "Precio de cálculo (ARS)", "Fuente / referencia", "Precio base (ARS)"]);
    var IR = {};
    proyecto.ins.forEach(function (i, k) {
      var r = 9 + k; IR[i.c] = r;
      put(wsI, r, 1, i.c, { font: FB }); put(wsI, r, 2, i.d); put(wsI, r, 3, i.u); put(wsI, r, 4, i.t);
      put(wsI, r, 5, fx(i.t === "MO" ? "G" + r + "*(1+$E$5)" : "G" + r + "*$E$6", pc(i)), { fmt: MON });
      put(wsI, r, 6, i.f); put(wsI, r, 7, +i.p || 0, { fmt: MON, font: AZUL });
    });
    anchos(wsI, [11, 62, 7, 7, 16, 60, 16]);

    // Cómputo métrico
    put(wsC, 1, 1, "CÓMPUTO MÉTRICO – PLANILLA DE MEDICIONES", { font: Object.assign({}, FB, { size: 13 }) });
    put(wsC, 2, 1, "Parcial = Cant. x Largo x Ancho x Alto x Coef. La cantidad de cada ítem del Presupuesto es la suma de sus parciales.", { font: Object.assign({}, F, { italic: true }) });
    hdr(wsC, 4, ["Ítem", "Sector", "Medición / criterio", "Cant.", "Largo o Sup.", "Ancho", "Alto / esp.", "Coef.", "Parcial", "Un."]);
    var r = 5;
    st.rubros.forEach(function (R) { R.items.forEach(function (x) { (x.item.med || []).forEach(function (m) {
      put(wsC, r, 1, x.codigo, { font: FB }); put(wsC, r, 2, m.s || ""); put(wsC, r, 3, m.d || "");
      C.CAMPOS_MEDICION.forEach(function (kk, j) { if (m[kk] !== undefined && m[kk] !== null && m[kk] !== "") put(wsC, r, 4 + j, +m[kk], { fmt: "#,##0.00", font: AZUL }); });
      put(wsC, r, 9, fx("PRODUCT(D" + r + ":H" + r + ")", C.parcialMedicion(m)), { fmt: "#,##0.00" }); put(wsC, r, 10, x.item.u); r++;
    }); }); });
    var CL = Math.max(r - 1, 5) + 100;
    anchos(wsC, [8, 28, 62, 9, 12, 9, 10, 8, 13, 6]);

    // Análisis de precios
    put(wsA, 1, 1, "ANÁLISIS DE PRECIOS UNITARIOS (costo-costo: materiales + mano de obra + equipos)", { font: Object.assign({}, FB, { size: 13 }) });
    var AP = {}; r = 4;
    st.rubros.forEach(function (R) { R.items.forEach(function (x) {
      var it = x.item, c = x.calc;
      for (var cc = 1; cc <= 7; cc++) wsA.getCell(r, cc).fill = RUB;
      put(wsA, r, 1, x.codigo, { font: FB, fill: RUB }); put(wsA, r, 2, it.d, { font: FB, fill: RUB }); put(wsA, r, 6, "Unidad:", { font: FB, fill: RUB }); put(wsA, r, 7, it.u, { font: FB, fill: RUB }); r++;
      hdr(wsA, r, ["Tipo", "Insumo", "Código", "Un.", "Cantidad", "Precio unit. (ARS)", "Parcial (ARS)"]); r++;
      var f0 = r;
      (it.apu || []).forEach(function (l) {
        var i = IM[l.c], ir = IR[l.c];
        if (i && ir) {
          put(wsA, r, 1, fx("Insumos!$D$" + ir, i.t)); put(wsA, r, 2, fx("Insumos!$B$" + ir, i.d)); put(wsA, r, 3, l.c); put(wsA, r, 4, fx("Insumos!$C$" + ir, i.u));
          put(wsA, r, 6, fx("Insumos!$E$" + ir, pc(i)), { fmt: MON, font: VERDE });
        } else { put(wsA, r, 3, l.c); put(wsA, r, 6, 0, { fmt: MON }); }
        put(wsA, r, 5, +l.q || 0, { fmt: "#,##0.000", font: AZUL }); put(wsA, r, 7, fx("E" + r + "*F" + r, (+l.q || 0) * pc(i)), { fmt: MON }); r++;
      });
      var f1 = Math.max(r - 1, f0), rg = "$A$" + f0 + ":$A$" + f1, sg = "$G$" + f0 + ":$G$" + f1;
      put(wsA, r, 6, "Materiales"); put(wsA, r, 7, fx("SUMIF(" + rg + ",\"MAT\"," + sg + ")", c.mat), { fmt: MON }); var rm = r++;
      put(wsA, r, 6, "Mano de obra"); put(wsA, r, 7, fx("SUMIF(" + rg + ",\"MO\"," + sg + ")", c.mo), { fmt: MON }); var ro = r++;
      put(wsA, r, 6, "Equipos y subcontratos"); put(wsA, r, 7, fx("SUMIF(" + rg + ",\"EQ\"," + sg + ")+SUMIF(" + rg + ",\"SUB\"," + sg + ")", c.eq), { fmt: MON }); var re = r++;
      put(wsA, r, 6, "COSTO UNITARIO", { font: FB }); put(wsA, r, 7, fx("SUM(G" + rm + ":G" + re + ")", c.pu), { fmt: MON, font: FB, fill: AMA }); r += 2;
      AP[it.id] = [rm, ro, re];
    }); });
    anchos(wsA, [8, 70, 10, 7, 11, 24, 16]);

    // Presupuesto
    put(wsP, 1, 1, M.nombre + " – CÓMPUTO Y PRESUPUESTO (COSTO-COSTO)", { font: Object.assign({}, FB, { size: 13 }) });
    put(wsP, 2, 1, "Valores en pesos argentinos (ARS). Cantidades desde la hoja \"Computo metrico\"; precios unitarios desde la hoja \"Analisis de Precios\".", { font: Object.assign({}, F, { italic: true }) });
    hdr(wsP, 4, ["Ítem", "Descripción", "Un.", "Cantidad", "P.U. Materiales", "P.U. Mano de obra", "P.U. Equipos / Subc.", "P.U. Total", "Subtotal (ARS)", "Incid.", "Observaciones"]);
    var nItems = st.rubros.reduce(function (s, R) { return s + R.items.length; }, 0);
    var TOT = 5 + st.rubros.length + nItems + 1, sA = "'Analisis de Precios'", sC = "'Computo metrico'", filasRubro = [];
    r = 5;
    st.rubros.forEach(function (R) {
      var rr = r++; filasRubro.push(rr);
      for (var cc = 1; cc <= 11; cc++) wsP.getCell(rr, cc).fill = RUB;
      put(wsP, rr, 1, R.numero, { font: FB, fill: RUB }); put(wsP, rr, 2, R.n, { font: FB, fill: RUB });
      var f0 = r;
      R.items.forEach(function (x) {
        var c = x.calc, ap = AP[x.item.id];
        put(wsP, r, 1, x.codigo); put(wsP, r, 2, x.item.d, { wrap: true }); put(wsP, r, 3, x.item.u);
        put(wsP, r, 4, fx("SUMIF(" + sC + "!$A$5:$A$" + CL + ",A" + r + "," + sC + "!$I$5:$I$" + CL + ")", c.q), { fmt: "#,##0.00", font: VERDE });
        put(wsP, r, 5, fx(sA + "!$G$" + ap[0], c.mat), { fmt: MON, font: VERDE });
        put(wsP, r, 6, fx(sA + "!$G$" + ap[1], c.mo), { fmt: MON, font: VERDE });
        put(wsP, r, 7, fx(sA + "!$G$" + ap[2], c.eq), { fmt: MON, font: VERDE });
        put(wsP, r, 8, fx("SUM(E" + r + ":G" + r + ")", c.pu), { fmt: MON }); put(wsP, r, 9, fx("D" + r + "*H" + r, c.sub), { fmt: MON });
        put(wsP, r, 10, fx("IF($I$" + TOT + "=0,0,I" + r + "/$I$" + TOT + ")", st.total ? c.sub / st.total : 0), { fmt: "0.0%" });
        put(wsP, r, 11, x.item.obs || null, { font: Object.assign({}, F, { italic: true }) }); r++;
      });
      put(wsP, rr, 9, R.items.length ? fx("SUM(I" + f0 + ":I" + (r - 1) + ")", R.subtotal) : 0, { fmt: MON, font: FB, fill: RUB });
      put(wsP, rr, 10, fx("IF($I$" + TOT + "=0,0,I" + rr + "/$I$" + TOT + ")", st.total ? R.subtotal / st.total : 0), { fmt: "0.0%", font: FB, fill: RUB });
    });
    put(wsP, TOT, 2, "TOTAL COSTO-COSTO (ARS)", { font: FB, fill: AMA });
    put(wsP, TOT, 9, fx(filasRubro.length ? filasRubro.map(function (x) { return "I" + x; }).join("+") : "0", st.total), { fmt: MON, font: FB, fill: AMA });
    anchos(wsP, [8, 62, 6, 12, 15, 15, 15, 15, 18, 8, 44]);
    wsP.views = [{ state: "frozen", xSplit: 2, ySplit: 4 }];

    // Resumen
    put(wsR, 1, 1, M.nombre, { font: Object.assign({}, FB, { size: 14 }) });
    put(wsR, 2, 1, "Resumen de presupuesto por rubros – costo-costo", { font: Object.assign({}, F, { italic: true }) });
    hdr(wsR, 4, ["Rubro", "Descripción", "Costo-costo (ARS)", "Incidencia", "Equivalente (USD)"]);
    var RT = 5 + st.rubros.length, tc = +M.tc || 0;
    st.rubros.forEach(function (R, k) {
      var rr = 5 + k;
      put(wsR, rr, 1, R.numero); put(wsR, rr, 2, R.n); put(wsR, rr, 3, fx("Presupuesto!$I$" + filasRubro[k], R.subtotal), { fmt: MON, font: VERDE });
      put(wsR, rr, 4, fx("IF($C$" + RT + "=0,0,C" + rr + "/$C$" + RT + ")", st.total ? R.subtotal / st.total : 0), { fmt: "0.0%" });
      put(wsR, rr, 5, fx("IF(Insumos!$E$4=0,0,C" + rr + "/Insumos!$E$4)", tc ? R.subtotal / tc : 0), { fmt: MON });
    });
    put(wsR, RT, 2, "TOTAL COSTO-COSTO", { font: FB, fill: AMA }); put(wsR, RT, 3, fx("SUM(C5:C" + (RT - 1) + ")", st.total), { fmt: MON, font: FB, fill: AMA });
    put(wsR, RT, 4, fx("SUM(D5:D" + (RT - 1) + ")", st.total ? 1 : 0), { fmt: "0.0%", font: FB, fill: AMA });
    put(wsR, RT, 5, fx("IF(Insumos!$E$4=0,0,C" + RT + "/Insumos!$E$4)", tc ? st.total / tc : 0), { fmt: MON, font: FB, fill: AMA });
    var v = C.precioVenta(st.total, M), q = RT + 2;
    put(wsR, q, 2, "Coeficiente de pase"); put(wsR, q, 3, fx("IF(C" + RT + "=0,0,C" + (q + 6) + "/C" + RT + ")", v.coeficiente), { fmt: "0.0000" }); q++;
    put(wsR, q, 2, "Gastos generales"); put(wsR, q, 3, fx("C" + RT + "*D" + q, v.gastosGenerales), { fmt: MON }); put(wsR, q, 4, +M.gg || 0, { fmt: "0.0%", fill: AMA, font: AZUL }); q++;
    put(wsR, q, 2, "Sub-total 1"); put(wsR, q, 3, fx("C" + (q - 1) + "+C" + RT, v.subtotal1), { fmt: MON }); q++;
    put(wsR, q, 2, "Beneficio"); put(wsR, q, 3, fx("C" + (q - 1) + "*D" + q, v.beneficio), { fmt: MON }); put(wsR, q, 4, +M.ben || 0, { fmt: "0.0%", fill: AMA, font: AZUL }); q++;
    put(wsR, q, 2, "Sub-total 2"); put(wsR, q, 3, fx("C" + (q - 1) + "+C" + (q - 2), v.subtotal2), { fmt: MON }); q++;
    put(wsR, q, 2, "Impuestos (IVA, IIBB)"); put(wsR, q, 3, fx("C" + (q - 1) + "*D" + q, v.impuestos), { fmt: MON }); put(wsR, q, 4, +M.imp || 0, { fmt: "0.0%", fill: AMA, font: AZUL }); q++;
    put(wsR, q, 2, "PRECIO", { font: FB }); put(wsR, q, 3, fx("C" + (q - 1) + "+C" + (q - 2), v.precio), { fmt: MON, font: FB, fill: AMA });
    anchos(wsR, [8, 62, 20, 12, 18]);

    return wb.xlsx.writeBuffer();
  }

  return { importar: importar, exportar: exportar };
});
