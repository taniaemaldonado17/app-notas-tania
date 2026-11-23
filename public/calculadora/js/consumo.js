/*
 * consumo.js — Motor de la calculadora de consumo de materiales (sin interfaz).
 * Funciona en el navegador (window.CPConsumo) y en Node.js (require("./consumo.js")).
 *
 * Catálogo:
 *   supuestos:  [{ k, d, v, u, obs }]   valores con nombre; v puede ser número o fórmula ("PI/4*0.006^2*7850")
 *   materiales: [{ c, d, u, dens, perdida, compra, factor, paso, precio, ins, obs }]
 *               u = unidad de cálculo (kg, m3, u, L, m2…); dens = kg/m³ aparente (para mezclas por partes)
 *               compra = unidad de compra ("bolsa 50 kg"); factor = cuántas u de cálculo trae (número o fórmula)
 *               paso = múltiplo de compra (1 = enteras, 0.5 = medios m³, 100 = de a cien)
 *               ins = código del insumo del proyecto para tomar el precio (opcional)
 *   mezclas:    [{ c, d, modo: "partes" | "m3", comp: [{ m, p }] }]
 *               partes: dosificación en volumen; por m³ de mezcla = p / Σp × volumen seco (× densidad si es kg)
 *               m3:     cantidad directa de cada material por m³ de mezcla
 *   trabajos:   [{ c, d, grupo, u, perdida: "material" | "incluida", params: [{ k, d, v, u }],
 *                  comp: [{ tipo: "mezcla" | "material", ref, f }], obs }]
 *               f = fórmula por unidad de trabajo: m³ de mezcla (tipo mezcla) o cantidad del material.
 *               En las fórmulas se pueden usar los supuestos, los parámetros del trabajo y el contenido
 *               de cada mezcla por m³ como MEZCLA.MATERIAL (ej. M_IMP.CEM).
 * Lista de cálculo: { id, nombre, lineas: [{ id, t, nota, cant, params: {}, vinc: { iid } | null }] }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CPConsumo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------ fórmulas
  // Gramática: números (punto o coma decimal), nombres (letras, dígitos, _ y .), + - * / ^ ( ), PI.
  function tokenizar(s) {
    var t = [], i = 0; s = String(s == null ? "" : s);
    while (i < s.length) {
      var ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1] || ""))) {
        var j = i; while (j < s.length && /[0-9.,]/.test(s[j])) j++;
        var txt = s.slice(i, j).replace(",", ".");
        if (isNaN(+txt)) throw new Error("Número mal escrito: " + s.slice(i, j));
        t.push({ n: +txt }); i = j; continue;
      }
      if (/[A-Za-z_]/.test(ch)) { var k = i; while (k < s.length && /[A-Za-z0-9_.]/.test(s[k])) k++; t.push({ id: s.slice(i, k) }); i = k; continue; }
      if ("+-*/^()".indexOf(ch) >= 0) { t.push({ op: ch }); i++; continue; }
      throw new Error("Carácter no permitido: " + ch);
    }
    return t;
  }
  function evaluar(expr, vars) {
    if (typeof expr === "number") return expr;
    var t = tokenizar(expr), p = 0;
    if (!t.length) return 0;
    function ver(o) { return t[p] && t[p].op === o; }
    function suma() { var v = prod(); while (ver("+") || ver("-")) { var o = t[p++].op, w = prod(); v = o === "+" ? v + w : v - w; } return v; }
    function prod() { var v = pot(); while (ver("*") || ver("/")) { var o = t[p++].op, w = pot(); v = o === "*" ? v * w : v / w; } return v; }
    function pot() { var v = un(); if (ver("^")) { p++; v = Math.pow(v, pot()); } return v; }
    function un() { if (ver("-")) { p++; return -un(); } if (ver("+")) { p++; return un(); } return at(); }
    function at() {
      var x = t[p++];
      if (!x) throw new Error("La fórmula está incompleta");
      if ("n" in x) return x.n;
      if (x.id) {
        if (x.id.toUpperCase() === "PI") return Math.PI;
        if (vars && Object.prototype.hasOwnProperty.call(vars, x.id)) return +vars[x.id];
        throw new Error("No existe “" + x.id + "”");
      }
      if (x.op === "(") { var v = suma(); if (!ver(")")) throw new Error("Falta cerrar un paréntesis"); p++; return v; }
      throw new Error("Sobra “" + x.op + "”");
    }
    var r = suma();
    if (p < t.length) throw new Error("Sobra “" + (t[p].op || t[p].id || t[p].n) + "”");
    if (!isFinite(r)) throw new Error("El resultado no es un número (¿división por cero?)");
    return r;
  }

  // ------------------------------------------------------------ catálogo resuelto
  /** Calcula supuestos, factores de compra y contenido de cada mezcla. Devuelve { vars, mat, mez, errores }. */
  function resolver(cat) {
    var errores = [], vars = {}, pendientes = (cat.supuestos || []).slice();
    for (var vuelta = 0; vuelta < 20 && pendientes.length; vuelta++) {
      pendientes = pendientes.filter(function (s) {
        try { vars[s.k] = evaluar(s.v, vars); return false; } catch (e) { if (vuelta === 19) errores.push({ donde: "Supuesto " + s.k, msg: e.message }); return true; }
      });
    }
    pendientes.forEach(function (s) { vars[s.k] = 0; if (!errores.some(function (e) { return e.donde === "Supuesto " + s.k; })) errores.push({ donde: "Supuesto " + s.k, msg: "No se pudo calcular" }); });
    var mat = {};
    (cat.materiales || []).forEach(function (m) {
      var f = 1; try { f = evaluar(m.factor == null || m.factor === "" ? 1 : m.factor, vars); if (!(f > 0)) throw new Error("debe ser mayor que 0"); } catch (e) { errores.push({ donde: "Material " + m.c + " (factor de compra)", msg: e.message }); f = 1; }
      mat[m.c] = Object.assign({}, m, { factorN: f, pasoN: +m.paso > 0 ? +m.paso : 1, perdidaN: +m.perdida || 0 });
    });
    var mez = {}, volSeco = vars.vol_seco != null ? vars.vol_seco : 1;
    (cat.mezclas || []).forEach(function (z) {
      var cont = {}, tot = 0;
      (z.comp || []).forEach(function (x) { tot += +x.p || 0; });
      (z.comp || []).forEach(function (x) {
        var m = mat[x.m], p = +x.p || 0;
        if (!m) { errores.push({ donde: "Mezcla " + z.c, msg: "El material " + x.m + " no existe" }); return; }
        if (z.modo === "m3") cont[x.m] = (cont[x.m] || 0) + p;
        else {
          var vol = tot ? p / tot * volSeco : 0;
          var q = m.u === "kg" ? vol * (+m.dens || 0) : m.u === "L" ? vol * 1000 : vol;
          if (m.u === "kg" && !(+m.dens)) errores.push({ donde: "Mezcla " + z.c, msg: "Falta la densidad de " + m.c + " para pasar partes a kg" });
          cont[x.m] = (cont[x.m] || 0) + q;
        }
      });
      mez[z.c] = cont;
      Object.keys(cont).forEach(function (k) { vars[z.c + "." + k] = cont[k]; });
    });
    return { vars: vars, mat: mat, mez: mez, errores: errores };
  }

  function trabajoPorCodigo(cat, c) { return (cat.trabajos || []).filter(function (t) { return t.c === c; })[0] || null; }

  /** Consumo por unidad de trabajo: { porMaterial: {c: cantidad}, errores }. */
  function consumoUnitario(trabajo, params, ctx) {
    var vars = Object.assign({}, ctx.vars), out = {}, errores = [];
    (trabajo.params || []).forEach(function (p) {
      var v = params && params[p.k] != null && params[p.k] !== "" ? params[p.k] : p.v;
      try { vars[p.k] = evaluar(v, ctx.vars); } catch (e) { vars[p.k] = 0; errores.push({ donde: trabajo.c + " · " + p.k, msg: e.message }); }
    });
    (trabajo.comp || []).forEach(function (x) {
      var q;
      try { q = evaluar(x.f, vars); } catch (e) { errores.push({ donde: trabajo.c + " · " + x.ref, msg: e.message }); return; }
      if (x.tipo === "mezcla") {
        var cont = ctx.mez[x.ref];
        if (!cont) { errores.push({ donde: trabajo.c, msg: "La mezcla " + x.ref + " no existe" }); return; }
        Object.keys(cont).forEach(function (m) { out[m] = (out[m] || 0) + q * cont[m]; });
      } else {
        if (!ctx.mat[x.ref]) { errores.push({ donde: trabajo.c, msg: "El material " + x.ref + " no existe" }); return; }
        out[x.ref] = (out[x.ref] || 0) + q;
      }
    });
    return { porMaterial: out, errores: errores };
  }

  /** Cantidad a comprar: redondea hacia arriba a la unidad de compra y su múltiplo. */
  function aComprar(cantidad, factor, paso) {
    if (!(cantidad > 0)) return 0;
    var n = cantidad / factor / paso;
    return Math.ceil(n - 1e-9) * paso;
  }

  /**
   * Calcula una lista completa.
   * opciones.cantidad(linea) → número para líneas vinculadas a un ítem (o null para usar linea.cant)
   * opciones.precio(material) → { precio, fuente } por unidad de compra (o null para usar material.precio)
   */
  function calcularLista(lista, cat, opciones) {
    opciones = opciones || {};
    var ctx = resolver(cat), errores = ctx.errores.slice(), lineas = [], tot = {};
    (lista.lineas || []).forEach(function (ln) {
      var t = trabajoPorCodigo(cat, ln.t);
      var cant = ln.vinc && opciones.cantidad ? opciones.cantidad(ln) : null;
      if (cant == null) cant = +ln.cant || 0;
      var r = { linea: ln, trabajo: t, cant: cant, materiales: [], errores: [] };
      if (!t) { r.errores.push({ donde: "Línea", msg: "El trabajo " + ln.t + " no existe en el catálogo" }); }
      else {
        var u = consumoUnitario(t, ln.params, ctx); r.errores = u.errores;
        Object.keys(u.porMaterial).forEach(function (c) {
          var m = ctx.mat[c], neto = u.porMaterial[c] * cant, perd = t.perdida === "incluida" ? 0 : m.perdidaN;
          r.materiales.push({ c: c, porUnidad: u.porMaterial[c], neto: neto, perdida: perd, conPerdida: neto * (1 + perd) });
          var T = tot[c] = tot[c] || { c: c, neto: 0, conPerdida: 0, porLinea: {} };
          T.neto += neto; T.conPerdida += neto * (1 + perd); T.porLinea[ln.id] = (T.porLinea[ln.id] || 0) + neto * (1 + perd);
        });
      }
      errores = errores.concat(r.errores);
      lineas.push(r);
    });
    var orden = (cat.materiales || []).map(function (m) { return m.c; });
    var totales = Object.keys(tot).sort(function (a, b) { return orden.indexOf(a) - orden.indexOf(b); }).map(function (c) {
      var m = ctx.mat[c], T = tot[c], pr = opciones.precio ? opciones.precio(m) : null;
      var precio = pr && pr.precio != null ? pr.precio : (+m.precio || 0), fuente = pr && pr.fuente ? pr.fuente : (+m.precio ? "Catálogo" : "");
      var q = aComprar(T.conPerdida, m.factorN, m.pasoN);
      return Object.assign(T, { material: m, compra: m.compra || m.u, aComprar: q, precio: precio, fuente: fuente, costo: q * precio });
    });
    var costo = totales.reduce(function (s, x) { return s + x.costo; }, 0);
    return { lineas: lineas, totales: totales, costo: costo, errores: errores, ctx: ctx };
  }

  /**
   * Suma ítems sueltos [{ c, neto, perdida? }] (perdida ausente = la del material) y devuelve
   * los totales a comprar, igual que calcularLista.
   */
  function totalizar(items, ctx, opciones) {
    opciones = opciones || {};
    var tot = {}, orden = Object.keys(ctx.mat);
    items.forEach(function (x) {
      var m = ctx.mat[x.c]; if (!m || !(x.neto > 0)) return;
      var perd = x.perdida != null ? x.perdida : m.perdidaN, T = tot[x.c] = tot[x.c] || { c: x.c, neto: 0, conPerdida: 0 };
      T.neto += x.neto; T.conPerdida += x.neto * (1 + perd);
    });
    var totales = Object.keys(tot).sort(function (a, b) { return orden.indexOf(a) - orden.indexOf(b); }).map(function (c) {
      var m = ctx.mat[c], T = tot[c], pr = opciones.precio ? opciones.precio(m) : null;
      var precio = pr && pr.precio != null ? pr.precio : (+m.precio || 0), fuente = pr && pr.fuente ? pr.fuente : (+m.precio ? "Catálogo" : "");
      var q = aComprar(T.conPerdida, m.factorN, m.pasoN);
      return Object.assign(T, { material: m, compra: m.compra || m.u, aComprar: q, precio: precio, fuente: fuente, costo: q * precio });
    });
    return { totales: totales, costo: totales.reduce(function (s, x) { return s + x.costo; }, 0) };
  }

  /** Códigos de trabajos, mezclas y materiales que usan un material o una mezcla (para no borrar algo en uso). */
  function usos(cat, codigo) {
    var u = [];
    (cat.mezclas || []).forEach(function (z) { if ((z.comp || []).some(function (x) { return x.m === codigo; })) u.push("mezcla " + z.c); });
    (cat.trabajos || []).forEach(function (t) { if ((t.comp || []).some(function (x) { return x.ref === codigo; })) u.push("trabajo " + t.c); });
    return u;
  }

  return { evaluar: evaluar, resolver: resolver, consumoUnitario: consumoUnitario, aComprar: aComprar, calcularLista: calcularLista, totalizar: totalizar, trabajoPorCodigo: trabajoPorCodigo, usos: usos };
});
