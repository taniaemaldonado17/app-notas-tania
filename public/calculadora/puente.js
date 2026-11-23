/*
 * puente.js — Conecta la calculadora de materiales (calculadora.js, sin cambios) con MALTA.
 *
 * - Guardado: en lugar de solo el navegador (localStorage), en la cuenta del usuario
 *   (/api/calculadora), así está igual en la compu y en el iPad. También queda una copia en el
 *   navegador por si no hay conexión; se sube cuando vuelve.
 * - Proyecto abierto (?p=<id>): el cómputo y presupuesto de MALTA en el formato de la app, para
 *   tomar cantidades de sus ítems y precios de sus insumos. Nunca se modifica desde acá.
 * - Tema (?tema=dark|light) y cierre: el botón ✕ avisa a MALTA, que cierra la ventana.
 */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  var presupuestoId = qs.get("p");
  if (qs.get("tema") === "dark" || qs.get("tema") === "light") document.documentElement.setAttribute("data-theme", qs.get("tema"));

  var LOCAL = "malta:calculadora";
  var datos = null;
  var proyecto = null;

  function leerLocal() { try { var s = localStorage.getItem(LOCAL); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function escribirLocal(d) { try { localStorage.setItem(LOCAL, JSON.stringify(d)); } catch (e) {} }

  // Upload: debounced, and retried when the connection comes back.
  var pendiente = null, timer = null;
  function subir() {
    clearTimeout(timer);
    if (!pendiente) return;
    var cuerpo = JSON.stringify({ data: pendiente });
    fetch("/api/calculadora", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: cuerpo })
      .then(function (r) { if (r.ok) { pendiente = null; try { localStorage.removeItem(LOCAL + ":pendiente"); } catch (e) {} } })
      .catch(function () {});
  }
  window.addEventListener("online", subir);
  window.addEventListener("beforeunload", subir);

  window.Almacen = {
    listar: function () { return proyecto ? [{ id: proyecto.id, nombre: proyecto.meta.nombre, creado: proyecto.meta.creado }] : []; },
    cargar: function (id) { return proyecto && proyecto.id === id ? proyecto : null; },
    guardar: function () {}, eliminar: function () {}, disponible: function () { return true; },
    cargarCalc: function () { return datos; },
    guardarCalc: function (d) {
      escribirLocal(d);
      pendiente = d;
      try { localStorage.setItem(LOCAL + ":pendiente", "1"); } catch (e) {}
      clearTimeout(timer); timer = setTimeout(subir, 800);
    },
    esClaveDeProyecto: function () { return false; }
  };
  window.CP = window.CP || {};
  window.CP.proyectoActual = function () { return proyecto; };

  function json(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  var deServidor = json("/api/calculadora").then(function (r) { return r.data; }).catch(function () { return undefined; });
  var delProyecto = presupuestoId
    ? json("/api/presupuestos/" + encodeURIComponent(presupuestoId) + "/exportar?formato=json").then(function (r) { return r.proyecto; }).catch(function () { return null; })
    : Promise.resolve(null);

  Promise.all([deServidor, delProyecto]).then(function (res) {
    var local = leerLocal(), hayPendiente = false;
    try { hayPendiente = localStorage.getItem(LOCAL + ":pendiente") === "1"; } catch (e) {}
    // Changes made here without connection win over the server copy, and get uploaded.
    datos = hayPendiente && local ? local : (res[0] !== undefined ? res[0] : local);
    if (hayPendiente && local) { pendiente = local; subir(); }
    proyecto = res[1];
    document.getElementById("calcRoot").innerHTML = "";
    var s = document.createElement("script");
    s.src = "js/calculadora.js";
    s.onload = function () {
      window.CP.consumo.abrir();
      // The panel's ✕ (or Esc) empties #calcRoot: tell MALTA to close the window.
      new MutationObserver(function () {
        if (!document.getElementById("calcRoot").firstChild) {
          subir();
          if (window.parent !== window) window.parent.postMessage({ tipo: "calculadora:cerrar" }, location.origin);
          else window.CP.consumo.abrir();
        }
      }).observe(document.getElementById("calcRoot"), { childList: true });
    };
    document.body.appendChild(s);
  });
})();
