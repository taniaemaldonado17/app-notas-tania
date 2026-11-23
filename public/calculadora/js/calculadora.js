/*
 * calculadora.js — Panel lateral "Calculadora de materiales".
 * Es una herramienta general: tiene su propio catálogo (trabajos, mezclas, materiales, supuestos)
 * y sus propias listas de cálculo, guardadas aparte de los proyectos. Puede tomar cantidades de
 * los ítems del proyecto abierto y precios de sus Insumos, pero nunca modifica el proyecto.
 *
 * Usa: CPConsumo (consumo.js), CPCalculo (calculo.js), Almacen (almacen.js), ExcelJS y window.CP (app.js).
 */
(function () {
  "use strict";
  var K = window.CPConsumo, CC = window.CPCalculo;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nfq = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
  var nfIn = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6, useGrouping: false });
  var money = function (v) { return "$ " + nf0.format(Math.round(v || 0)); };
  var money2 = function (v) { return "$ " + nf2.format(v || 0); };
  var numIn = function (v) { return (v === null || v === undefined || v === "") ? "" : (typeof v === "number" ? nfIn.format(v) : String(v)); };
  function q3(v) { var a = Math.abs(v); return (a >= 100 ? nf2 : nfq).format(v); }
  function parseNum(s) { s = String(s == null ? "" : s).trim().replace(/\s|\$/g, ""); if (s === "") return null; if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", "."); var v = Number(s); return isFinite(v) ? v : null; }
  /** Valor de un campo que puede ser número o fórmula: número si se puede leer como número, si no el texto. */
  function numOFormula(s) { var n = parseNum(s); return n === null ? String(s || "").trim() : n; }
  var norm = function (s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var uid = function () { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  function toast(m) { var r = $("#toastRoot"); r.innerHTML = '<div class="toast" role="status">' + esc(m) + "</div>"; clearTimeout(toast.t); toast.t = setTimeout(function () { r.innerHTML = ""; }, 3600); }

  // ---------------------------------------------------------------- estado y guardado
  var C = { abierta: false, vista: "rapido", r: { q: "", guardar: null }, sel: null, confirm: null, q: "", pick: { q: "", open: false, hl: 0 }, data: null };
  function datosIniciales() {
    return { catalogo: clone(window.CATALOGO_CONSUMOS || { supuestos: [], materiales: [], mezclas: [], trabajos: [] }),
      listas: clone(window.CALCULOS_INICIALES || []), activa: null, preciosProyecto: true };
  }
  function cargar() {
    var d = null; try { d = Almacen.cargarCalc(); } catch (e) {}
    C.data = d || datosIniciales();
    actualizarCatalogo(C.data.catalogo);
    if (!C.data.listas.length) C.data.listas.push({ id: uid(), nombre: "Cálculo nuevo", lineas: [] });
    if (!lista()) C.data.activa = C.data.listas[0].id;
  }
  /** Correcciones del catálogo de fábrica: se aplican solo si el usuario no modificó esos valores. */
  function actualizarCatalogo(c) {
    var z = (c.mezclas || []).filter(function (x) { return x.c === "M_PERL"; })[0];
    var val = function (m) { var x = z && z.comp.filter(function (y) { return y.m === m; })[0]; return x ? +x.p : null; };
    if (z && z.modo === "m3" && val("CEM") === 25 && val("ARG") === 0.014 && val("PERL") === 85) {
      var nuevo = window.CATALOGO_CONSUMOS.mezclas.filter(function (x) { return x.c === "M_PERL"; })[0];
      z.d = nuevo.d; z.comp = clone(nuevo.comp);
      var t = (c.trabajos || []).filter(function (x) { return x.c === "CP_PERL"; })[0], tn = K.trabajoPorCodigo(window.CATALOGO_CONSUMOS, "CP_PERL");
      if (t && tn) t.obs = tn.obs;
    }
    var m = (c.materiales || []).filter(function (x) { return x.c === "PERL"; })[0], mn = window.CATALOGO_CONSUMOS.materiales.filter(function (x) { return x.c === "PERL"; })[0];
    if (m && mn && m.compra === "L" && +m.factor === 1) { m.d = mn.d; m.compra = mn.compra; m.factor = mn.factor; m.perdida = mn.perdida; m.obs = mn.obs; }
    var a6 = (c.materiales || []).filter(function (x) { return x.c === "A6"; })[0]; if (a6 && !a6.ins) a6.ins = "FE";
    // Materiales y supuestos nuevos de versiones posteriores (solo se agregan los que faltan).
    window.CATALOGO_CONSUMOS.materiales.forEach(function (x) { if (!c.materiales.some(function (y) { return y.c === x.c; })) c.materiales.push(clone(x)); });
    window.CATALOGO_CONSUMOS.supuestos.forEach(function (x) { if (!c.supuestos.some(function (y) { return y.k === x.k; })) c.supuestos.push(clone(x)); });
  }
  var tGuardar = null;
  function guardar() { clearTimeout(tGuardar); tGuardar = setTimeout(guardarYa, 350); }
  function guardarYa() { clearTimeout(tGuardar); try { Almacen.guardarCalc(C.data); } catch (e) { toast("No se pudo guardar la calculadora en este navegador."); } }
  window.addEventListener("beforeunload", guardarYa);
  var cat = function () { return C.data.catalogo; };
  function lista() { return C.data.listas.filter(function (l) { return l.id === C.data.activa; })[0]; }
  function trabajo(c) { return K.trabajoPorCodigo(cat(), c); }

  // ---------------------------------------------------------------- vínculo con proyectos
  var cacheProy = {};
  function proyecto(pid) {
    var actual = window.CP && window.CP.proyectoActual ? window.CP.proyectoActual() : null;
    if (actual && actual.id === pid) return actual;
    if (!(pid in cacheProy)) cacheProy[pid] = Almacen.cargar(pid);
    return cacheProy[pid];
  }
  function itemInfo(vinc) {
    var p = vinc && proyecto(vinc.pid); if (!p) return null;
    var st = CC.estructura(p), out = null;
    st.rubros.forEach(function (r) { r.items.forEach(function (x) { if (x.item.id === vinc.iid) out = { codigo: x.codigo, d: x.item.d, u: x.item.u, q: x.calc.q, proyecto: p.meta.nombre }; }); });
    return out;
  }
  function opciones() {
    var actual = window.CP && window.CP.proyectoActual ? window.CP.proyectoActual() : null;
    var IM = actual ? CC.indexarInsumos(actual.ins) : {};
    return {
      cantidad: function (ln) { var i = itemInfo(ln.vinc); return i ? i.q : null; },
      precio: function (m) {
        if (!C.data.preciosProyecto || !actual || !m.ins || !IM[m.ins]) return null;
        var ins = IM[m.ins], pc = CC.precioCalculo(ins, actual.meta), un = function (x) { return norm(x).replace(/³/g, "3").replace(/²/g, "2").replace(/\s/g, ""); };
        // Si el insumo del proyecto está en la misma unidad de cálculo (kg, m³, u…), se pasa a unidad de compra.
        if (un(ins.u) === un(m.u)) pc = pc * (m.factorN || 1);
        return { precio: pc, fuente: "Insumos del proyecto (" + m.ins + ")" };
      }
    };
  }
  function calcular() { cacheProy = {}; return K.calcularLista(lista(), cat(), opciones()); }

  // ---------------------------------------------------------------- renombres en cascada
  function reemplazar(f, fn) { return typeof f === "string" ? f.replace(/[A-Za-z_][A-Za-z0-9_.]*/g, fn) : f; }
  function enFormulas(fn, soloTrabajo) {
    var c = cat();
    c.trabajos.forEach(function (t) {
      if (soloTrabajo && t !== soloTrabajo) return;
      t.comp.forEach(function (x) { x.f = reemplazar(x.f, fn); });
      t.params.forEach(function (p) { p.v = reemplazar(p.v, fn); });
    });
    if (soloTrabajo) return;
    c.supuestos.forEach(function (s) { s.v = reemplazar(s.v, fn); });
    c.materiales.forEach(function (m) { m.factor = reemplazar(m.factor, fn); });
  }
  function codigoValido(v) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(v); }
  function renombrar(tipo, obj, nuevo) {
    nuevo = String(nuevo || "").trim(); var viejo = tipo === "supuesto" ? obj.k : obj.c;
    if (tipo !== "supuesto" && tipo !== "param") nuevo = nuevo.toUpperCase();
    if (tipo === "param") viejo = obj.k;
    if (!nuevo || nuevo === viejo) return false;
    if (!codigoValido(nuevo)) { toast("Usá solo letras, números y guion bajo, empezando con una letra (ej. " + (tipo === "material" ? "CEM2" : "espesor_2") + ")."); return false; }
    var c = cat();
    var existe = { supuesto: c.supuestos, material: c.materiales, mezcla: c.mezclas, trabajo: c.trabajos }[tipo];
    if (existe && existe.some(function (x) { return (x.k || x.c) === nuevo; })) { toast("Ya existe “" + nuevo + "”."); return false; }
    if (tipo === "supuesto") { enFormulas(function (t) { return t === viejo ? nuevo : t; }); obj.k = nuevo; }
    if (tipo === "material") {
      c.mezclas.forEach(function (z) { z.comp.forEach(function (x) { if (x.m === viejo) x.m = nuevo; }); });
      c.trabajos.forEach(function (t) { t.comp.forEach(function (x) { if (x.tipo === "material" && x.ref === viejo) x.ref = nuevo; }); });
      enFormulas(function (t) { var i = t.indexOf("."); return i > 0 && t.slice(i + 1) === viejo ? t.slice(0, i + 1) + nuevo : t; });
      obj.c = nuevo;
    }
    if (tipo === "mezcla") {
      c.trabajos.forEach(function (t) { t.comp.forEach(function (x) { if (x.tipo === "mezcla" && x.ref === viejo) x.ref = nuevo; }); });
      enFormulas(function (t) { var i = t.indexOf("."); return i > 0 && t.slice(0, i) === viejo ? nuevo + t.slice(i) : t; });
      obj.c = nuevo;
    }
    if (tipo === "trabajo") { C.data.listas.forEach(function (l) { l.lineas.forEach(function (ln) { if (ln.t === viejo) ln.t = nuevo; }); }); obj.c = nuevo; if (C.sel === viejo) C.sel = nuevo; }
    if (tipo === "param") {
      var t = obj._t;
      if (t.params.some(function (p) { return p !== obj && p.k === nuevo; })) { toast("Ese trabajo ya tiene un parámetro “" + nuevo + "”."); return false; }
      enFormulas(function (x) { return x === viejo ? nuevo : x; }, t);
      C.data.listas.forEach(function (l) { l.lineas.forEach(function (ln) { if (ln.t === t.c && ln.params && viejo in ln.params) { ln.params[nuevo] = ln.params[viejo]; delete ln.params[viejo]; } }); });
      obj.k = nuevo;
    }
    return true;
  }
  function usosSupuesto(k) {
    var u = [];
    cat().trabajos.forEach(function (t) { if (t.comp.some(function (x) { return new RegExp("(^|[^A-Za-z0-9_.])" + k + "($|[^A-Za-z0-9_.])").test(String(x.f)); })) u.push(t.c); });
    cat().materiales.forEach(function (m) { if (new RegExp("(^|[^A-Za-z0-9_.])" + k + "($|[^A-Za-z0-9_.])").test(String(m.factor))) u.push(m.c); });
    return u;
  }

  // ---------------------------------------------------------------- render
  function render() {
    var root = $("#calcRoot"); if (!root) return;
    var btn = $('[data-cact="toggle"]'); if (btn) btn.setAttribute("aria-pressed", C.abierta ? "true" : "false");
    if (!C.abierta) { root.innerHTML = ""; return; }
    var act = document.activeElement, fid = act && act.id, sel = (act && "selectionStart" in act) ? [act.selectionStart, act.selectionEnd] : null;
    var cb = $(".cb"), scroll = cb ? cb.scrollTop : 0, entra = !root.firstChild;
    var c = cat(), base = ["trabajos", "mezclas", "materiales", "supuestos"].indexOf(C.vista) >= 0;
    var vistas = [["rapido", "Cálculo rápido"], ["calculo", "Listas de cálculo"], ["trabajos", "Base de consumos"]];
    var subs = [["trabajos", "Trabajos (" + c.trabajos.length + ")"], ["mezclas", "Mezclas (" + c.mezclas.length + ")"], ["materiales", "Materiales (" + c.materiales.length + ")"], ["supuestos", "Supuestos (" + c.supuestos.length + ")"]];
    var cuerpo = (base ? '<nav class="csub">' + subs.map(function (v) { return '<button class="btn sm' + (C.vista === v[0] ? " on" : "") + '" data-cact="vista" data-k="' + v[0] + '">' + v[1] + "</button>"; }).join("") + "</nav>" : "") +
      { rapido: vRapido, calculo: vCalculo, trabajos: vTrabajos, mezclas: vMezclas, materiales: vMateriales, supuestos: vSupuestos }[C.vista]();
    root.innerHTML = '<div class="cscrim" data-cact="close"></div><aside class="calc' + (entra ? " entra" : "") + '" role="dialog" aria-modal="true" aria-label="Calculadora de materiales">' +
      '<div class="ch"><div class="cht"><h2>Calculadora de materiales</h2><small>Herramienta general: no cambia el presupuesto de los proyectos</small></div><button class="ib" data-cact="close" aria-label="Cerrar calculadora">✕</button></div>' +
      '<nav class="ctabs" role="tablist">' + vistas.map(function (v) { return '<button role="tab" class="ctab" aria-selected="' + (v[0] === "trabajos" ? base : C.vista === v[0]) + '" data-cact="vista" data-k="' + v[0] + '">' + v[1] + "</button>"; }).join("") + "</nav>" +
      '<div class="cb">' + cuerpo + "</div></aside>";
    if ($(".cb")) $(".cb").scrollTop = scroll;
    if (fid) { var el = document.getElementById(fid); if (el && el !== document.activeElement) { el.focus(); try { if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  }
  function opcionesTrabajos(selected) {
    var grupos = {};
    cat().trabajos.forEach(function (t) { (grupos[t.grupo || "Sin grupo"] = grupos[t.grupo || "Sin grupo"] || []).push(t); });
    var existe = cat().trabajos.some(function (t) { return t.c === selected; });
    return (existe ? "" : '<option value="' + esc(selected) + '" selected>' + esc(selected) + " (no existe)</option>") +
      Object.keys(grupos).map(function (g) { return '<optgroup label="' + esc(g) + '">' + grupos[g].map(function (t) { return '<option value="' + esc(t.c) + '" ' + (t.c === selected ? "selected" : "") + ">" + esc(t.d) + "</option>"; }).join("") + "</optgroup>"; }).join("");
  }
  function metodo(t) { return t && t.perdida === "incluida" ? '<span class="cchip">Rendimiento práctico</span>' : '<span class="cchip dos">Por dosificación + pérdida</span>'; }

  // ---------- Vista Cálculo rápido
  var EL = window.CPElementos;
  function unidadTipo(u) { var x = norm(u).replace(/\s/g, ""); return /m2|m²/.test(x) ? "area" : /m3|m³/.test(x) ? "vol" : (x === "ml" || x === "m") ? "largo" : "cant"; }
  function rEstado() {
    C.data.rapido = C.data.rapido || { sel: "E:VIGA", vals: {}, modo: {} };
    var R = C.data.rapido;
    if (R.sel.indexOf("T:") === 0 && !trabajo(R.sel.slice(2))) R.sel = "E:VIGA";
    if (!R.vals[R.sel]) {
      if (R.sel.indexOf("E:") === 0) R.vals[R.sel] = EL.valoresPorDefecto(EL.porId(R.sel.slice(2)));
      else { var t = trabajo(R.sel.slice(2)), v = {}; t.params.forEach(function (p) { v[p.k] = p.v; }); R.vals[R.sel] = v; }
    }
    return R;
  }
  function medidaDe(R, v, tipo) {
    var modo = R.modo[R.sel] || "total", a = parseNum(v._l), b = parseNum(v._a), c = parseNum(v._h);
    if (modo === "dim") return tipo === "vol" ? (a || 0) * (b || 0) * (c || 0) : tipo === "area" ? (a || 0) * (b || 0) : (a || 0);
    return parseNum(v._total) || 0;
  }
  /** Resultado del cálculo rápido: { cantidad, unidad, nombre, items, notas, trabajo, elemento }. */
  function rCalcular() {
    var R = rEstado(), v = R.vals[R.sel], ctx = K.resolver(cat());
    if (R.sel.indexOf("E:") === 0) {
      var el = EL.porId(R.sel.slice(2)), vv = {};
      Object.keys(v).forEach(function (k) { var c = el.campos.filter(function (x) { return x.k === k; })[0]; vv[k] = c && c.tipo === "sel" ? v[k] : (parseNum(v[k]) || 0); });
      if (el.medida === "m2") vv.sup = medidaDe(R, v, "area");
      var r = el.calcular(vv, ctx);
      return { ctx: ctx, elemento: el, cantidad: r.cantidad, unidad: el.unidad, nombre: r.nombre, items: r.items, notas: r.notas };
    }
    var t = trabajo(R.sel.slice(2)), cant = medidaDe(R, v, unidadTipo(t.u)), params = {};
    t.params.forEach(function (p) { if (v[p.k] !== "" && v[p.k] != null) params[p.k] = numOFormula(v[p.k]); });
    var u = K.consumoUnitario(t, params, ctx), items = Object.keys(u.porMaterial).map(function (m) { return { c: m, neto: u.porMaterial[m] * cant, perdida: t.perdida === "incluida" ? 0 : undefined }; });
    var nombre = t.d + (t.params.length ? " (" + t.params.map(function (p) { return p.k + " " + numIn(params[p.k] != null ? params[p.k] : p.v); }).join(", ") + ")" : "");
    return { ctx: ctx, trabajo: t, params: params, cantidad: cant, unidad: t.u, nombre: nombre, items: items, notas: u.errores.map(function (e) { return "Error: " + e.msg; }) };
  }
  function campo(id, label, u, val, extra) {
    return '<label class="rf"><span>' + esc(label) + '</span><span class="rin"><input class="num" id="' + id + '" inputmode="decimal" ' + extra + ' value="' + esc(numIn(val)) + '"><em>' + esc(u || "") + "</em></span></label>";
  }
  function bloqueMedida(R, v, tipo, unidad) {
    var modo = R.modo[R.sel] || "total", seg = "";
    var nomTotal = { area: "Superficie", vol: "Volumen", largo: "Largo", cant: "Cantidad" }[tipo];
    if (tipo === "area" || tipo === "vol") seg = '<div class="rseg" role="group" aria-label="Cómo cargar la medida"><button data-cact="rmodo" data-m="total" aria-pressed="' + (modo !== "dim") + '">Ya tengo la ' + (tipo === "area" ? "superficie" : "cantidad de m³") + '</button><button data-cact="rmodo" data-m="dim" aria-pressed="' + (modo === "dim") + '">Cargar medidas</button></div>';
    var f = modo === "dim" && (tipo === "area" || tipo === "vol")
      ? campo("rv-_l", "Largo", "m", v._l, 'data-cf="r.v" data-k="_l"') + campo("rv-_a", tipo === "area" ? "Ancho o alto" : "Ancho", "m", v._a, 'data-cf="r.v" data-k="_a"') + (tipo === "vol" ? campo("rv-_h", "Alto o espesor", "m", v._h, 'data-cf="r.v" data-k="_h"') : "")
      : campo("rv-_total", nomTotal, unidad, v._total, 'data-cf="r.v" data-k="_total"');
    return seg + '<div class="rfields">' + f + "</div>";
  }
  function vRapido() {
    var R = rEstado(), v = R.vals[R.sel], q = norm(C.r.q), sel = R.sel;
    var grupos = {}, orden = [];
    function add(g, key, nom, sub) { if (q && norm(nom + " " + g + " " + sub).indexOf(q) < 0) return; if (!grupos[g]) { grupos[g] = []; orden.push(g); } grupos[g].push([key, nom, sub]); }
    EL.ELEMENTOS.forEach(function (e) { add(e.grupo, "E:" + e.id, e.nombre, "por " + e.unidad); });
    cat().trabajos.slice().sort(function (a, b) { return (a.grupo === "Mis consumos guardados" ? -1 : 0) - (b.grupo === "Mis consumos guardados" ? -1 : 0); }).forEach(function (t) { add(t.grupo || "Otros", "T:" + t.c, t.d, "por " + t.u); });
    var lista = orden.map(function (g) { return '<div class="cgr">' + esc(g) + "</div>" + grupos[g].map(function (x) { return '<button class="citem' + (x[0] === sel ? " on" : "") + '" data-cact="rsel" data-k="' + esc(x[0]) + '">' + esc(x[1]) + '<span class="muted">' + esc(x[2]) + "</span></button>"; }).join(""); }).join("") || '<p class="muted">Nada coincide con la búsqueda.</p>';
    var form = "", titulo, sub;
    if (sel.indexOf("E:") === 0) {
      var el = EL.porId(sel.slice(2)); titulo = el.nombre; sub = "Elemento compuesto: se calcula con las medidas y la armadura que cargues.";
      if (el.medida === "m2") form += bloqueMedida(R, v, "area", "m²");
      var abierto = false; form += '<div class="rfields">';
      el.campos.forEach(function (c) {
        if (c.grupo) form += '</div><h4 class="rsub">' + esc(c.grupo) + '</h4><div class="rfields">';
        if (c.tipo === "sel") form += '<label class="rf"><span>' + esc(c.label) + '</span><select id="rv-' + c.k + '" data-cf="r.v" data-k="' + c.k + '">' + c.opciones.map(function (o) { return '<option value="' + esc(o[0]) + '" ' + (String(v[c.k]) === o[0] ? "selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
        else form += campo("rv-" + c.k, c.label, c.u, v[c.k], 'data-cf="r.v" data-k="' + c.k + '"');
      });
      form += "</div>";
    } else {
      var t = trabajo(sel.slice(2)); titulo = t.d; sub = (t.perdida === "incluida" ? "Rendimiento práctico (pérdida incluida)" : "Por dosificación + pérdida por material") + (t.obs ? " · " + t.obs : "");
      form += bloqueMedida(R, v, unidadTipo(t.u), t.u);
      if (t.params.length) form += '<div class="rfields">' + t.params.map(function (p) { return campo("rv-" + p.k, p.d || p.k, p.u, v[p.k], 'data-cf="r.v" data-k="' + esc(p.k) + '"'); }).join("") + "</div>";
    }
    return '<div class="rgrid"><div class="rlist"><input class="search" id="r-q" type="search" placeholder="Buscar: viga, contrapiso, hueco 18…" value="' + esc(C.r.q) + '" data-cf="r.q">' + lista + "</div>" +
      '<div class="rmain"><div class="panel rform"><h3>' + esc(titulo) + '</h3><p class="muted">' + esc(sub) + "</p>" + form + "</div>" +
      '<div id="rres">' + vRapidoRes() + "</div></div></div>";
  }
  function vRapidoRes() {
    var r = rCalcular(), t = K.totalizar(r.items, r.ctx, opciones()), uni = r.unidad;
    if (!(r.cantidad > 0)) return '<div class="panel rres empty">Cargá ' + (uni === "u" ? "la cantidad" : "la medida") + " para ver los materiales.</div>";
    var hayPrecio = t.totales.some(function (x) { return x.precio; });
    var filas = t.totales.map(function (T) {
      return '<tr><td class="rq">' + nfq.format(T.aComprar) + '</td><td class="ru">' + esc(T.compra) + "</td><td>" + esc(T.material.d) + '<div class="muted">' + q3(T.conPerdida) + " " + esc(T.material.u) + (T.conPerdida > T.neto + 1e-9 ? " con pérdida" : "") + "</div></td>" + (hayPrecio ? '<td class="n">' + (T.costo ? money(T.costo) : '<span class="muted">—</span>') + "</td>" : "") + "</tr>";
    }).join("");
    var G = C.r.guardar, listas = C.data.listas;
    var acciones = G ? '<div class="rsave"><label class="rf" style="flex:1 1 320px"><span>Nombre del consumo</span><input id="r-nombre" data-cf="r.nombre" value="' + esc(G.nombre) + '"></label><label class="rf"><span>Grupo</span><input id="r-grupo" data-cf="r.grupo" value="' + esc(G.grupo) + '" list="cgrupos2"></label>' +
        '<datalist id="cgrupos2">' + cat().trabajos.map(function (x) { return x.grupo; }).filter(function (g, i, a) { return g && a.indexOf(g) === i; }).map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + "</datalist>" +
        '<div class="crow" style="border:none;padding:0;align-self:flex-end"><button class="btn" data-cact="rcancel">Cancelar</button><button class="btn cprim" data-cact="rconfirmar">Guardar</button></div></div>'
      : '<div class="ractions"><button class="btn" data-cact="rcopiar">Copiar lista</button><span class="sp"></span><select id="r-lista" data-cf="r.lista" aria-label="Lista de cálculo">' + listas.map(function (l) { return '<option value="' + esc(l.id) + '" ' + (l.id === C.data.activa ? "selected" : "") + ">" + esc(l.nombre) + "</option>"; }).join("") +
        '</select><button class="btn" data-cact="radd">Agregar a la lista</button><button class="btn cprim" data-cact="rguardar">Guardar en la base de consumos</button></div>';
    return '<div class="panel rres"><div class="rhead">Para <b>' + nf2.format(r.cantidad) + " " + esc(uni) + "</b> necesitás:</div>" +
      '<table><tbody>' + (filas || '<tr><td class="muted">Sin materiales.</td></tr>') + (hayPrecio ? '<tr class="tot"><td colspan="3">Costo estimado de materiales</td><td class="n">' + money(t.costo) + "</td></tr>" : "") + "</tbody></table>" +
      (r.notas.length ? '<ul class="rnotas">' + r.notas.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + acciones + "</div>";
  }
  function rTexto() {
    var r = rCalcular(), t = K.totalizar(r.items, r.ctx, opciones());
    return r.nombre + " — " + nf2.format(r.cantidad) + " " + r.unidad + "\n" + t.totales.map(function (T) { return "• " + nfq.format(T.aComprar) + " " + T.compra + " — " + T.material.d; }).join("\n");
  }
  /** Crea (o reutiliza) un trabajo de la base con el cálculo rápido actual. Devuelve { codigo, cantidad, params }. */
  function rGuardarTrabajo(nombre, grupo) {
    var r = rCalcular(), c = cat();
    if (r.trabajo) {
      var t = clone(r.trabajo); t.c = nuevoCodigo(r.trabajo.c + "_", c.trabajos); t.d = nombre; t.grupo = grupo;
      t.params.forEach(function (p) { if (r.params[p.k] != null) p.v = r.params[p.k]; });
      t.obs = "Guardado desde el cálculo rápido (" + new Date().toLocaleDateString("es-AR") + "). Base: " + r.trabajo.d;
      c.trabajos.push(t); return { codigo: t.c, cantidad: r.cantidad, params: {} };
    }
    var per = {}; r.items.forEach(function (x) { var m = r.ctx.mat[x.c], p = x.perdida != null ? x.perdida : m.perdidaN; per[x.c] = (per[x.c] || 0) + x.neto * (1 + p) / r.cantidad; });
    var comp = Object.keys(per).map(function (m) { return { tipo: "material", ref: m, f: String(+per[m].toPrecision(6)) }; });
    var igual = c.trabajos.filter(function (x) { return x.d === nombre && JSON.stringify(x.comp) === JSON.stringify(comp); })[0];
    if (igual) return { codigo: igual.c, cantidad: r.cantidad, params: {} };
    var cod = nuevoCodigo(r.elemento.id + "_", c.trabajos);
    c.trabajos.push({ c: cod, d: nombre, grupo: grupo, u: r.unidad, perdida: "incluida", params: [], comp: comp,
      obs: "Guardado desde el cálculo rápido (" + new Date().toLocaleDateString("es-AR") + "). Consumo por " + r.unidad + " con pérdida incluida. " + r.notas.join(" · ") });
    return { codigo: cod, cantidad: r.cantidad, params: {} };
  }
  function rRefrescar() { var box = $("#rres"); if (box) box.innerHTML = vRapidoRes(); }

  // ---------- Vista Listas de cálculo
  function vCalculo() {
    var L = lista(), r = calcular(), actual = window.CP && window.CP.proyectoActual ? window.CP.proyectoActual() : null;
    var grupos = [];
    if (actual) CC.estructura(actual).rubros.forEach(function (R) { grupos.push({ n: R.numero + ". " + R.n, items: R.items.map(function (x) { return { id: x.item.id, t: x.codigo + " " + x.item.d + " (" + x.item.u + ")" }; }) }); });
    function itemsOpt(selId) { return grupos.map(function (g) { return '<optgroup label="' + esc(g.n) + '">' + g.items.map(function (o) { return '<option value="' + esc(o.id) + '" ' + (o.id === selId ? "selected" : "") + ">" + esc(o.t) + "</option>"; }).join("") + "</optgroup>"; }).join(""); }
    var cf = C.confirm === "lista";
    var filas = r.lineas.map(function (R, k) {
      var ln = R.linea, t = R.trabajo, info = ln.vinc ? itemInfo(ln.vinc) : null;
      var cant = ln.vinc
        ? (info ? '<div class="clink"><b>' + nf2.format(info.q) + "</b> " + esc(info.u) + '<div class="muted">desde ' + esc(info.codigo) + (actual && ln.vinc.pid === actual.id ? "" : " · " + esc(info.proyecto)) + "</div>" + (t && norm(info.u) !== norm(t.u) ? '<div class="cwarn">El ítem está en ' + esc(info.u) + " y el trabajo en " + esc(t.u) + "</div>" : "") + "</div>"
                : '<div class="cwarn">El ítem vinculado ya no existe</div>')
        : '<input class="cell num" id="cl-' + ln.id + '-cant" inputmode="decimal" data-cf="ln.cant" data-id="' + ln.id + '" value="' + numIn(ln.cant) + '" aria-label="Cantidad">';
      var params = t && t.params.length ? t.params.map(function (p) {
        return '<label class="cparam" title="' + esc(p.d) + '">' + esc(p.k) + '<input class="cell num" id="cl-' + ln.id + "-p-" + esc(p.k) + '" inputmode="decimal" data-cf="ln.param" data-id="' + ln.id + '" data-k="' + esc(p.k) + '" value="' + numIn(ln.params && ln.params[p.k] != null ? ln.params[p.k] : "") + '" placeholder="' + esc(numIn(p.v)) + '"><span>' + esc(p.u || "") + "</span></label>";
      }).join("") : '<span class="muted">—</span>';
      var vinc = actual ? '<select class="cell" id="cl-' + ln.id + '-v" data-cf="ln.vinc" data-id="' + ln.id + '" aria-label="Tomar cantidad de un ítem"><option value="">A mano</option>' +
        (ln.vinc && ln.vinc.pid !== actual.id ? '<option value="__otro" selected>' + esc(info ? info.codigo + " · " + info.proyecto : "Ítem de otro proyecto") + "</option>" : "") +
        itemsOpt(ln.vinc && ln.vinc.pid === actual.id ? ln.vinc.iid : null) + "</select>" : '<span class="muted">Abrí un proyecto</span>';
      return '<tr><td class="muted">' + (k + 1) + '</td><td style="min-width:230px"><select class="cell" id="cl-' + ln.id + '-t" data-cf="ln.t" data-id="' + ln.id + '" aria-label="Trabajo">' + opcionesTrabajos(ln.t) + "</select>" + (t ? '<div class="cmeta">' + metodo(t) + " por " + esc(t.u) + "</div>" : "") + "</td>" +
        '<td style="min-width:150px"><input class="cell" id="cl-' + ln.id + '-n" data-cf="ln.nota" data-id="' + ln.id + '" value="' + esc(ln.nota) + '" placeholder="Ítem, sector…" aria-label="Nota"></td>' +
        '<td style="width:120px">' + cant + "</td><td>" + params + '</td><td style="min-width:170px;max-width:230px">' + vinc + "</td>" +
        '<td class="cmats" data-cout="ln-' + ln.id + '">' + resumenLinea(R) + '</td><td><button class="ib x" title="Quitar trabajo" data-cact="delLinea" data-id="' + ln.id + '">✕</button></td></tr>';
    }).join("");
    return '<div class="ctool"><select class="proj" id="cl-sel" data-cf="lista.sel" aria-label="Cálculo">' + C.data.listas.map(function (l) { return '<option value="' + esc(l.id) + '" ' + (l.id === L.id ? "selected" : "") + ">" + esc(l.nombre) + "</option>"; }).join("") + "</select>" +
      '<button class="btn" data-cact="nuevaLista">Nuevo cálculo</button><button class="btn" data-cact="dupLista">Duplicar</button>' +
      (cf ? '<span class="confirm">¿Eliminar “' + esc(L.nombre) + '”? <button class="btn sm danger" data-cact="delLista">Eliminar</button><button class="btn sm" data-cact="cancel">No</button></span>' : '<button class="btn" data-cact="askDelLista">Eliminar</button>') +
      '<span class="sp"></span><button class="btn cprim" data-cact="exportar">Exportar Excel</button></div>' +
      '<div class="cname"><input class="cell rn" id="cl-nombre" data-cf="lista.nombre" value="' + esc(L.nombre) + '" aria-label="Nombre del cálculo"></div>' +
      '<div class="panel scroll"><table class="ctable"><thead><tr><th>#</th><th>Trabajo</th><th>Nota</th><th>Cantidad</th><th>Parámetros</th><th>Cantidad desde ítem</th><th>Materiales (con pérdida)</th><th></th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="8" class="empty">Todavía no hay trabajos. Agregá el primero abajo.</td></tr>') + "</tbody></table>" +
      '<div class="picker"><input id="cpick" type="search" autocomplete="off" placeholder="+ Agregar trabajo: buscá por nombre o grupo (ej. revoque, hueco 18, contrapiso)" value="' + esc(C.pick.q) + '" data-cf="pick" aria-label="Agregar trabajo">' + pickList() + "</div></div>" +
      '<div id="cres">' + vResultados(r) + "</div>";
  }
  function resumenLinea(R) {
    if (R.errores.length) return '<span class="cwarn">' + esc(R.errores[0].msg) + "</span>";
    return R.materiales.map(function (m) { return '<span class="cm"><b>' + esc(m.c) + "</b> " + q3(m.conPerdida) + "</span>"; }).join(" ") || '<span class="muted">—</span>';
  }
  function pickList() {
    if (!C.pick.open) return "";
    var q = norm(C.pick.q), res = cat().trabajos.filter(function (t) { return !q || norm(t.c + " " + t.d + " " + t.grupo).indexOf(q) >= 0; }).slice(0, 10);
    return '<div class="plist" role="listbox">' + (res.map(function (t, k) { return '<button role="option" class="' + (k === C.pick.hl ? "hl" : "") + '" data-cact="addLinea" data-t="' + esc(t.c) + '"><span class="pd">' + esc(t.d) + '<div class="muted">' + esc(t.grupo) + " · por " + esc(t.u) + "</div></span>" + metodo(t) + "</button>"; }).join("") ||
      '<div class="empty" style="padding:14px">Ningún trabajo coincide. Podés crearlo en la pestaña Trabajos.</div>') + "</div>";
  }
  function vResultados(r) {
    var actual = window.CP && window.CP.proyectoActual ? window.CP.proyectoActual() : null;
    var errs = r.errores.length ? '<div class="note err">Hay ' + r.errores.length + " problema(s) en las fórmulas: " + r.errores.slice(0, 4).map(function (e) { return esc(e.donde + ": " + e.msg); }).join(" · ") + "</div>" : "";
    var filas = r.totales.map(function (T) {
      var m = T.material;
      return "<tr><td>" + esc(m.d) + '<div class="code">' + esc(m.c) + '</div></td><td class="n">' + q3(T.neto) + " " + esc(m.u) + '</td><td class="n">' + q3(T.conPerdida) + " " + esc(m.u) + "</td>" +
        '<td class="n"><b>' + nfq.format(T.aComprar) + "</b></td><td>" + esc(T.compra) + '</td><td class="n">' + (T.precio ? money2(T.precio) : '<span class="muted">—</span>') + (T.fuente ? '<div class="muted" style="font-size:11px">' + esc(T.fuente) + "</div>" : "") + '</td><td class="n">' + (T.costo ? money(T.costo) : '<span class="muted">—</span>') + "</td></tr>";
    }).join("");
    return '<div class="cres-h"><h3>Materiales a comprar</h3><label class="ccheck"><input type="checkbox" id="cl-precios" data-cf="precios" ' + (C.data.preciosProyecto ? "checked" : "") + "> Usar precios de Insumos del proyecto abierto" + (actual ? " (" + esc(actual.meta.nombre) + ")" : "") + "</label></div>" + errs +
      '<div class="panel scroll"><table><thead><tr><th>Material</th><th class="n">Cantidad neta</th><th class="n">Con pérdida</th><th class="n">A comprar</th><th>Unidad de compra</th><th class="n">Precio unitario</th><th class="n">Costo</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="7" class="empty">Agregá trabajos con cantidad para ver los materiales.</td></tr>') +
      (r.totales.length ? '<tr class="tot"><td colspan="6">COSTO DE MATERIALES (según precios cargados)</td><td class="n">' + money(r.costo) + "</td></tr>" : "") + "</tbody></table></div>" +
      '<p class="muted" style="font-size:12px;margin-top:8px">“A comprar” redondea hacia arriba el total con pérdida a la unidad de compra (bolsas enteras, medios m³, ladrillos de a 100, barras, etc.). En los trabajos de rendimiento práctico la pérdida ya está incluida en el rendimiento.</p>';
  }
  function refrescarResultados() {
    var r = calcular(), box = $("#cres"); if (box) box.innerHTML = vResultados(r);
    r.lineas.forEach(function (R) { var el = document.querySelector('[data-cout="ln-' + R.linea.id + '"]'); if (el) el.innerHTML = resumenLinea(R); });
  }

  // ---------- Vista Trabajos
  function vTrabajos() {
    var c = cat(), q = norm(C.q), grupos = {};
    c.trabajos.forEach(function (t) { if (q && norm(t.c + " " + t.d + " " + t.grupo).indexOf(q) < 0) return; (grupos[t.grupo || "Sin grupo"] = grupos[t.grupo || "Sin grupo"] || []).push(t); });
    if (!C.sel || !trabajo(C.sel)) C.sel = c.trabajos[0] ? c.trabajos[0].c : null;
    var listaHtml = Object.keys(grupos).map(function (g) { return '<div class="cgr">' + esc(g) + "</div>" + grupos[g].map(function (t) { return '<button class="citem' + (t.c === C.sel ? " on" : "") + '" data-cact="selT" data-c="' + esc(t.c) + '">' + esc(t.d) + '<span class="muted">' + esc(t.c) + " · " + esc(t.u) + "</span></button>"; }).join(""); }).join("");
    return '<div class="csplit"><div class="clist"><div class="ctool"><input class="search" id="c-q" type="search" placeholder="Buscar trabajo" value="' + esc(C.q) + '" data-cf="q"><button class="btn cprim" data-cact="addT">+ Trabajo</button></div>' + (listaHtml || '<p class="muted">Sin resultados.</p>') + "</div>" +
      '<div class="cedit">' + (C.sel ? editorTrabajo(trabajo(C.sel)) : '<div class="empty">Creá el primer trabajo.</div>') + "</div></div>";
  }
  function editorTrabajo(t) {
    var c = cat(), ctx = K.resolver(c), u = K.consumoUnitario(t, {}, ctx), enUso = 0;
    C.data.listas.forEach(function (l) { l.lineas.forEach(function (ln) { if (ln.t === t.c) enUso++; }); });
    var cf = C.confirm === "t:" + t.c;
    var grupos = []; c.trabajos.forEach(function (x) { if (x.grupo && grupos.indexOf(x.grupo) < 0) grupos.push(x.grupo); });
    var params = t.params.map(function (p, i) {
      return '<tr><td><input class="cell code" id="tp-' + i + '-k" data-cf="tp.k" data-i="' + i + '" value="' + esc(p.k) + '" aria-label="Nombre"></td><td><input class="cell" id="tp-' + i + '-d" data-cf="tp.d" data-i="' + i + '" value="' + esc(p.d) + '" aria-label="Descripción"></td>' +
        '<td style="width:110px"><input class="cell num" id="tp-' + i + '-v" data-cf="tp.v" data-i="' + i + '" value="' + esc(numIn(p.v)) + '" aria-label="Valor por defecto"></td><td style="width:110px"><input class="cell" id="tp-' + i + '-u" data-cf="tp.u" data-i="' + i + '" value="' + esc(p.u) + '" aria-label="Unidad"></td>' +
        '<td><button class="ib x" title="Quitar parámetro" data-cact="delTP" data-i="' + i + '">✕</button></td></tr>';
    }).join("");
    var comps = t.comp.map(function (x, i) {
      var opts = (x.tipo === "mezcla" ? c.mezclas.map(function (z) { return [z.c, z.d]; }) : c.materiales.map(function (m) { return [m.c, m.d + " (" + m.u + ")"]; }));
      var prev = "", vars = Object.assign({}, ctx.vars); t.params.forEach(function (p) { try { vars[p.k] = K.evaluar(p.v, ctx.vars); } catch (e) {} });
      try { var v = K.evaluar(x.f, vars); prev = x.tipo === "mezcla" ? q3(v) + " m³ de mezcla" : q3(v) + " " + esc((ctx.mat[x.ref] || {}).u || ""); } catch (e) { prev = '<span class="cwarn">' + esc(e.message) + "</span>"; }
      return '<tr><td style="width:110px"><select class="cell" id="tc-' + i + '-tipo" data-cf="tc.tipo" data-i="' + i + '"><option value="material" ' + (x.tipo === "material" ? "selected" : "") + '>Material</option><option value="mezcla" ' + (x.tipo === "mezcla" ? "selected" : "") + ">Mezcla</option></select></td>" +
        '<td style="min-width:200px"><select class="cell" id="tc-' + i + '-ref" data-cf="tc.ref" data-i="' + i + '">' + (opts.some(function (o) { return o[0] === x.ref; }) ? "" : '<option value="' + esc(x.ref) + '" selected>' + esc(x.ref) + " (no existe)</option>") + opts.map(function (o) { return '<option value="' + esc(o[0]) + '" ' + (o[0] === x.ref ? "selected" : "") + ">" + esc(o[0] + " · " + o[1]) + "</option>"; }).join("") + "</select></td>" +
        '<td class="cformula"><input class="cell code" id="tc-' + i + '-f" data-cf="tc.f" data-i="' + i + '" value="' + esc(x.f) + '" title="' + esc(x.f) + '" aria-label="Fórmula por unidad"></td><td class="n" style="white-space:nowrap">' + prev + "</td>" +
        '<td><button class="ib x" title="Quitar componente" data-cact="delTC" data-i="' + i + '">✕</button></td></tr>';
    }).join("");
    var cons = Object.keys(u.porMaterial).map(function (m) { var M = ctx.mat[m]; return "<tr><td>" + esc(M ? M.d : m) + '</td><td class="n">' + q3(u.porMaterial[m]) + " " + esc(M ? M.u : "") + '</td><td class="n muted">' + (t.perdida === "incluida" ? "incluida" : (M ? Math.round(M.perdidaN * 100) + " %" : "")) + "</td></tr>"; }).join("");
    var mezVars = []; Object.keys(ctx.mez).forEach(function (z) { Object.keys(ctx.mez[z]).forEach(function (m) { mezVars.push(z + "." + m); }); });
    return '<div class="form panel">' +
      '<label>Código<input id="t-c" data-cf="t.c" value="' + esc(t.c) + '"></label><label class="w2">Descripción<input id="t-d" data-cf="t.d" value="' + esc(t.d) + '"></label><label>Unidad<input id="t-u" data-cf="t.u" value="' + esc(t.u) + '" list="cunits"></label>' +
      '<label class="w2">Grupo<input id="t-g" data-cf="t.grupo" value="' + esc(t.grupo) + '" list="cgrupos"></label>' +
      '<label class="w2">Pérdida<select id="t-p" data-cf="t.perdida"><option value="incluida" ' + (t.perdida === "incluida" ? "selected" : "") + '>Incluida en el rendimiento (práctico)</option><option value="material" ' + (t.perdida !== "incluida" ? "selected" : "") + ">Se suma la pérdida de cada material</option></select></label>" +
      '<label class="w4">Fuente u observaciones<input id="t-o" data-cf="t.obs" value="' + esc(t.obs) + '"></label></div>' +
      '<datalist id="cgrupos">' + grupos.map(function (g) { return '<option value="' + esc(g) + '">'; }).join("") + '</datalist><datalist id="cunits">' + ["m²", "m³", "ml", "m", "u", "kg", "gl"].map(function (x) { return '<option value="' + x + '">'; }).join("") + "</datalist>" +
      '<h3 class="csec">Parámetros <span class="muted">(se pueden cambiar en cada línea del cálculo)</span></h3><div class="panel scroll"><table><thead><tr><th>Nombre</th><th>Descripción</th><th>Valor por defecto</th><th>Unidad</th><th></th></tr></thead><tbody>' +
      (params || '<tr><td colspan="5" class="muted">Sin parámetros.</td></tr>') + '</tbody></table><div class="crow"><button class="btn sm" data-cact="addTP">+ Parámetro</button></div></div>' +
      '<h3 class="csec">Componentes por ' + esc(t.u) + '</h3><div class="panel scroll"><table><thead><tr><th>Tipo</th><th>Mezcla o material</th><th>Fórmula por unidad</th><th class="n">Resultado</th><th></th></tr></thead><tbody>' +
      (comps || '<tr><td colspan="5" class="muted">Sin componentes.</td></tr>') + '</tbody></table><div class="crow"><button class="btn sm" data-cact="addTC" data-tipo="material">+ Material</button><button class="btn sm" data-cact="addTC" data-tipo="mezcla">+ Mezcla</button></div></div>' +
      '<details class="chelp"><summary>Qué se puede usar en las fórmulas</summary><p>Números (con punto o coma), + − × ÷ como <code>+ - * /</code>, potencias <code>^</code>, paréntesis y <code>PI</code>. Para una mezcla, la fórmula da los m³ de mezcla por unidad de trabajo; para un material, la cantidad en su unidad.</p>' +
      "<p><b>Parámetros de este trabajo:</b> " + (t.params.map(function (p) { return "<code>" + esc(p.k) + "</code>"; }).join(" ") || "ninguno") + "</p>" +
      "<p><b>Supuestos:</b> " + cat().supuestos.map(function (s) { return "<code>" + esc(s.k) + "</code>"; }).join(" ") + "</p>" +
      "<p><b>Contenido de las mezclas por m³:</b> " + mezVars.map(function (v) { return "<code>" + esc(v) + "</code>"; }).join(" ") + "</p></details>" +
      '<h3 class="csec">Consumo por ' + esc(t.u) + ' con los valores por defecto</h3><div class="panel scroll"><table><thead><tr><th>Material</th><th class="n">Por unidad</th><th class="n">Pérdida</th></tr></thead><tbody>' + (cons || '<tr><td colspan="3" class="muted">—</td></tr>') + "</tbody></table></div>" +
      (u.errores.length ? '<div class="note err" style="margin-top:10px">' + u.errores.map(function (e) { return esc(e.donde + ": " + e.msg); }).join(" · ") + "</div>" : "") +
      '<div class="crow" style="margin-top:14px"><button class="btn" data-cact="dupT">Duplicar trabajo</button>' +
      (cf ? '<span class="confirm">' + (enUso ? "Se usa en " + enUso + " línea(s) de cálculo, que quedarán con error. " : "") + '¿Eliminar? <button class="btn sm danger" data-cact="delT">Eliminar</button><button class="btn sm" data-cact="cancel">No</button></span>' : '<button class="btn danger" data-cact="askDelT">Eliminar trabajo</button>') + "</div>";
  }

  // ---------- Vista Mezclas
  function vMezclas() {
    var c = cat(), ctx = K.resolver(c);
    return '<div class="ctool"><p class="muted" style="margin:0;flex:1;min-width:240px">Por partes: dosificación en volumen; el contenido por m³ sale de las partes × volumen seco (' + nfq.format(ctx.vars.vol_seco || 0) + ") × densidad del material. Por m³: cantidad directa de cada material por m³ de mezcla.</p>" +
      '<button class="btn cprim" data-cact="addZ">+ Mezcla</button></div>' + c.mezclas.map(function (z, i) {
      var cont = ctx.mez[z.c] || {}, usos = K.usos(c, z.c), cf = C.confirm === "z:" + i;
      return '<section class="panel cmez"><div class="form" style="padding:12px 14px 4px"><label>Código<input id="z-' + i + '-c" data-cf="z.c" data-i="' + i + '" value="' + esc(z.c) + '"></label><label class="w2">Descripción<input id="z-' + i + '-d" data-cf="z.d" data-i="' + i + '" value="' + esc(z.d) + '"></label>' +
        '<label>Modo<select id="z-' + i + '-m" data-cf="z.modo" data-i="' + i + '"><option value="partes" ' + (z.modo !== "m3" ? "selected" : "") + '>Partes en volumen</option><option value="m3" ' + (z.modo === "m3" ? "selected" : "") + ">Cantidad por m³</option></select></label></div>" +
        '<div class="scroll"><table><thead><tr><th>Material</th><th class="n">' + (z.modo === "m3" ? "Por m³ de mezcla" : "Partes") + '</th><th class="n">Contenido por m³</th><th></th></tr></thead><tbody>' +
        z.comp.map(function (x, j) {
          return '<tr><td><select class="cell" id="z-' + i + "-" + j + '-m" data-cf="zc.m" data-i="' + i + '" data-j="' + j + '">' + c.materiales.map(function (m) { return '<option value="' + esc(m.c) + '" ' + (m.c === x.m ? "selected" : "") + ">" + esc(m.c + " · " + m.d) + "</option>"; }).join("") + "</select></td>" +
            '<td style="width:130px"><input class="cell num" id="z-' + i + "-" + j + '-p" inputmode="decimal" data-cf="zc.p" data-i="' + i + '" data-j="' + j + '" value="' + numIn(x.p) + '"></td><td class="n">' + (cont[x.m] != null ? q3(cont[x.m]) + " " + esc((ctx.mat[x.m] || {}).u || "") : "") + '</td><td><button class="ib x" data-cact="delZC" data-i="' + i + '" data-j="' + j + '" title="Quitar">✕</button></td></tr>';
        }).join("") + '</tbody></table></div><div class="crow"><button class="btn sm" data-cact="addZC" data-i="' + i + '">+ Material</button><span class="sp"></span>' +
        (usos.length ? '<span class="muted" style="font-size:12px">En uso: ' + esc(usos.join(", ")) + "</span>" : (cf ? '<span class="confirm"><button class="btn sm danger" data-cact="delZ" data-i="' + i + '">Eliminar</button><button class="btn sm" data-cact="cancel">No</button></span>' : '<button class="btn sm danger" data-cact="askDelZ" data-i="' + i + '">Eliminar mezcla</button>')) + "</div></section>";
    }).join("");
  }

  // ---------- Vista Materiales
  function vMateriales() {
    var c = cat(), ctx = K.resolver(c), actual = window.CP && window.CP.proyectoActual ? window.CP.proyectoActual() : null;
    var dl = actual ? '<datalist id="cins">' + actual.ins.map(function (i) { return '<option value="' + esc(i.c) + '">' + esc(i.d) + "</option>"; }).join("") + "</datalist>" : "";
    return '<div class="ctool"><p class="muted" style="margin:0;flex:1;min-width:240px">Pérdida en fracción (0,2 = 20 %). Factor: cuántas unidades de cálculo trae una unidad de compra (puede ser fórmula). Paso: múltiplo de compra. Insumo del proyecto: código para tomar el precio de la pestaña Insumos.</p><button class="btn cprim" data-cact="addM">+ Material</button></div>' + dl +
      '<div class="panel scroll"><table><thead><tr><th>Código</th><th>Descripción</th><th>Un.</th><th class="n">Densidad kg/m³</th><th class="n">Pérdida</th><th>Unidad de compra</th><th class="n">Factor</th><th class="n">Paso</th><th class="n">Precio por u. de compra</th><th>Insumo del proyecto</th><th></th></tr></thead><tbody>' +
      c.materiales.map(function (m, i) {
        var usos = K.usos(c, m.c), cf = C.confirm === "m:" + i, f = (ctx.mat[m.c] || {}).factorN;
        return '<tr><td style="width:90px"><input class="cell code" id="m-' + i + '-c" data-cf="m.c" data-i="' + i + '" value="' + esc(m.c) + '"></td><td style="min-width:220px"><input class="cell" id="m-' + i + '-d" data-cf="m.d" data-i="' + i + '" value="' + esc(m.d) + '" title="' + esc(m.obs) + '"></td>' +
          '<td style="width:60px"><input class="cell" id="m-' + i + '-u" data-cf="m.u" data-i="' + i + '" value="' + esc(m.u) + '"></td><td style="width:90px"><input class="cell num" id="m-' + i + '-dens" data-cf="m.dens" data-i="' + i + '" value="' + numIn(m.dens || "") + '"></td>' +
          '<td style="width:70px"><input class="cell num" id="m-' + i + '-perd" data-cf="m.perdida" data-i="' + i + '" value="' + numIn(m.perdida) + '"></td><td style="width:120px"><input class="cell" id="m-' + i + '-compra" data-cf="m.compra" data-i="' + i + '" value="' + esc(m.compra) + '"></td>' +
          '<td style="width:110px"><input class="cell num" id="m-' + i + '-f" data-cf="m.factor" data-i="' + i + '" value="' + esc(numIn(m.factor)) + '" title="' + (typeof m.factor === "string" && f ? "= " + nfq.format(f) : "") + '"></td><td style="width:60px"><input class="cell num" id="m-' + i + '-paso" data-cf="m.paso" data-i="' + i + '" value="' + numIn(m.paso) + '"></td>' +
          '<td style="width:120px"><input class="cell num" id="m-' + i + '-pr" data-cf="m.precio" data-i="' + i + '" value="' + numIn(m.precio || "") + '"></td><td style="width:90px"><input class="cell code" id="m-' + i + '-ins" data-cf="m.ins" data-i="' + i + '" value="' + esc(m.ins) + '" list="cins"></td>' +
          "<td>" + (usos.length ? '<span class="muted" title="' + esc(usos.join(", ")) + '">en uso</span>' : (cf ? '<span class="confirm"><button class="btn sm danger" data-cact="delM" data-i="' + i + '">Eliminar</button><button class="btn sm" data-cact="cancel">No</button></span>' : '<button class="ib x" data-cact="askDelM" data-i="' + i + '" title="Eliminar material">✕</button>')) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  // ---------- Vista Supuestos
  function vSupuestos() {
    var c = cat(), ctx = K.resolver(c);
    return '<div class="ctool"><p class="muted" style="margin:0;flex:1;min-width:240px">Valores con nombre que se usan en las fórmulas de trabajos y materiales. El valor puede ser un número o una fórmula con otros supuestos.</p><button class="btn cprim" data-cact="addS">+ Supuesto</button></div>' +
      (ctx.errores.length ? '<div class="note err">' + ctx.errores.map(function (e) { return esc(e.donde + ": " + e.msg); }).join(" · ") + "</div>" : "") +
      '<div class="panel scroll"><table><thead><tr><th>Nombre</th><th>Descripción</th><th>Valor o fórmula</th><th class="n">Resultado</th><th>Unidad</th><th>Observación</th><th></th></tr></thead><tbody>' +
      c.supuestos.map(function (s, i) {
        var usos = usosSupuesto(s.k), cf = C.confirm === "s:" + i;
        return '<tr><td style="width:140px"><input class="cell code" id="s-' + i + '-k" data-cf="s.k" data-i="' + i + '" value="' + esc(s.k) + '"></td><td style="min-width:240px"><input class="cell" id="s-' + i + '-d" data-cf="s.d" data-i="' + i + '" value="' + esc(s.d) + '"></td>' +
          '<td style="width:170px"><input class="cell num" id="s-' + i + '-v" data-cf="s.v" data-i="' + i + '" value="' + esc(numIn(s.v)) + '"></td><td class="n">' + (ctx.vars[s.k] != null ? nfq.format(ctx.vars[s.k]) : "") + '</td><td style="width:90px"><input class="cell" id="s-' + i + '-u" data-cf="s.u" data-i="' + i + '" value="' + esc(s.u) + '"></td>' +
          '<td style="min-width:200px"><input class="cell muted" id="s-' + i + '-o" data-cf="s.obs" data-i="' + i + '" value="' + esc(s.obs) + '"></td><td>' +
          (usos.length ? '<span class="muted" title="' + esc(usos.join(", ")) + '">en uso</span>' : (cf ? '<span class="confirm"><button class="btn sm danger" data-cact="delS" data-i="' + i + '">Eliminar</button><button class="btn sm" data-cact="cancel">No</button></span>' : '<button class="ib x" data-cact="askDelS" data-i="' + i + '" title="Eliminar supuesto">✕</button>')) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- edición
  function linea(id) { return lista().lineas.filter(function (l) { return l.id === id; })[0]; }
  function onCampo(el, final) {
    var f = el.dataset.cf, v = el.value, c = cat(), i = +el.dataset.i, j = +el.dataset.j, t = trabajo(C.sel), ln;
    if (f === "r.q") { C.r.q = v; render(); return; }
    if (f === "r.v") { var R = rEstado(); R.vals[R.sel][el.dataset.k] = v; guardar(); if (!final || el.tagName === "SELECT") rRefrescar(); return; }
    if (f === "r.nombre") { C.r.guardar.nombre = v; return; }
    if (f === "r.grupo") { C.r.guardar.grupo = v; return; }
    if (f === "r.lista") { C.data.activa = v; guardar(); return; }
    if (f === "pick") { C.pick.q = v; C.pick.open = true; C.pick.hl = 0; render(); return; }
    if (f === "q") { C.q = v; render(); return; }
    if (f === "precios") { C.data.preciosProyecto = el.checked; guardar(); refrescarResultados(); return; }
    if (f === "lista.sel") { C.data.activa = v; C.confirm = null; guardar(); render(); return; }
    if (f === "lista.nombre") { lista().nombre = v; guardar(); if (final) render(); return; }
    if (f.indexOf("ln.") === 0) {
      ln = linea(el.dataset.id); if (!ln) return;
      if (f === "ln.cant") { ln.cant = parseNum(v) || 0; guardar(); refrescarResultados(); return; }
      if (f === "ln.param") { var n = numOFormula(v); if (n === "") delete ln.params[el.dataset.k]; else ln.params[el.dataset.k] = n; guardar(); refrescarResultados(); return; }
      if (f === "ln.nota") { ln.nota = v; guardar(); return; }
      if (f === "ln.t") { ln.t = v; ln.params = {}; guardar(); render(); return; }
      if (f === "ln.vinc") {
        var actual = window.CP.proyectoActual();
        if (v === "__otro") return;
        ln.vinc = v && actual ? { pid: actual.id, iid: v } : null;
        guardar(); render(); return;
      }
    }
    if (!final && (f === "t.c" || f === "m.c" || f === "z.c" || f === "s.k" || f === "tp.k")) return; // los códigos se aplican al salir del campo
    if (f.indexOf("t.") === 0 && t) {
      var k = f.slice(2);
      if (k === "c") { renombrar("trabajo", t, v); } else t[k] = v;
      guardar(); if (final) render(); return;
    }
    if (f.indexOf("tp.") === 0 && t) {
      var p = t.params[i], kk = f.slice(3);
      if (kk === "k") { p._t = t; renombrar("param", p, v); delete p._t; } else if (kk === "v") p.v = numOFormula(v); else p[kk] = v;
      guardar(); if (final) render(); return;
    }
    if (f.indexOf("tc.") === 0 && t) {
      var x = t.comp[i], k2 = f.slice(3);
      if (k2 === "tipo") { x.tipo = v; x.ref = v === "mezcla" ? (c.mezclas[0] || {}).c : (c.materiales[0] || {}).c; }
      else x[k2] = v;
      guardar(); if (final || k2 !== "f") render(); return;
    }
    if (f.indexOf("z.") === 0) { var z = c.mezclas[i], k3 = f.slice(2); if (k3 === "c") renombrar("mezcla", z, v); else z[k3] = v; guardar(); if (final) render(); return; }
    if (f.indexOf("zc.") === 0) { var zc = c.mezclas[i].comp[j]; if (f === "zc.m") zc.m = v; else zc.p = parseNum(v) || 0; guardar(); if (final) render(); return; }
    if (f.indexOf("m.") === 0) {
      var m = c.materiales[i], k4 = f.slice(2);
      if (k4 === "c") renombrar("material", m, v);
      else if (k4 === "dens" || k4 === "perdida" || k4 === "paso" || k4 === "precio") m[k4] = parseNum(v) || 0;
      else if (k4 === "factor") m.factor = numOFormula(v);
      else if (k4 === "ins") m.ins = String(v).trim().toUpperCase();
      else m[k4] = v;
      guardar(); if (final) render(); return;
    }
    if (f.indexOf("s.") === 0) {
      var s = c.supuestos[i], k5 = f.slice(2);
      if (k5 === "k") renombrar("supuesto", s, v); else if (k5 === "v") s.v = numOFormula(v); else s[k5] = v;
      guardar(); if (final) render(); return;
    }
  }
  function nuevoCodigo(base, lista, campo) { var n = 1; while (lista.some(function (x) { return x[campo || "c"] === base + n; })) n++; return base + n; }
  var acciones = {
    toggle: function () { C.abierta = !C.abierta; C.confirm = null; render(); },
    close: function () { C.abierta = false; C.confirm = null; guardarYa(); render(); },
    vista: function (b) { C.vista = b.dataset.k; C.confirm = null; C.q = ""; render(); var cb = $(".cb"); if (cb) cb.scrollTop = 0; },
    cancel: function () { C.confirm = null; render(); },
    nuevaLista: function () { var l = { id: uid(), nombre: "Cálculo nuevo", lineas: [] }; C.data.listas.push(l); C.data.activa = l.id; guardar(); render(); var el = $("#cl-nombre"); if (el) { el.focus(); el.select(); } },
    dupLista: function () { var l = clone(lista()); l.id = uid(); l.nombre += " (copia)"; l.lineas.forEach(function (x) { x.id = uid(); }); C.data.listas.push(l); C.data.activa = l.id; guardar(); render(); },
    askDelLista: function () { C.confirm = "lista"; render(); },
    delLista: function () { C.data.listas = C.data.listas.filter(function (l) { return l.id !== C.data.activa; }); if (!C.data.listas.length) C.data.listas.push({ id: uid(), nombre: "Cálculo nuevo", lineas: [] }); C.data.activa = C.data.listas[0].id; C.confirm = null; guardar(); render(); },
    addLinea: function (b) { var id = uid(); lista().lineas.push({ id: id, t: b.dataset.t, nota: "", cant: 0, params: {}, vinc: null }); C.pick = { q: "", open: false, hl: 0 }; guardar(); render(); var el = document.getElementById("cl-" + id + "-cant"); if (el) el.focus(); },
    delLinea: function (b) { var L = lista(); L.lineas = L.lineas.filter(function (x) { return x.id !== b.dataset.id; }); guardar(); render(); },
    exportar: exportar,
    rsel: function (b) { rEstado().sel = b.dataset.k; C.r.guardar = null; guardar(); render(); var f = document.querySelector(".rform"); if (f && window.innerWidth <= 820) f.scrollIntoView({ block: "start" }); var el = document.querySelector(".rform input"); if (el) el.focus({ preventScroll: window.innerWidth <= 820 }); },
    rmodo: function (b) { var R = rEstado(); R.modo[R.sel] = b.dataset.m; guardar(); render(); var el = document.querySelector(".rform .rfields input"); if (el) el.focus(); },
    rguardar: function () { var r = rCalcular(); C.r.guardar = { nombre: r.nombre, grupo: "Mis consumos guardados" }; rRefrescar(); var el = $("#r-nombre"); if (el) { el.focus(); el.select(); } },
    rcancel: function () { C.r.guardar = null; rRefrescar(); },
    rconfirmar: function () { var G = C.r.guardar; if (!String(G.nombre).trim()) return toast("Poné un nombre para el consumo."); var res = rGuardarTrabajo(G.nombre.trim(), G.grupo.trim() || "Mis consumos guardados"); C.r.guardar = null; rEstado().sel = "T:" + res.codigo; guardar(); render(); toast("Guardado en la base de consumos. Ya aparece en la lista, en “" + (G.grupo || "Mis consumos guardados") + "”."); },
    radd: function () {
      var r = rCalcular(); if (!(r.cantidad > 0)) return toast("Cargá primero la medida.");
      var L = lista(), res = r.trabajo ? { codigo: r.trabajo.c, cantidad: r.cantidad, params: clone(r.params) } : rGuardarTrabajo(r.nombre, "Mis consumos guardados");
      L.lineas.push({ id: uid(), t: res.codigo, nota: "", cant: res.cantidad, params: res.params, vinc: null }); guardar();
      toast("Agregado a “" + L.nombre + "”" + (r.trabajo ? "." : ". También quedó guardado en la base de consumos.")); render();
    },
    rcopiar: function () { var tx = rTexto(); try { navigator.clipboard.writeText(tx).then(function () { toast("Lista copiada."); }, function () { toast("No se pudo copiar automáticamente."); }); } catch (e) { toast("No se pudo copiar automáticamente."); } },
    selT: function (b) { C.sel = b.dataset.c; C.confirm = null; render(); },
    addT: function () { var c = nuevoCodigo("TRABAJO_", cat().trabajos); cat().trabajos.push({ c: c, d: "Trabajo nuevo", grupo: "Mis trabajos", u: "m²", perdida: "material", params: [], comp: [], obs: "" }); C.sel = c; C.q = ""; guardar(); render(); var el = $("#t-d"); if (el) { el.focus(); el.select(); } },
    dupT: function () { var t = clone(trabajo(C.sel)); t.c = nuevoCodigo(t.c + "_", cat().trabajos); t.d += " (copia)"; cat().trabajos.push(t); C.sel = t.c; guardar(); render(); },
    askDelT: function () { C.confirm = "t:" + C.sel; render(); },
    delT: function () { cat().trabajos = cat().trabajos.filter(function (t) { return t.c !== C.sel; }); C.sel = null; C.confirm = null; guardar(); render(); },
    addTP: function () { var t = trabajo(C.sel); t.params.push({ k: nuevoCodigo("p", t.params, "k"), d: "", v: 0, u: "" }); guardar(); render(); },
    delTP: function (b) { trabajo(C.sel).params.splice(+b.dataset.i, 1); guardar(); render(); },
    addTC: function (b) { var t = trabajo(C.sel), tipo = b.dataset.tipo; t.comp.push({ tipo: tipo, ref: tipo === "mezcla" ? (cat().mezclas[0] || {}).c : (cat().materiales[0] || {}).c, f: "1" }); guardar(); render(); },
    delTC: function (b) { trabajo(C.sel).comp.splice(+b.dataset.i, 1); guardar(); render(); },
    addZ: function () { cat().mezclas.push({ c: nuevoCodigo("M_NUEVA", cat().mezclas), d: "Mezcla nueva", modo: "partes", comp: [{ m: "CEM", p: 1 }, { m: "ARG", p: 3 }] }); guardar(); render(); },
    addZC: function (b) { cat().mezclas[+b.dataset.i].comp.push({ m: (cat().materiales[0] || {}).c, p: 1 }); guardar(); render(); },
    delZC: function (b) { cat().mezclas[+b.dataset.i].comp.splice(+b.dataset.j, 1); guardar(); render(); },
    askDelZ: function (b) { C.confirm = "z:" + b.dataset.i; render(); }, delZ: function (b) { cat().mezclas.splice(+b.dataset.i, 1); C.confirm = null; guardar(); render(); },
    addM: function () { cat().materiales.push({ c: nuevoCodigo("MAT", cat().materiales), d: "Material nuevo", u: "u", dens: 0, perdida: 0.05, compra: "unidad", factor: 1, paso: 1, precio: 0, ins: "", obs: "" }); guardar(); render(); var cb = $(".cb"); if (cb) cb.scrollTop = cb.scrollHeight; },
    askDelM: function (b) { C.confirm = "m:" + b.dataset.i; render(); }, delM: function (b) { cat().materiales.splice(+b.dataset.i, 1); C.confirm = null; guardar(); render(); },
    addS: function () { cat().supuestos.push({ k: nuevoCodigo("supuesto_", cat().supuestos, "k"), d: "", v: 0, u: "", obs: "" }); guardar(); render(); var cb = $(".cb"); if (cb) cb.scrollTop = cb.scrollHeight; },
    askDelS: function (b) { C.confirm = "s:" + b.dataset.i; render(); }, delS: function (b) { cat().supuestos.splice(+b.dataset.i, 1); C.confirm = null; guardar(); render(); }
  };

  document.addEventListener("click", function (e) {
    if (C.pick.open && !e.target.closest("#calcRoot .picker")) { C.pick.open = false; if (C.abierta) render(); }
    var b = e.target.closest("[data-cact]"); if (!b || b.matches("input,select,textarea")) return;
    if (acciones[b.dataset.cact]) acciones[b.dataset.cact](b);
  });
  document.addEventListener("input", function (e) { var el = e.target; if (el.dataset && el.dataset.cf && el.type !== "checkbox" && el.tagName !== "SELECT") onCampo(el, false); });
  document.addEventListener("change", function (e) { var el = e.target; if (el.dataset && el.dataset.cf && el.dataset.cf !== "pick" && el.dataset.cf !== "q") onCampo(el, true); });
  document.addEventListener("focusin", function (e) { if (e.target.id === "cpick" && !C.pick.open) { C.pick.open = true; render(); } });
  window.addEventListener("keydown", function (e) {
    if (!C.abierta) return;
    if (e.target.id === "cpick") {
      var q = norm(C.pick.q), res = cat().trabajos.filter(function (t) { return !q || norm(t.c + " " + t.d + " " + t.grupo).indexOf(q) >= 0; }).slice(0, 10);
      if (e.key === "ArrowDown") { C.pick.hl = Math.min(C.pick.hl + 1, Math.max(res.length - 1, 0)); C.pick.open = true; render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { C.pick.hl = Math.max(C.pick.hl - 1, 0); render(); e.preventDefault(); }
      else if (e.key === "Enter") { e.preventDefault(); if (res[C.pick.hl]) acciones.addLinea({ dataset: { t: res[C.pick.hl].c } }); }
      else if (e.key === "Escape") { C.pick.open = false; render(); e.stopPropagation(); }
      return;
    }
    if (e.key === "Escape") { e.stopPropagation(); acciones.close(); }
  }, true);
  // Si cambia el proyecto (cantidades vinculadas o precios), se recalcula.
  window.addEventListener("cp:cambio", function () { if (C.abierta && C.vista === "calculo") refrescarResultados(); });
  window.addEventListener("cp:abierto", function () { if (C.abierta) render(); });

  // ---------------------------------------------------------------- Excel
  async function exportar() {
    if (!window.ExcelJS) return toast("No se encontró el lector de Excel (js/vendor/exceljs.min.js).");
    var L = lista(), r = calcular(), wb = new window.ExcelJS.Workbook();
    var F = { name: "Arial", size: 10 }, FB = { name: "Arial", size: 10, bold: true };
    var HDR = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5F5A" } }, AMA = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
    function hdr(ws, row, vals) { vals.forEach(function (v, k) { var c = ws.getCell(row, k + 1); c.value = v; c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } }; c.fill = HDR; c.alignment = { wrapText: true, vertical: "middle" }; }); }
    function put(ws, row, col, v, fmt, font) { var c = ws.getCell(row, col); c.value = v; c.font = font || F; if (fmt) c.numFmt = fmt; return c; }
    // Resumen de compra
    var w1 = wb.addWorksheet("Materiales a comprar");
    put(w1, 1, 1, "MATERIALES A COMPRAR – " + L.nombre, null, { name: "Arial", size: 13, bold: true });
    put(w1, 2, 1, "Calculadora de materiales. Cantidad con pérdida redondeada hacia arriba a la unidad de compra.", null, { name: "Arial", size: 10, italic: true });
    hdr(w1, 4, ["Código", "Material", "Un. cálculo", "Cantidad neta", "Cantidad con pérdida", "Unidad de compra", "A comprar", "Precio por u. de compra", "Costo", "Fuente del precio"]);
    var row = 5;
    r.totales.forEach(function (T) {
      put(w1, row, 1, T.c, null, FB); put(w1, row, 2, T.material.d); put(w1, row, 3, T.material.u); put(w1, row, 4, T.neto, "#,##0.000"); put(w1, row, 5, T.conPerdida, "#,##0.000");
      put(w1, row, 6, T.compra); put(w1, row, 7, T.aComprar, "#,##0.0", FB); put(w1, row, 8, T.precio || 0, "#,##0.00");
      put(w1, row, 9, { formula: "G" + row + "*H" + row, result: T.costo }, "#,##0.00"); put(w1, row, 10, T.fuente || ""); row++;
    });
    put(w1, row + 1, 8, "TOTAL", null, FB); var ct = put(w1, row + 1, 9, { formula: "SUM(I5:I" + Math.max(row - 1, 5) + ")", result: r.costo }, "#,##0.00", FB); ct.fill = AMA;
    [10, 40, 10, 14, 16, 16, 12, 18, 16, 30].forEach(function (w, k) { w1.getColumn(k + 1).width = w; });
    // Detalle
    var w2 = wb.addWorksheet("Detalle por trabajo");
    hdr(w2, 1, ["#", "Trabajo", "Nota", "Cantidad", "Un.", "Método", "Material", "Consumo por unidad", "Cantidad neta", "Pérdida", "Con pérdida", "Un. material"]);
    row = 2;
    r.lineas.forEach(function (R, k) {
      var t = R.trabajo;
      (R.materiales.length ? R.materiales : [null]).forEach(function (m) {
        put(w2, row, 1, k + 1); put(w2, row, 2, t ? t.d : R.linea.t); put(w2, row, 3, R.linea.nota || ""); put(w2, row, 4, R.cant, "#,##0.00"); put(w2, row, 5, t ? t.u : "");
        put(w2, row, 6, t ? (t.perdida === "incluida" ? "Rendimiento práctico" : "Por dosificación") : "");
        if (m) { var M = r.ctx.mat[m.c]; put(w2, row, 7, M ? M.d : m.c); put(w2, row, 8, m.porUnidad, "#,##0.0000"); put(w2, row, 9, m.neto, "#,##0.000"); put(w2, row, 10, m.perdida, "0%"); put(w2, row, 11, m.conPerdida, "#,##0.000"); put(w2, row, 12, M ? M.u : ""); }
        row++;
      });
    });
    [5, 46, 30, 11, 6, 20, 36, 14, 14, 9, 14, 9].forEach(function (w, k) { w2.getColumn(k + 1).width = w; });
    // Supuestos y mezclas
    var w3 = wb.addWorksheet("Supuestos y mezclas");
    hdr(w3, 1, ["Supuesto", "Descripción", "Valor", "Unidad", "Observación"]); row = 2;
    cat().supuestos.forEach(function (s) { put(w3, row, 1, s.k); put(w3, row, 2, s.d); put(w3, row, 3, r.ctx.vars[s.k], "#,##0.0000"); put(w3, row, 4, s.u); put(w3, row, 5, s.obs); row++; });
    row++; hdr(w3, row, ["Mezcla", "Descripción", "Material", "Contenido por m³", "Unidad"]); row++;
    cat().mezclas.forEach(function (z) { Object.keys(r.ctx.mez[z.c] || {}).forEach(function (m) { put(w3, row, 1, z.c); put(w3, row, 2, z.d); put(w3, row, 3, m); put(w3, row, 4, r.ctx.mez[z.c][m], "#,##0.000"); put(w3, row, 5, (r.ctx.mat[m] || {}).u || ""); row++; }); });
    [16, 60, 14, 16, 40].forEach(function (w, k) { w3.getColumn(k + 1).width = w; });
    var buf = await wb.xlsx.writeBuffer();
    var nombre = ("Materiales - " + L.nombre).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ._()-]+/g, "-").replace(/-{2,}/g, "-").trim();
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); a.download = nombre + ".xlsx";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast("Listado de materiales exportado.");
  }

  // ---------------------------------------------------------------- API e inicio
  cargar();
  window.CP = window.CP || {};
  window.CP.consumo = {
    /** Catálogo y listas de la calculadora (copia). */
    datos: function () { return clone(C.data); },
    /** Calcula una lista por id (o la activa) y devuelve totales por material. */
    calcular: function (id) { var prev = C.data.activa; if (id) C.data.activa = id; var r = calcular(); C.data.activa = prev;
      return { totales: r.totales.map(function (T) { return { codigo: T.c, material: T.material.d, unidad: T.material.u, neto: T.neto, conPerdida: T.conPerdida, compra: T.compra, aComprar: T.aComprar, precio: T.precio, costo: T.costo }; }), costo: r.costo, errores: r.errores }; },
    abrir: function () { C.abierta = true; render(); }
  };
  render();
})();
