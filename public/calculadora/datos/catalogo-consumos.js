/*
 * Catálogo inicial de la calculadora de consumo de materiales.
 * Armado con las planillas "Consumo de materiales 2024" (rendimientos prácticos, con la pérdida
 * incluida) y "Materiales Rubros 6 a 9 Oficinas Snaider" (cálculo por dosificación + pérdida por material).
 * Se carga solo la primera vez; después todo se edita desde la app.
 */
(function () {
  var P24 = "Planilla Consumo de materiales 2024";
  var SN = "Planilla Oficinas Snaider (por dosificación)";
  var LAD = "1/((lad_largo+junta)*(lad_alto+junta))";
  var MORT = "1/(lad_alto+junta)*junta*esp_lad+" + LAD + "*junta*lad_alto*esp_lad";
  var HIERRO = "barras_hilada/(cada_hiladas*(lad_alto+junta))*(1+empalme)*peso_d6";

  window.CATALOGO_CONSUMOS = {
    supuestos: [
      { k: "vol_seco", d: "Volumen seco de componentes por m³ de mezcla", v: 1.3, u: "m³/m³", obs: "Esponjamiento habitual 1,25 a 1,35. " + SN },
      { k: "hid_bolsa", d: "Hidrófugo líquido por bolsa de cemento de 50 kg", v: 1, u: "L/bolsa", obs: "Verificar dosis en la ficha técnica del producto." },
      { k: "hercal_arena", d: "Arena por bolsa de cemento de albañilería (1 bolsa + 12 baldes)", v: 0.24, u: "m³/bolsa", obs: P24 },
      { k: "lad_largo", d: "Ladrillo hueco: largo", v: 0.33, u: "m", obs: "Hueco 12×18×33 y 18×18×33 cm." },
      { k: "lad_alto", d: "Ladrillo hueco: alto de la cara asentada", v: 0.18, u: "m", obs: "" },
      { k: "junta", d: "Espesor de junta", v: 0.015, u: "m", obs: "" },
      { k: "barras_hilada", d: "Hierros Ø6 de refuerzo: barras por hilada", v: 2, u: "u", obs: "" },
      { k: "cada_hiladas", d: "Hierros Ø6: se colocan cada … hiladas", v: 4, u: "hiladas", obs: "" },
      { k: "empalme", d: "Hierros Ø6: aumento por empalmes y anclajes", v: 0.15, u: "fracción", obs: "0,15 = 15 %" },
      { k: "peso_d6", d: "Peso de la barra Ø6 mm", v: "PI/4*0.006^2*7850", u: "kg/m", obs: "Sección × 7.850 kg/m³." },
      { k: "asf_l_m2", d: "Pintura asfáltica: litros por m² y por mano", v: 0.3, u: "L/m²", obs: "Rendimiento típico 3 a 4 m²/L." },
      { k: "asf_manos", d: "Pintura asfáltica sobre la capa aisladora: manos", v: 2, u: "manos", obs: "" },
      { k: "atar_pct", d: "Alambre de atar por kg de acero", v: 0.015, u: "kg/kg", obs: "Supuesto (verificar). La planilla 2024 indica 0,20 kg por metro de barra." },
      { k: "membrana_solape", d: "Membrana: factor por solapes y babetas", v: 1.15, u: "m²/m²", obs: "Solape 10 cm + babetas." }
    ],
    materiales: [
      { c: "CEM", d: "Cemento Portland normal CPN 40", u: "kg", dens: 1400, perdida: 0.2, compra: "bolsa 50 kg", factor: 50, paso: 1, precio: 0, ins: "CEM", obs: "" },
      { c: "CAL", d: "Cal hidratada en polvo", u: "kg", dens: 640, perdida: 0.2, compra: "bolsa 25 kg", factor: 25, paso: 1, precio: 0, ins: "CAL", obs: "" },
      { c: "CAB", d: "Cemento de albañilería (tipo Hercal)", u: "kg", dens: 1250, perdida: 0.2, compra: "bolsa 40 kg", factor: 40, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "ARG", d: "Arena gruesa/mediana", u: "m³", dens: 0, perdida: 0.2, compra: "m³", factor: 1, paso: 0.5, precio: 0, ins: "ARE", obs: "" },
      { c: "PIE", d: "Piedra partida / canto rodado", u: "m³", dens: 0, perdida: 0.2, compra: "m³", factor: 1, paso: 0.5, precio: 0, ins: "PIE", obs: "" },
      { c: "CAS", d: "Cascote de ladrillo", u: "m³", dens: 0, perdida: 0.2, compra: "m³", factor: 1, paso: 0.5, precio: 0, ins: "", obs: "" },
      { c: "PERL", d: "Perlas de poliestireno expandido (EPS) para contrapiso", u: "L", dens: 0, perdida: 0.05, compra: "bolsa 85 L", factor: 85, paso: 1, precio: 0, ins: "", obs: "Bolsa de 85 L (ej. Isocret 85 L)." },
      { c: "HID", d: "Hidrófugo líquido para mortero", u: "L", dens: 0, perdida: 0.2, compra: "bidón 20 L", factor: 20, paso: 1, precio: 0, ins: "", obs: "En la planilla 2024 figura en kg (densidad ≈ 1)." },
      { c: "PAS", d: "Pintura / imprimación asfáltica", u: "L", dens: 0, perdida: 0.05, compra: "lata 18 L", factor: 18, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "MEM", d: "Membrana asfáltica con aluminio 4 mm", u: "m²", dens: 0, perdida: 0.05, compra: "rollo 10 m²", factor: 10, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "LH12", d: "Ladrillo hueco 12×18×33", u: "u", dens: 0, perdida: 0.08, compra: "unidad", factor: 1, paso: 100, precio: 0, ins: "LH12", obs: "Se compra de a 100." },
      { c: "LH18", d: "Ladrillo hueco 18×18×33", u: "u", dens: 0, perdida: 0.08, compra: "unidad", factor: 1, paso: 100, precio: 0, ins: "LH18", obs: "Se compra de a 100." },
      { c: "LC", d: "Ladrillo común", u: "u", dens: 0, perdida: 0.08, compra: "unidad", factor: 1, paso: 100, precio: 0, ins: "LC", obs: "Se compra de a 100." },
      { c: "A6", d: "Hierro ADN 420 Ø6 mm", u: "kg", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: "peso_d6*12", paso: 1, precio: 0, ins: "FE", obs: "" },
      { c: "A8", d: "Hierro ADN 420 Ø8 mm", u: "kg", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: "8^2/162*12", paso: 1, precio: 0, ins: "FE", obs: "Peso d²/162 kg/m." },
      { c: "A10", d: "Hierro ADN 420 Ø10 mm", u: "kg", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: "10^2/162*12", paso: 1, precio: 0, ins: "FE", obs: "Peso d²/162 kg/m." },
      { c: "A12", d: "Hierro ADN 420 Ø12 mm", u: "kg", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: "12^2/162*12", paso: 1, precio: 0, ins: "FE", obs: "Peso d²/162 kg/m." },
      { c: "A16", d: "Hierro ADN 420 Ø16 mm", u: "kg", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: "16^2/162*12", paso: 1, precio: 0, ins: "FE", obs: "Peso d²/162 kg/m." },
      { c: "A20", d: "Hierro ADN 420 Ø20 mm", u: "kg", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: "20^2/162*12", paso: 1, precio: 0, ins: "FE", obs: "Peso d²/162 kg/m." },
      { c: "A25", d: "Hierro ADN 420 Ø25 mm", u: "kg", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: "25^2/162*12", paso: 1, precio: 0, ins: "FE", obs: "Peso d²/162 kg/m." },
      { c: "HORM", d: "Hormigón elaborado H21", u: "m³", dens: 0, perdida: 0.05, compra: "m³", factor: 1, paso: 0.5, precio: 0, ins: "H21", obs: "" },
      { c: "MALLA", d: "Malla electrosoldada (Q188 o similar)", u: "m²", dens: 0, perdida: 0.05, compra: "panel 2,40 × 6,00 m", factor: 14.4, paso: 1, precio: 0, ins: "Q188", obs: "Panel de 14,4 m²." },
      { c: "CHAPA", d: "Chapa sinusoidal galvanizada (ancho útil 1 m)", u: "m", dens: 0, perdida: 0.03, compra: "m lineal", factor: 1, paso: 1, precio: 0, ins: "", obs: "Se compra cortada a medida, por metro lineal." },
      { c: "AISL", d: "Aislación lana de vidrio con foil", u: "m²", dens: 0, perdida: 0.05, compra: "m²", factor: 1, paso: 1, precio: 0, ins: "AISL", obs: "" },
      { c: "ALISO", d: "Alambre liso para alambrado", u: "m", dens: 0, perdida: 0, compra: "rollo 1000 m", factor: 1000, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "APUA", d: "Alambre de púa", u: "m", dens: 0, perdida: 0, compra: "rollo 500 m", factor: 500, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "POSTE", d: "Poste intermedio", u: "u", dens: 0, perdida: 0, compra: "unidad", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "ESQUI", d: "Poste esquinero o estirador", u: "u", dens: 0, perdida: 0, compra: "unidad", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "VARILLA", d: "Varilla para alambrado", u: "u", dens: 0, perdida: 0.05, compra: "unidad", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "TORNIQ", d: "Torniquete", u: "u", dens: 0, perdida: 0, compra: "unidad", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "BARRA", d: "Barra de hierro de 12 m (vigas)", u: "barra", dens: 0, perdida: 0.08, compra: "barra 12 m", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "ALAM", d: "Alambre de atar", u: "kg", dens: 0, perdida: 0.05, compra: "kg", factor: 1, paso: 1, precio: 0, ins: "ALAM", obs: "" },
      { c: "PISO", d: "Piso cerámico / porcelanato", u: "m²", dens: 0, perdida: 0.05, compra: "m²", factor: 1, paso: 1, precio: 7513.01, ins: "", obs: "Precio: " + P24 },
      { c: "REVE", d: "Revestimiento cerámico", u: "m²", dens: 0, perdida: 0.05, compra: "m²", factor: 1, paso: 1, precio: 6500, ins: "", obs: "Precio: " + P24 },
      { c: "GRAN", d: "Mosaico granítico", u: "m²", dens: 0, perdida: 0.05, compra: "m²", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "ADH", d: "Adhesivo para pisos y revestimientos", u: "kg", dens: 0, perdida: 0.1, compra: "bolsa 30 kg", factor: 30, paso: 1, precio: 11500, ins: "", obs: "Precio: " + P24 },
      { c: "PASTC", d: "Pastina de cemento (piso granítico)", u: "kg", dens: 0, perdida: 0.1, compra: "bolsa 50 kg", factor: 50, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "PAST", d: "Pastina", u: "kg", dens: 0, perdida: 0.1, compra: "bolsa 5 kg", factor: 5, paso: 1, precio: 16380, ins: "", obs: "Precio: " + P24 },
      { c: "RTEX", d: "Revoque texturado preparado", u: "kg", dens: 0, perdida: 0.1, compra: "kg", factor: 1, paso: 1, precio: 0, ins: "", obs: "Completar el tamaño de envase en Factor." },
      { c: "RFIN", d: "Revoque fino preparado", u: "kg", dens: 0, perdida: 0.1, compra: "kg", factor: 1, paso: 1, precio: 0, ins: "", obs: "Completar el tamaño de bolsa en Factor." },
      { c: "LATEX", d: "Pintura látex", u: "L", dens: 0, perdida: 0.05, compra: "L", factor: 1, paso: 1, precio: 0, ins: "", obs: "Completar el tamaño de lata en Factor." },
      { c: "SINT", d: "Pintura sintética", u: "L", dens: 0, perdida: 0.05, compra: "L", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "ESM", d: "Esmalte", u: "L", dens: 0, perdida: 0.05, compra: "L", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "FIBR", d: "Pintura fibrada (tipo Sika)", u: "kg", dens: 0, perdida: 0.05, compra: "kg", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "AGUA", d: "Aguarrás", u: "L", dens: 0, perdida: 0.05, compra: "L", factor: 1, paso: 1, precio: 0, ins: "", obs: "" },
      { c: "TORN", d: "Tornillo autoperforante para chapa", u: "u", dens: 0, perdida: 0.05, compra: "caja 100 u", factor: 100, paso: 1, precio: 0, ins: "", obs: "" }
    ],
    mezclas: [
      { c: "M_ASIENTO", d: "Mortero de asiento 1:1:4 (cemento:cal:arena)", modo: "partes", comp: [{ m: "CEM", p: 1 }, { m: "CAL", p: 1 }, { m: "ARG", p: 4 }] },
      { c: "M_REVG", d: "Revoque grueso 1:2:8 (cemento:cal:arena)", modo: "partes", comp: [{ m: "CEM", p: 1 }, { m: "CAL", p: 2 }, { m: "ARG", p: 8 }] },
      { c: "M_IMP", d: "Mortero impermeable / capa aisladora 1:3 (cemento:arena)", modo: "partes", comp: [{ m: "CEM", p: 1 }, { m: "ARG", p: 3 }] },
      { c: "M_CARP", d: "Carpeta 1:3 (cemento:arena)", modo: "partes", comp: [{ m: "CEM", p: 1 }, { m: "ARG", p: 3 }] },
      { c: "M_SUB", d: "Mortero de submuración 1:4 (cemento de albañilería:arena)", modo: "partes", comp: [{ m: "CAB", p: 1 }, { m: "ARG", p: 4 }] },
      { c: "M_CP148", d: "Contrapiso 1:4:8 (cemento:arena:cascote)", modo: "partes", comp: [{ m: "CEM", p: 1 }, { m: "ARG", p: 4 }, { m: "CAS", p: 8 }] },
      { c: "H_EST", d: "Hormigón estructural en general", modo: "m3", comp: [{ m: "CEM", p: 350 }, { m: "ARG", p: 0.5 }, { m: "PIE", p: 0.75 }] },
      { c: "H_FUND", d: "Hormigón para fundaciones", modo: "m3", comp: [{ m: "CEM", p: 235 }, { m: "ARG", p: 0.67 }, { m: "PIE", p: 0.67 }] },
      { c: "H_LIMP", d: "Hormigón de limpieza", modo: "m3", comp: [{ m: "CEM", p: 150 }, { m: "ARG", p: 0.5 }, { m: "PIE", p: 0.75 }] },
      { c: "M_CPCAL", d: "Contrapiso de cascote (cemento, cal, arena, cascote)", modo: "m3", comp: [{ m: "CEM", p: 38 }, { m: "CAL", p: 81 }, { m: "ARG", p: 0.515 }, { m: "CAS", p: 0.77 }] },
      { c: "M_PERL", d: "Contrapiso alivianado con perlas de EPS (1 bolsa 85 L + 25 kg de cemento ≈ 0,10 m³)", modo: "m3", comp: [{ m: "CEM", p: 250 }, { m: "ARG", p: 0.14 }, { m: "PERL", p: 850 }] }
    ],
    trabajos: [
      // Hormigones
      { c: "H_EST_T", d: "Hormigón estructural en general", grupo: "Hormigones", u: "m³", perdida: "incluida", params: [], comp: [{ tipo: "mezcla", ref: "H_EST", f: "1" }], obs: P24 },
      { c: "H_FUND_T", d: "Hormigón para fundaciones", grupo: "Hormigones", u: "m³", perdida: "incluida", params: [], comp: [{ tipo: "mezcla", ref: "H_FUND", f: "1" }], obs: P24 },
      { c: "H_LIMP_T", d: "Hormigón de limpieza", grupo: "Hormigones", u: "m³", perdida: "incluida", params: [], comp: [{ tipo: "mezcla", ref: "H_LIMP", f: "1" }], obs: P24 },
      // Aislaciones
      { c: "AIS_CAPA", d: "Capa aisladora horizontal: mortero 1:3 + hidrófugo + pintura asfáltica", grupo: "Aislaciones", u: "ml", perdida: "material",
        params: [{ k: "espesor", d: "Espesor", v: 0.02, u: "m" }, { k: "ancho", d: "Ancho (espesor del muro)", v: 0.2, u: "m" }],
        comp: [{ tipo: "mezcla", ref: "M_IMP", f: "espesor*ancho" }, { tipo: "material", ref: "HID", f: "espesor*ancho*M_IMP.CEM/50*hid_bolsa" }, { tipo: "material", ref: "PAS", f: "ancho*asf_manos*asf_l_m2" }], obs: SN },
      { c: "AIS_LOSA", d: "Aislación sobre losa: carpeta 1:3 + imprimación + membrana", grupo: "Aislaciones", u: "m²", perdida: "material",
        params: [{ k: "espesor", d: "Espesor de la carpeta", v: 0.02, u: "m" }],
        comp: [{ tipo: "mezcla", ref: "M_CARP", f: "espesor" }, { tipo: "material", ref: "PAS", f: "asf_l_m2" }, { tipo: "material", ref: "MEM", f: "membrana_solape" }], obs: SN },
      { c: "AIS_LOSA_H", d: "Aislación sobre losa con hidrófugo en la carpeta + imprimación + membrana", grupo: "Aislaciones", u: "m²", perdida: "material",
        params: [{ k: "espesor", d: "Espesor de la carpeta", v: 0.02, u: "m" }],
        comp: [{ tipo: "mezcla", ref: "M_CARP", f: "espesor" }, { tipo: "material", ref: "HID", f: "espesor*M_CARP.CEM/50*hid_bolsa" }, { tipo: "material", ref: "PAS", f: "asf_l_m2" }, { tipo: "material", ref: "MEM", f: "membrana_solape" }], obs: SN },
      { c: "AZOT", d: "Azotado hidrófugo", grupo: "Aislaciones", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CEM", f: "8" }, { tipo: "material", ref: "ARG", f: "0.008" }, { tipo: "material", ref: "HID", f: "0.6" }], obs: P24 },
      // Mampostería por dosificación
      { c: "MAM_H12", d: "Mampostería de ladrillo hueco 12 (elevación, mortero 1:1:4, Ø6 c/4 hiladas)", grupo: "Mampostería por dosificación", u: "m²", perdida: "material",
        params: [{ k: "esp_lad", d: "Espesor del ladrillo", v: 0.12, u: "m" }],
        comp: [{ tipo: "material", ref: "LH12", f: LAD }, { tipo: "mezcla", ref: "M_ASIENTO", f: MORT }, { tipo: "material", ref: "A6", f: HIERRO }], obs: SN },
      { c: "MAM_H18", d: "Mampostería de ladrillo hueco 18 (elevación, mortero 1:1:4, Ø6 c/4 hiladas)", grupo: "Mampostería por dosificación", u: "m²", perdida: "material",
        params: [{ k: "esp_lad", d: "Espesor del ladrillo", v: 0.18, u: "m" }],
        comp: [{ tipo: "material", ref: "LH18", f: LAD }, { tipo: "mezcla", ref: "M_ASIENTO", f: MORT }, { tipo: "material", ref: "A6", f: HIERRO }], obs: SN },
      { c: "SUB_H12", d: "Submuración de ladrillo hueco 12 (cemento de albañilería 1:4, Ø6 c/4 hiladas)", grupo: "Mampostería por dosificación", u: "m²", perdida: "material",
        params: [{ k: "esp_lad", d: "Espesor del ladrillo", v: 0.12, u: "m" }],
        comp: [{ tipo: "material", ref: "LH12", f: LAD }, { tipo: "mezcla", ref: "M_SUB", f: MORT }, { tipo: "material", ref: "A6", f: HIERRO }], obs: SN },
      { c: "SUB_H18", d: "Submuración de ladrillo hueco 18 (cemento de albañilería 1:4, Ø6 c/4 hiladas)", grupo: "Mampostería por dosificación", u: "m²", perdida: "material",
        params: [{ k: "esp_lad", d: "Espesor del ladrillo", v: 0.18, u: "m" }],
        comp: [{ tipo: "material", ref: "LH18", f: LAD }, { tipo: "mezcla", ref: "M_SUB", f: MORT }, { tipo: "material", ref: "A6", f: HIERRO }], obs: SN },
      // Mampostería práctica
      { c: "MURO_C8", d: "Muro de ladrillo común de 8 cm", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LC", f: "20" }, { tipo: "material", ref: "CEM", f: "1" }, { tipo: "material", ref: "CAL", f: "2" }, { tipo: "material", ref: "ARG", f: "0.03" }], obs: P24 },
      { c: "MURO_C12", d: "Muro de ladrillo común de 12 cm", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LC", f: "60" }, { tipo: "material", ref: "CEM", f: "3" }, { tipo: "material", ref: "CAL", f: "9" }, { tipo: "material", ref: "ARG", f: "0.04" }], obs: P24 },
      { c: "MURO_C18", d: "Muro de 18 cm con ladrillo común de 12", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LC", f: "82" }, { tipo: "material", ref: "CEM", f: "4.5" }, { tipo: "material", ref: "CAL", f: "14" }, { tipo: "material", ref: "ARG", f: "0.06" }], obs: P24 },
      { c: "MURO_C28", d: "Muro de 28 cm con ladrillo común de 12", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LC", f: "135" }, { tipo: "material", ref: "CEM", f: "6" }, { tipo: "material", ref: "CAL", f: "18" }, { tipo: "material", ref: "ARG", f: "0.08" }], obs: P24 },
      { c: "MURO_CE12", d: "Muro de ladrillo cerámico hueco de 12 cm", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LH12", f: "20" }, { tipo: "material", ref: "CEM", f: "1.5" }, { tipo: "material", ref: "CAL", f: "2.8" }, { tipo: "material", ref: "ARG", f: "0.014" }], obs: P24 },
      { c: "MURO_CE18", d: "Muro de ladrillo cerámico hueco de 18 cm", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LH18", f: "20" }, { tipo: "material", ref: "CEM", f: "2.22" }, { tipo: "material", ref: "CAL", f: "4.24" }, { tipo: "material", ref: "ARG", f: "0.021" }], obs: P24 },
      { c: "MURO_C12_CA", d: "Muro de ladrillo común de 12 cm con cemento de albañilería", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LC", f: "60" }, { tipo: "material", ref: "CAB", f: "12" }, { tipo: "material", ref: "ARG", f: "12/40*hercal_arena" }], obs: P24 + " (columna Hercal)" },
      { c: "MURO_CE12_CA", d: "Muro de ladrillo cerámico hueco de 12 cm con cemento de albañilería", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LH12", f: "20" }, { tipo: "material", ref: "CAB", f: "3.63" }, { tipo: "material", ref: "ARG", f: "3.63/40*hercal_arena" }], obs: P24 + " (columna Hercal)" },
      { c: "MURO_CE18_CA", d: "Muro de ladrillo cerámico hueco de 18 cm con cemento de albañilería", grupo: "Mampostería (rendimiento práctico)", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "LH18", f: "20" }, { tipo: "material", ref: "CAB", f: "4.4" }, { tipo: "material", ref: "ARG", f: "4.4/40*hercal_arena" }], obs: P24 + " (columna Hercal)" },
      // Revoques
      { c: "REV_EST", d: "Revoque estructural sobre panel, esp. 3 cm, MC 1:4", grupo: "Revoques", u: "m²", perdida: "incluida", params: [], comp: [{ tipo: "material", ref: "CEM", f: "15" }], obs: P24 },
      { c: "REV_GRU", d: "Revoque grueso", grupo: "Revoques", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CEM", f: "1.9" }, { tipo: "material", ref: "CAL", f: "3.4" }, { tipo: "material", ref: "ARG", f: "0.018" }], obs: P24 },
      { c: "REV_FIN", d: "Revoque fino", grupo: "Revoques", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CEM", f: "0.3" }, { tipo: "material", ref: "CAL", f: "1.2" }, { tipo: "material", ref: "ARG", f: "0.006" }], obs: P24 },
      { c: "REV_GRU_CA", d: "Revoque grueso con cemento de albañilería", grupo: "Revoques", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CAB", f: "4.7" }, { tipo: "material", ref: "ARG", f: "4.7/40*hercal_arena" }], obs: P24 + " (columna Hercal)" },
      { c: "REV_TEX", d: "Revoque texturado", grupo: "Revoques", u: "m²", perdida: "incluida", params: [], comp: [{ tipo: "material", ref: "RTEX", f: "1.2" }], obs: P24 },
      { c: "REV_FPRE", d: "Revoque fino preparado", grupo: "Revoques", u: "m²", perdida: "incluida", params: [], comp: [{ tipo: "material", ref: "RFIN", f: "6" }], obs: P24 },
      { c: "REV_GRU_D", d: "Revoque grueso 1:2:8 por dosificación", grupo: "Revoques", u: "m²", perdida: "material",
        params: [{ k: "espesor", d: "Espesor medio", v: 0.02, u: "m" }], comp: [{ tipo: "mezcla", ref: "M_REVG", f: "espesor" }], obs: SN },
      { c: "REV_IMP_D", d: "Revoque impermeable 1:3 + hidrófugo por dosificación", grupo: "Revoques", u: "m²", perdida: "material",
        params: [{ k: "espesor", d: "Espesor", v: 0.01, u: "m" }],
        comp: [{ tipo: "mezcla", ref: "M_IMP", f: "espesor" }, { tipo: "material", ref: "HID", f: "espesor*M_IMP.CEM/50*hid_bolsa" }], obs: SN },
      // Contrapisos y carpetas
      { c: "CP_CASC", d: "Contrapiso de cascote (cemento, cal, arena)", grupo: "Contrapisos y carpetas", u: "m²", perdida: "incluida",
        params: [{ k: "espesor", d: "Espesor", v: 0.1, u: "m" }], comp: [{ tipo: "mezcla", ref: "M_CPCAL", f: "espesor" }], obs: P24 },
      { c: "CP_PERL", d: "Contrapiso alivianado con perlita", grupo: "Contrapisos y carpetas", u: "m²", perdida: "incluida",
        params: [{ k: "espesor", d: "Espesor", v: 0.05, u: "m" }], comp: [{ tipo: "mezcla", ref: "M_PERL", f: "espesor" }],
        obs: P24 + ". Los 25 kg de cemento y 0,014 m³ de arena de la planilla son por bolsa de 85 L; con un rendimiento de ≈0,10 m³ por bolsa (dato de fabricante: bolsa de 170 L + 50 kg de cemento ≈ 0,20 m³) dan 250 kg/m³, en línea con los 12 kg/m² a 5 cm de la hoja 1." },
      { c: "CP_148", d: "Contrapiso 1:4:8 por dosificación", grupo: "Contrapisos y carpetas", u: "m²", perdida: "material",
        params: [{ k: "espesor", d: "Espesor", v: 0.1, u: "m" }], comp: [{ tipo: "mezcla", ref: "M_CP148", f: "espesor" }], obs: SN },
      { c: "CARP_13", d: "Carpeta de cemento 1:3, esp. 2 cm", grupo: "Contrapisos y carpetas", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CEM", f: "12" }, { tipo: "material", ref: "ARG", f: "0.025" }], obs: P24 },
      { c: "CARP_14", d: "Carpeta de cemento 1:4, esp. 2 cm", grupo: "Contrapisos y carpetas", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CEM", f: "8" }, { tipo: "material", ref: "ARG", f: "0.03" }], obs: P24 },
      { c: "CARP_NIV", d: "Carpeta de nivelación", grupo: "Contrapisos y carpetas", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CEM", f: "1.6" }, { tipo: "material", ref: "CAL", f: "6.5" }, { tipo: "material", ref: "ARG", f: "0.03" }], obs: P24 },
      { c: "CARP_13_CA", d: "Carpeta 1:3 con cemento de albañilería", grupo: "Contrapisos y carpetas", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "CAB", f: "10" }, { tipo: "material", ref: "ARG", f: "10/40*hercal_arena" }], obs: P24 + " (columna Hercal)" },
      { c: "CARP_D", d: "Carpeta 1:3 por dosificación", grupo: "Contrapisos y carpetas", u: "m²", perdida: "material",
        params: [{ k: "espesor", d: "Espesor", v: 0.03, u: "m" }], comp: [{ tipo: "mezcla", ref: "M_CARP", f: "espesor" }], obs: SN },
      // Pisos y revestimientos
      { c: "PISO_COL", d: "Piso cerámico o porcelanato con adhesivo y pastina", grupo: "Pisos y revestimientos", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "PISO", f: "1" }, { tipo: "material", ref: "ADH", f: "5" }, { tipo: "material", ref: "PAST", f: "0.3" }], obs: P24 },
      { c: "REVE_COL", d: "Revestimiento cerámico con adhesivo y pastina", grupo: "Pisos y revestimientos", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "REVE", f: "1" }, { tipo: "material", ref: "ADH", f: "5" }, { tipo: "material", ref: "PAST", f: "0.3" }], obs: P24 },
      { c: "PISO_GRAN", d: "Piso granítico: concreto de asiento y pastina de cemento", grupo: "Pisos y revestimientos", u: "m²", perdida: "incluida", params: [],
        comp: [{ tipo: "material", ref: "GRAN", f: "1" }, { tipo: "material", ref: "CEM", f: "0.78" }, { tipo: "material", ref: "CAL", f: "3" }, { tipo: "material", ref: "ARG", f: "0.025" }, { tipo: "material", ref: "PASTC", f: "1.5" }], obs: P24 },
      // Pinturas
      { c: "PINT_LAT", d: "Pintura látex", grupo: "Pinturas", u: "m²", perdida: "incluida", params: [{ k: "manos", d: "Manos", v: 1, u: "manos" }, { k: "rend", d: "Rendimiento", v: 10, u: "m²/L por mano" }],
        comp: [{ tipo: "material", ref: "LATEX", f: "manos/rend" }], obs: P24 },
      { c: "PINT_SINT", d: "Pintura sintética (con aguarrás 10 %)", grupo: "Pinturas", u: "m²", perdida: "incluida", params: [{ k: "manos", d: "Manos", v: 1, u: "manos" }, { k: "rend", d: "Rendimiento", v: 10, u: "m²/L por mano" }],
        comp: [{ tipo: "material", ref: "SINT", f: "manos/rend" }, { tipo: "material", ref: "AGUA", f: "0.1*manos/rend" }], obs: P24 },
      { c: "PINT_ESM", d: "Esmalte (con aguarrás 10 %)", grupo: "Pinturas", u: "m²", perdida: "incluida", params: [{ k: "manos", d: "Manos", v: 2, u: "manos" }, { k: "rend", d: "Rendimiento", v: 13, u: "m²/L por mano" }],
        comp: [{ tipo: "material", ref: "ESM", f: "manos/rend" }, { tipo: "material", ref: "AGUA", f: "0.1*manos/rend" }], obs: P24 },
      { c: "PINT_ASF", d: "Pintura asfáltica", grupo: "Pinturas", u: "m²", perdida: "incluida", params: [{ k: "manos", d: "Manos", v: 1, u: "manos" }, { k: "rend", d: "Rendimiento", v: 4, u: "m²/L por mano" }],
        comp: [{ tipo: "material", ref: "PAS", f: "manos/rend" }], obs: P24 },
      { c: "PINT_FIB", d: "Pintura fibrada (tipo Sika)", grupo: "Pinturas", u: "m²", perdida: "incluida", params: [], comp: [{ tipo: "material", ref: "FIBR", f: "1" }], obs: P24 },
      // Techos y hierros
      { c: "TECHO_TORN", d: "Tornillos para techo de chapa", grupo: "Techos", u: "m²", perdida: "incluida", params: [{ k: "por_m2", d: "Tornillos por m²", v: 8, u: "u/m²" }],
        comp: [{ tipo: "material", ref: "TORN", f: "por_m2" }], obs: P24 },
      { c: "VIGA_ARM", d: "Armadura de viga: barras longitudinales + estribos", grupo: "Hierros", u: "ml", perdida: "incluida",
        params: [{ k: "barras", d: "Barras longitudinales", v: 4, u: "u" }, { k: "sep", d: "Separación de estribos", v: 0.2, u: "m" }, { k: "largo_est", d: "Barra por estribo (1,1 viga 20×30; 1,0 viga 15×30)", v: 1.1, u: "m" }],
        comp: [{ tipo: "material", ref: "BARRA", f: "barras/12" }, { tipo: "material", ref: "BARRA", f: "largo_est/sep/12" }], obs: P24 },
      { c: "ALAMBRE", d: "Alambre de atar (por metro de barra)", grupo: "Hierros", u: "m", perdida: "incluida", params: [], comp: [{ tipo: "material", ref: "ALAM", f: "0.2" }], obs: P24 }
    ]
  };

  function L(id, t, nota, cant, params) { return { id: id, t: t, nota: nota, cant: cant, params: params || {}, vinc: null }; }
  window.CALCULOS_INICIALES = [
    { id: "snaider", nombre: "Oficinas Snaider – rubros 6 a 9", lineas: [
      L("s61", "AIS_CAPA", "6.1 Capa aisladora", 179), L("s62", "AIS_LOSA", "6.2 Aislación sobre losa con babetas", 92.4), L("s63", "AIS_LOSA_H", "6.3 Aislación en losas canaletas y losa TR", 46.3),
      L("s71", "SUB_H12", "7.1 Mampostería submuración 0,15", 48), L("s72", "SUB_H18", "7.2 Mampostería submuración 0,20", 96),
      L("s73", "MAM_H12", "7.3 (PB) Mampostería elevación 0,15", 154), L("s74", "MAM_H18", "7.4 (PB) Mampostería elevación 0,20", 170),
      L("s75", "MAM_H12", "7.5 (PA) Mampostería elevación 0,15", 139), L("s76", "MAM_H18", "7.6 (PA) Mampostería elevación 0,20", 101),
      L("s81", "REV_IMP_D", "8.1 (PB) Revoque impermeable", 241), L("s82", "REV_GRU_D", "8.2 (PB) Revoque grueso", 636),
      L("s83", "REV_IMP_D", "8.3 (PA) Revoque impermeable", 109), L("s84", "REV_GRU_D", "8.4 (PA) Revoque grueso", 651),
      L("s91", "CP_148", "9.1 (PB) Contrapiso 10 cm", 267, { espesor: 0.1 }), L("s92", "CP_148", "9.2 (PA) Contrapiso 5 cm", 144, { espesor: 0.05 }),
      L("s93", "CARP_D", "9.3 (PB) Carpeta", 267), L("s94", "CARP_D", "9.4 (PA) Carpeta", 144)
    ] },
    { id: "ejemplos2024", nombre: "Ejemplos de la planilla 2024", lineas: [
      L("e1", "MURO_CE12", "Muros (hoja Muros)", 73), L("e2", "AZOT", "Revoques (hoja Revoques)", 76.15), L("e3", "REV_GRU", "Revoques (hoja Revoques)", 76.15),
      L("e4", "REV_FIN", "Revoques (hoja Revoques)", 76.15), L("e5", "PISO_COL", "Pisos (hoja Pisos y revestimientos)", 28),
      L("e6", "H_EST_T", "Hormigón (hoja Hormigón)", 1.8), L("e7", "H_FUND_T", "Hormigón (hoja Hormigón)", 1.5), L("e8", "CP_CASC", "Contrapiso (hoja Contrapisos)", 4, { espesor: 0.1 })
    ] }
  ];
})();
