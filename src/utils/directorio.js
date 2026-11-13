// utils/directorio.js
//
// Directorio público de negocios por ciudad y rubro (agendafonfach.cl/negocios)
// y sitemap para Google. Solo lee datos públicos de las empresas.
import empresaModel from "../models/empresa.model.js";

export const SITIO = "https://www.agendafonfach.cl";

// rubro (o "tipo" antiguo) → cómo se llama en la URL y en los títulos
const R = (slug, plural, singular) => ({ slug, plural, singular });
export const RUBROS = {
  barberia: R("barberias", "Barberías", "Barbería"),
  peluqueria: R("peluquerias", "Peluquerías", "Peluquería"),
  salon_belleza: R("salones-de-belleza", "Salones de belleza", "Salón de belleza"),
  "salon de belleza": R("salones-de-belleza", "Salones de belleza", "Salón de belleza"),
  spa: R("spas", "Spas", "Spa"),
  centro_estetica: R("centros-de-estetica", "Centros de estética", "Centro de estética"),
  estetica: R("centros-de-estetica", "Centros de estética", "Centro de estética"),
  nutricion: R("nutricionistas", "Nutricionistas", "Nutricionista"),
  kinesiologia: R("kinesiologos", "Kinesiólogos", "Kinesiología"),
  psicologia: R("psicologos", "Psicólogos", "Psicología"),
  medicina_general: R("consultas-medicas", "Consultas médicas", "Consulta médica"),
  consultorio: R("consultas-medicas", "Consultas médicas", "Consulta médica"),
  dental: R("clinicas-dentales", "Clínicas dentales", "Clínica dental"),
  gimnasio: R("gimnasios", "Gimnasios", "Gimnasio"),
  masajes: R("masajes", "Masajes", "Masajes"),
  tatuajes: R("tatuajes", "Estudios de tatuajes", "Estudio de tatuajes"),
  restaurante: R("restaurantes", "Bares y restaurantes", "Bar · Restaurante"),
};
const RUBRO_OTROS = R("otros", "Otros negocios", "Negocio");

export const rubroDe = (empresa) =>
  RUBROS[String(empresa.rubro || empresa.tipo || "").toLowerCase().trim()] || RUBRO_OTROS;

/** "Ovalle" / "ovalle " / "Ovállе" → "ovalle"; "La Serena" → "la-serena" */
export const slugCiudad = (ciudad) =>
  String(ciudad || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const CAMPOS = "nombre slug tipo rubro descripcion direccion horarios logo colores ciudad giftcards.activa";

/**
 * Negocios que salen en el directorio: activos, con su plan al día y sin
 * haberse ocultado (directorioVisible: false).
 */
export const negociosDirectorio = async () => {
  const empresas = await empresaModel
    .find({
      estado: "activo",
      estadoSuscripcion: { $nin: ["suspendido", "cancelado"] },
      directorioVisible: { $ne: false },
    })
    .select(CAMPOS)
    .sort({ nombre: 1 })
    .lean();

  return empresas.map((e) => {
    const rubro = rubroDe(e);
    return {
      ...e,
      ciudad: String(e.ciudad || "").trim(),
      ciudadSlug: slugCiudad(e.ciudad),
      rubroSlug: rubro.slug,
      rubroPlural: rubro.plural,
      rubroSingular: rubro.singular,
    };
  });
};

/** Ciudades con sus rubros (para los menús del directorio y el sitemap). */
export const ciudadesDirectorio = (negocios) => {
  const ciudades = new Map();
  for (const n of negocios) {
    if (!n.ciudadSlug) continue;
    if (!ciudades.has(n.ciudadSlug)) {
      ciudades.set(n.ciudadSlug, { slug: n.ciudadSlug, nombres: new Map(), total: 0, rubros: new Map() });
    }
    const c = ciudades.get(n.ciudadSlug);
    c.total += 1;
    c.nombres.set(n.ciudad, (c.nombres.get(n.ciudad) || 0) + 1);
    const r = c.rubros.get(n.rubroSlug) || { slug: n.rubroSlug, nombre: n.rubroPlural, total: 0 };
    r.total += 1;
    c.rubros.set(n.rubroSlug, r);
  }
  return [...ciudades.values()]
    .map((c) => ({
      slug: c.slug,
      // la forma de escribirla que más se repite ("Ovalle", no "ovalle")
      nombre: [...c.nombres.entries()].sort((a, b) => b[1] - a[1])[0][0],
      total: c.total,
      rubros: [...c.rubros.values()].sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
};

const escXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

/** sitemap.xml con la portada, el directorio y la página de cada negocio. */
export const generarSitemap = (negocios) => {
  const urls = [
    { loc: `${SITIO}/`, prioridad: "1.0" },
    { loc: `${SITIO}/negocios`, prioridad: "0.8" },
  ];
  for (const c of ciudadesDirectorio(negocios)) {
    urls.push({ loc: `${SITIO}/negocios/${c.slug}`, prioridad: "0.7" });
    for (const r of c.rubros) urls.push({ loc: `${SITIO}/negocios/${c.slug}/${r.slug}`, prioridad: "0.7" });
  }
  for (const n of negocios) {
    urls.push({ loc: `${SITIO}/${encodeURIComponent(n.slug)}`, prioridad: "0.9" });
    if (n.giftcards?.activa) urls.push({ loc: `${SITIO}/${encodeURIComponent(n.slug)}/regalar`, prioridad: "0.5" });
  }
  const cuerpo = urls
    .map((u) => `  <url><loc>${escXml(u.loc)}</loc><changefreq>weekly</changefreq><priority>${u.prioridad}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${cuerpo}\n</urlset>\n`;
};
