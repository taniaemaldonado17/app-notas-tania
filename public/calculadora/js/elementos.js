/*
 * elementos.js — Elementos compuestos del cálculo rápido (vigas, columnas, pilotines, bases, losas,
 * techos de chapa y alambrados). Cada elemento recibe medidas simples y devuelve los materiales.
 * Funciona en el navegador (window.CPElementos) y en Node.js (require("./elementos.js")).
 *
 * Criterios (editables en el código o como supuestos del catálogo):
 *  - Peso del acero: d² / 162 kg/m (d en mm). Barras de 12 m.
 *  - Estribo: perímetro bruto de la sección + 10 cm de ganchos (criterio de la planilla 2024:
 *    1,10 m para viga 20×30 y 1,00 m para 15×30). Cantidad: largo / separación + 1.
 *  - Barras longitudinales: largo × (1 + empalmes y anclajes).
 *  - Alambre de atar: supuesto "atar_pct" × kg de acero.
 *  - Hormigón hecho en obra: rendimiento de la mezcla (pérdida incluida). Elaborado: m³ + pérdida del material.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CPElementos = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DIAM = [6, 8, 10, 12, 16, 20, 25];
  var kgm = function (d) { return d * d / 162; };
  var n = function (v) { var x = +v; return isFinite(x) ? x : 0; };
  var ceil = function (x) { return Math.ceil(x - 1e-9); };
  var f2 = function (v) { return (Math.round(v * 100) / 100).toLocaleString("es-AR"); };

  var HORM = { k: "horm", label: "Hormigón", tipo: "sel", def: "H_EST", opciones: [["H_EST", "Hecho en obra: estructural"], ["H_FUND", "Hecho en obra: para fundaciones"], ["ELAB", "Elaborado (m³ de camión)"]] };
  var DSEL = function (k, label, def) { return { k: k, label: label, tipo: "sel", def: String(def), opciones: DIAM.map(function (d) { return [String(d), "Ø" + d]; }) }; };

  function acero(items, d, metros, notas, texto) {
    if (!(metros > 0)) return;
    items.push({ c: "A" + d, neto: metros * kgm(+d), acero: true });
    notas.push(texto + ": " + f2(metros) + " m de Ø" + d + " (" + f2(metros / 12) + " barras de 12 m)");
  }
  function hormigon(items, v, vol, ctx, notas) {
    if (!(vol > 0)) return;
    if (v.horm === "ELAB") { items.push({ c: "HORM", neto: vol }); notas.push("Hormigón: " + f2(vol) + " m³"); return; }
    var cont = ctx.mez[v.horm] || {};
    Object.keys(cont).forEach(function (m) { items.push({ c: m, neto: vol * cont[m], perdida: 0 }); });
    notas.push("Hormigón: " + f2(vol) + " m³ (" + (v.horm === "H_FUND" ? "para fundaciones" : "estructural") + ", hecho en obra)");
  }
  function alambreAtar(items, ctx) {
    var kg = items.filter(function (x) { return x.acero; }).reduce(function (s, x) { return s + x.neto; }, 0);
    if (kg > 0) items.push({ c: "ALAM", neto: kg * (ctx.vars.atar_pct != null ? ctx.vars.atar_pct : 0.015) });
  }

  var ELEMENTOS = [
    { id: "VIGA", nombre: "Viga o encadenado de H°A°", grupo: "Estructuras de H°A°", unidad: "ml",
      campos: [
        { k: "largo", label: "Largo de cada viga", u: "m", def: "" }, { k: "cant", label: "Cantidad de vigas", u: "u", def: 1 },
        { k: "b", label: "Ancho de la sección", u: "m", def: 0.2 }, { k: "h", label: "Alto de la sección", u: "m", def: 0.3 },
        { k: "sup_n", label: "Hierros arriba (perchas)", u: "u", def: 2, grupo: "Armadura" }, DSEL("sup_d", "Diámetro arriba", 10),
        { k: "inf_n", label: "Hierros abajo", u: "u", def: 2 }, DSEL("inf_d", "Diámetro abajo", 12),
        DSEL("est_d", "Estribos: diámetro", 6), { k: "est_s", label: "Estribos: separación", u: "m", def: 0.2 },
        { k: "emp", label: "Empalmes y anclajes", u: "%", def: 10, pct: true }, HORM],
      calcular: function (v, ctx) {
        var L = n(v.largo) * n(v.cant), items = [], notas = [], est = 2 * (n(v.b) + n(v.h)) + 0.1, nest = n(v.est_s) > 0 ? (ceil(n(v.largo) / n(v.est_s)) + 1) * n(v.cant) : 0;
        hormigon(items, v, n(v.b) * n(v.h) * L, ctx, notas);
        if (v.sup_d === v.inf_d) acero(items, v.sup_d, (n(v.sup_n) + n(v.inf_n)) * L * (1 + n(v.emp) / 100), notas, "Hierros longitudinales");
        else { acero(items, v.sup_d, n(v.sup_n) * L * (1 + n(v.emp) / 100), notas, "Hierros arriba"); acero(items, v.inf_d, n(v.inf_n) * L * (1 + n(v.emp) / 100), notas, "Hierros abajo"); }
        acero(items, v.est_d, nest * est, notas, nest + " estribos de " + f2(est) + " m");
        alambreAtar(items, ctx);
        return { cantidad: L, items: items, notas: notas,
          nombre: "Viga " + Math.round(n(v.b) * 100) + "×" + Math.round(n(v.h) * 100) + " · " + v.sup_n + "Ø" + v.sup_d + " arriba + " + v.inf_n + "Ø" + v.inf_d + " abajo · estribos Ø" + v.est_d + " c/" + Math.round(n(v.est_s) * 100) };
      } },
    { id: "COLUMNA", nombre: "Columna de H°A°", grupo: "Estructuras de H°A°", unidad: "ml",
      campos: [
        { k: "alto", label: "Alto de cada columna", u: "m", def: "" }, { k: "cant", label: "Cantidad de columnas", u: "u", def: 1 },
        { k: "b", label: "Lado a", u: "m", def: 0.2 }, { k: "h", label: "Lado b", u: "m", def: 0.2 },
        { k: "bar_n", label: "Hierros longitudinales", u: "u", def: 4, grupo: "Armadura" }, DSEL("bar_d", "Diámetro", 12),
        DSEL("est_d", "Estribos: diámetro", 6), { k: "est_s", label: "Estribos: separación", u: "m", def: 0.15 },
        { k: "emp", label: "Empalmes y anclajes", u: "%", def: 15, pct: true }, HORM],
      calcular: function (v, ctx) {
        var H = n(v.alto) * n(v.cant), items = [], notas = [], est = 2 * (n(v.b) + n(v.h)) + 0.1, nest = n(v.est_s) > 0 ? (ceil(n(v.alto) / n(v.est_s)) + 1) * n(v.cant) : 0;
        hormigon(items, v, n(v.b) * n(v.h) * H, ctx, notas);
        acero(items, v.bar_d, n(v.bar_n) * H * (1 + n(v.emp) / 100), notas, "Hierros longitudinales");
        acero(items, v.est_d, nest * est, notas, nest + " estribos de " + f2(est) + " m");
        alambreAtar(items, ctx);
        return { cantidad: H, items: items, notas: notas, nombre: "Columna " + Math.round(n(v.b) * 100) + "×" + Math.round(n(v.h) * 100) + " · " + v.bar_n + "Ø" + v.bar_d + " · estribos Ø" + v.est_d + " c/" + Math.round(n(v.est_s) * 100) };
      } },
    { id: "PILOTIN", nombre: "Pilotín de H°A°", grupo: "Estructuras de H°A°", unidad: "u",
      campos: [
        { k: "cant", label: "Cantidad de pilotines", u: "u", def: "" }, { k: "prof", label: "Profundidad", u: "m", def: 2 }, { k: "diam", label: "Diámetro", u: "m", def: 0.25 },
        { k: "bar_n", label: "Hierros longitudinales", u: "u", def: 4, grupo: "Armadura" }, DSEL("bar_d", "Diámetro", 8),
        DSEL("est_d", "Estribos: diámetro", 6), { k: "est_s", label: "Estribos: separación", u: "m", def: 0.2 },
        { k: "anc", label: "Anclaje en la viga", u: "m", def: 0.3 }, Object.assign({}, HORM, { def: "H_FUND" })],
      calcular: function (v, ctx) {
        var N = n(v.cant), P = n(v.prof), D = n(v.diam), items = [], notas = [], est = Math.PI * D + 0.1, nest = n(v.est_s) > 0 ? (ceil(P / n(v.est_s)) + 1) * N : 0;
        hormigon(items, v, Math.PI * D * D / 4 * P * N, ctx, notas);
        acero(items, v.bar_d, n(v.bar_n) * (P + n(v.anc)) * N, notas, "Hierros longitudinales");
        acero(items, v.est_d, nest * est, notas, nest + " estribos de " + f2(est) + " m");
        alambreAtar(items, ctx);
        return { cantidad: N, items: items, notas: notas, nombre: "Pilotín Ø" + Math.round(D * 100) + " cm × " + f2(P) + " m · " + v.bar_n + "Ø" + v.bar_d + " · estribos Ø" + v.est_d + " c/" + Math.round(n(v.est_s) * 100) };
      } },
    { id: "BASE", nombre: "Base aislada (zapata) de H°A°", grupo: "Estructuras de H°A°", unidad: "u",
      campos: [
        { k: "cant", label: "Cantidad de bases", u: "u", def: "" }, { k: "a", label: "Largo", u: "m", def: 1 }, { k: "b", label: "Ancho", u: "m", def: 1 }, { k: "h", label: "Alto", u: "m", def: 0.4 },
        DSEL("bar_d", "Parrilla: diámetro", 10), { k: "bar_s", label: "Parrilla: separación", u: "m", def: 0.15, grupo: "Armadura" },
        { k: "patas", label: "Patas o ganchos por barra", u: "m", def: 0.2 }, Object.assign({}, HORM, { def: "H_FUND" })],
      calcular: function (v, ctx) {
        var N = n(v.cant), A = n(v.a), B = n(v.b), s = n(v.bar_s), items = [], notas = [];
        hormigon(items, v, A * B * n(v.h) * N, ctx, notas);
        var m = s > 0 ? ((ceil(B / s) + 1) * (A + n(v.patas)) + (ceil(A / s) + 1) * (B + n(v.patas))) * N : 0;
        acero(items, v.bar_d, m, notas, "Parrilla en dos direcciones");
        alambreAtar(items, ctx);
        return { cantidad: N, items: items, notas: notas, nombre: "Base " + f2(A) + "×" + f2(B) + "×" + f2(n(v.h)) + " m · parrilla Ø" + v.bar_d + " c/" + Math.round(s * 100) };
      } },
    { id: "LOSA", nombre: "Losa, platea o contrapiso armado", grupo: "Estructuras de H°A°", unidad: "m²", medida: "m2",
      campos: [
        { k: "esp", label: "Espesor", u: "m", def: 0.12 },
        { k: "arm", label: "Armadura", tipo: "sel", def: "barras", opciones: [["barras", "Barras en dos direcciones"], ["malla", "Malla electrosoldada"], ["no", "Sin armadura"]], grupo: "Armadura" },
        DSEL("bar_d", "Barras: diámetro", 8), { k: "bar_s", label: "Barras: separación", u: "m", def: 0.2 },
        { k: "capas", label: "Capas de armadura", u: "u", def: 1 }, { k: "emp", label: "Empalmes / solapes", u: "%", def: 10, pct: true }, HORM],
      calcular: function (v, ctx) {
        var S = n(v.sup), items = [], notas = [];
        hormigon(items, v, S * n(v.esp), ctx, notas);
        if (v.arm === "barras" && n(v.bar_s) > 0) acero(items, v.bar_d, S * 2 / n(v.bar_s) * n(v.capas) * (1 + n(v.emp) / 100), notas, "Barras");
        if (v.arm === "malla") { items.push({ c: "MALLA", neto: S * n(v.capas) * (1 + n(v.emp) / 100) }); notas.push("Malla: " + f2(S * n(v.capas)) + " m² + solapes"); }
        if (v.arm !== "no") alambreAtar(items, ctx);
        return { cantidad: S, items: items, notas: notas, nombre: "Losa e=" + Math.round(n(v.esp) * 100) + " cm · " + (v.arm === "barras" ? "Ø" + v.bar_d + " c/" + Math.round(n(v.bar_s) * 100) + " en dos direcciones" : v.arm === "malla" ? "malla" : "sin armar") };
      } },
    { id: "TECHO", nombre: "Techo de chapa", grupo: "Techos y cercos", unidad: "m²",
      campos: [
        { k: "lf", label: "Largo del faldón (en pendiente)", u: "m", def: "" }, { k: "af", label: "Ancho del faldón", u: "m", def: "" }, { k: "nf", label: "Cantidad de faldones", u: "u", def: 1 },
        { k: "util", label: "Ancho útil de la chapa", u: "m", def: 1, grupo: "Chapa" }, { k: "lch", label: "Largo máximo de chapa (0 = a medida)", u: "m", def: 0 },
        { k: "sol", label: "Solape entre chapas a lo largo", u: "m", def: 0.15 }, { k: "torn", label: "Tornillos por m²", u: "u", def: 8 },
        { k: "aisl", label: "Aislación bajo chapa", tipo: "sel", def: "no", opciones: [["no", "No"], ["si", "Sí (lana de vidrio con foil)"]] }],
      calcular: function (v) {
        var LF = n(v.lf), AF = n(v.af), NF = n(v.nf), items = [], notas = [], S = LF * AF * NF;
        var cols = n(v.util) > 0 ? ceil(AF / n(v.util)) : 0, lch = n(v.lch), piezas = 1, largo = LF;
        if (lch > 0 && lch < LF) { piezas = ceil((LF - n(v.sol)) / (lch - n(v.sol))); largo = lch; }
        var chapas = cols * piezas * NF;
        if (chapas) { items.push({ c: "CHAPA", neto: chapas * largo }); notas.push(chapas + " chapas de " + f2(largo) + " m (" + cols + " por faldón a lo ancho" + (piezas > 1 ? ", " + piezas + " a lo largo" : "") + ")"); }
        if (S > 0) items.push({ c: "TORN", neto: S * n(v.torn) });
        if (v.aisl === "si" && S > 0) items.push({ c: "AISL", neto: S });
        return { cantidad: S, items: items, notas: notas, nombre: "Techo de chapa (ancho útil " + f2(n(v.util)) + " m, " + n(v.torn) + " tornillos/m²)" + (v.aisl === "si" ? " con aislación" : "") };
      } },
    { id: "ALAMBRADO", nombre: "Alambrado", grupo: "Techos y cercos", unidad: "ml",
      campos: [
        { k: "largo", label: "Largo del alambrado", u: "m", def: "" }, { k: "lisos", label: "Hilos de alambre liso", u: "u", def: 5 }, { k: "pua", label: "Hilos de alambre de púa", u: "u", def: 2 },
        { k: "sep", label: "Separación entre postes", u: "m", def: 10, grupo: "Postes y tensores" }, { k: "var", label: "Varillas entre postes", u: "u", def: 4 },
        { k: "tramo", label: "Tramo entre esquineros o estiradores", u: "m", def: 100 }],
      calcular: function (v) {
        var L = n(v.largo), items = [], notas = [], tramos = n(v.tramo) > 0 ? ceil(L / n(v.tramo)) : 1, vanos = n(v.sep) > 0 ? ceil(L / n(v.sep)) : 0;
        if (!(L > 0)) return { cantidad: 0, items: [], notas: [], nombre: "Alambrado" };
        items.push({ c: "ALISO", neto: L * n(v.lisos) * 1.03 }); items.push({ c: "APUA", neto: L * n(v.pua) * 1.03 });
        items.push({ c: "POSTE", neto: Math.max(vanos + 1 - (tramos + 1), 0) }); items.push({ c: "ESQUI", neto: tramos + 1 });
        items.push({ c: "VARILLA", neto: vanos * n(v.var) }); items.push({ c: "TORNIQ", neto: tramos * (n(v.lisos) + n(v.pua)) });
        notas.push(tramos + " tramo(s), " + vanos + " vanos entre postes; alambre +3 % por ataduras");
        return { cantidad: L, items: items, notas: notas, nombre: "Alambrado " + v.lisos + " lisos + " + v.pua + " púa · postes c/" + f2(n(v.sep)) + " m" };
      } }
  ];

  function porId(id) { return ELEMENTOS.filter(function (e) { return e.id === id; })[0] || null; }
  function valoresPorDefecto(el) { var v = {}; el.campos.forEach(function (c) { v[c.k] = c.def; }); return v; }

  return { ELEMENTOS: ELEMENTOS, DIAM: DIAM, kgm: kgm, porId: porId, valoresPorDefecto: valoresPorDefecto };
});
