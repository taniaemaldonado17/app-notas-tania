/*
 * calculo.js — Motor de cálculo del cómputo y presupuesto (sin interfaz).
 *
 * Funciona en el navegador (queda disponible como window.CPCalculo) y en Node.js
 * (const CPCalculo = require("./calculo.js")). No depende de ninguna librería.
 *
 * Modelo de datos de un proyecto (ver README.md para el detalle):
 *   {
 *     id: "etapa1",
 *     meta:  { nombre, creado, tc, cargas, coef, gg, ben, imp, rubros: [{ id, n }] },
 *     ins:   [{ c, d, u, t, p, f }],          // insumos: código, descripción, unidad, tipo, precio base, fuente
 *     items: [{ id, r, o, d, u, obs,          // ítems: rubro (id), orden, descripción, unidad, observaciones
 *               apu: [{ c, q }],              //   análisis de precios: código de insumo y cantidad (rendimiento)
 *               med: [{ s, d, n, l, a, h, k }] }] //  mediciones: sector, criterio, cant., largo, ancho, alto, coef.
 *   }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CPCalculo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TIPOS = { MAT: "Material", MO: "Mano de obra", EQ: "Equipo", SUB: "Subcontrato" };
  var CAMPOS_MEDICION = ["n", "l", "a", "h", "k"];

  function num(v) { var x = +v; return isFinite(x) ? x : 0; }

  /** Índice de insumos por código. */
  function indexarInsumos(ins) {
    var m = {};
    (ins || []).forEach(function (i) { m[i.c] = i; });
    return m;
  }

  /**
   * Precio de cálculo de un insumo.
   * Mano de obra: precio base x (1 + cargas sociales). Resto: precio base x coeficiente de ajuste.
   */
  function precioCalculo(insumo, meta) {
    if (!insumo) return 0;
    var p = num(insumo.p);
    return insumo.t === "MO" ? p * (1 + num(meta && meta.cargas)) : p * (meta && meta.coef != null && meta.coef !== "" ? num(meta.coef) : 1);
  }

  /** Parcial de una medición: producto de los campos cargados (los vacíos no intervienen). Sin campos = 0. */
  function parcialMedicion(m) {
    var any = false, p = 1;
    CAMPOS_MEDICION.forEach(function (k) {
      var v = m[k];
      if (v !== null && v !== undefined && v !== "") { any = true; p *= num(v); }
    });
    return any ? p : 0;
  }

  /** Cantidad, precio unitario abierto (materiales / mano de obra / equipos y subcontratos) y subtotal de un ítem. */
  function calcularItem(item, insMap, meta) {
    var q = 0, mat = 0, mo = 0, eq = 0;
    (item.med || []).forEach(function (m) { q += parcialMedicion(m); });
    (item.apu || []).forEach(function (l) {
      var i = insMap[l.c];
      if (!i) return;
      var v = num(l.q) * precioCalculo(i, meta);
      if (i.t === "MAT") mat += v; else if (i.t === "MO") mo += v; else eq += v;
    });
    var pu = mat + mo + eq;
    return { q: q, mat: mat, mo: mo, eq: eq, pu: pu, sub: q * pu };
  }

  /**
   * Arma la estructura ordenada del presupuesto y numera los ítems.
   * El código de cada ítem es "<n° de rubro>.<n° de ítem con 2 dígitos>" según el orden: nunca se repite.
   * Devuelve { rubros: [{ id, n, numero, subtotal, items: [{ item, codigo, calc }] }], total, insMap }.
   */
  function estructura(proyecto) {
    var meta = proyecto.meta || {};
    var insMap = indexarInsumos(proyecto.ins);
    var rubros = (meta.rubros || []).map(function (r, k) { return { id: r.id, n: r.n, numero: k + 1, subtotal: 0, items: [] }; });
    var porId = {};
    rubros.forEach(function (r) { porId[r.id] = r; });
    var sueltos = [];
    (proyecto.items || []).forEach(function (it) { (porId[it.r] ? porId[it.r].items : sueltos).push({ item: it }); });
    if (sueltos.length && rubros.length) Array.prototype.push.apply(rubros[rubros.length - 1].items, sueltos);
    var total = 0;
    rubros.forEach(function (r) {
      r.items.sort(function (a, b) { return (num(a.item.o) - num(b.item.o)) || String(a.item.id).localeCompare(String(b.item.id)); });
      r.items.forEach(function (x, k) {
        x.codigo = r.numero + "." + String(k + 1).padStart(2, "0");
        x.calc = calcularItem(x.item, insMap, meta);
        r.subtotal += x.calc.sub;
      });
      total += r.subtotal;
    });
    return { rubros: rubros, total: total, insMap: insMap };
  }

  /** Precio de venta: costo-costo x (1 + GG) x (1 + beneficio) x (1 + impuestos). */
  function precioVenta(total, meta) {
    var gg = num(meta.gg), ben = num(meta.ben), imp = num(meta.imp);
    var s1 = total * (1 + gg), s2 = s1 * (1 + ben), precio = s2 * (1 + imp);
    return { gastosGenerales: total * gg, subtotal1: s1, beneficio: s1 * ben, subtotal2: s2, impuestos: s2 * imp, precio: precio, coeficiente: total ? precio / total : 0 };
  }

  /** Controles de consistencia. Devuelve [{ nivel: "error"|"aviso", texto, itemId? }]. */
  function verificar(proyecto) {
    var st = estructura(proyecto), out = [], usos = usosDeInsumos(proyecto);
    st.rubros.forEach(function (r) {
      if (!r.items.length) out.push({ nivel: "aviso", texto: "El rubro " + r.numero + " “" + r.n + "” no tiene ítems." });
      r.items.forEach(function (x) {
        var it = x.item, c = x.calc, L = x.codigo + " " + it.d;
        if (!String(it.d || "").trim()) out.push({ nivel: "error", texto: "El ítem " + x.codigo + " no tiene descripción.", itemId: it.id });
        if (!(it.apu || []).length) out.push({ nivel: "error", texto: L + ": no tiene análisis de precios (P.U. = 0).", itemId: it.id });
        (it.apu || []).forEach(function (l) {
          if (!st.insMap[l.c]) out.push({ nivel: "error", texto: L + ": usa el insumo " + l.c + ", que no existe en Insumos.", itemId: it.id });
          else if (!num(l.q)) out.push({ nivel: "aviso", texto: L + ": el insumo " + l.c + " tiene cantidad 0.", itemId: it.id });
        });
        if (!(it.med || []).length) out.push({ nivel: "error", texto: L + ": no tiene mediciones (cantidad 0).", itemId: it.id });
        else if (!c.q) out.push({ nivel: "aviso", texto: L + ": la cantidad da 0.", itemId: it.id });
        if ((it.apu || []).length && !c.pu) out.push({ nivel: "aviso", texto: L + ": el precio unitario da 0.", itemId: it.id });
      });
    });
    (proyecto.ins || []).forEach(function (i) {
      if (usos[i.c] && !num(i.p)) out.push({ nivel: "aviso", texto: "El insumo " + i.c + " (" + i.d + ") tiene precio 0 y se usa en " + usos[i.c].length + " ítem(s)." });
    });
    var cuenta = {};
    (proyecto.ins || []).forEach(function (i) { cuenta[i.c] = (cuenta[i.c] || 0) + 1; });
    Object.keys(cuenta).forEach(function (c) { if (cuenta[c] > 1) out.push({ nivel: "error", texto: "El código de insumo " + c + " está repetido " + cuenta[c] + " veces." }); });
    return out;
  }

  /** Para cada código de insumo, la lista de ids de ítems que lo usan. */
  function usosDeInsumos(proyecto) {
    var u = {};
    (proyecto.items || []).forEach(function (it) {
      (it.apu || []).forEach(function (l) {
        u[l.c] = u[l.c] || [];
        if (u[l.c].indexOf(it.id) < 0) u[l.c].push(it.id);
      });
    });
    return u;
  }

  /** Resumen plano del presupuesto, útil para pasar a otro sistema. */
  function planilla(proyecto) {
    var st = estructura(proyecto);
    var filas = [];
    st.rubros.forEach(function (r) {
      filas.push({ tipo: "rubro", codigo: String(r.numero), descripcion: r.n, subtotal: r.subtotal });
      r.items.forEach(function (x) {
        filas.push({ tipo: "item", codigo: x.codigo, descripcion: x.item.d, unidad: x.item.u, cantidad: x.calc.q,
          puMateriales: x.calc.mat, puManoObra: x.calc.mo, puEquipos: x.calc.eq, puTotal: x.calc.pu, subtotal: x.calc.sub, observaciones: x.item.obs || "" });
      });
    });
    return { proyecto: (proyecto.meta || {}).nombre, total: st.total, venta: precioVenta(st.total, proyecto.meta || {}), filas: filas };
  }

  return {
    TIPOS: TIPOS, CAMPOS_MEDICION: CAMPOS_MEDICION,
    indexarInsumos: indexarInsumos, precioCalculo: precioCalculo, parcialMedicion: parcialMedicion,
    calcularItem: calcularItem, estructura: estructura, precioVenta: precioVenta,
    verificar: verificar, usosDeInsumos: usosDeInsumos, planilla: planilla
  };
});
