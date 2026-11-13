// routes/seoRoutes.js
//
// Público y de solo lectura: directorio de negocios por ciudad/rubro y
// sitemap.xml para Google. No toca ninguna ruta existente.
import { Router } from "express";
import { limitarLecturaPublica } from "../middlewares/publicRateLimiter.js";
import { ciudadesDirectorio, generarSitemap, negociosDirectorio } from "../utils/directorio.js";

const router = Router();

// Los negocios cambian poco: se guarda la respuesta unos minutos en memoria
// para no ir a la base en cada visita (Google, el directorio, el build).
const CACHE_MS = 10 * 60 * 1000;
let cache = { hasta: 0, negocios: null };
const negocios = async () => {
  if (cache.negocios && Date.now() < cache.hasta) return cache.negocios;
  const lista = await negociosDirectorio();
  cache = { hasta: Date.now() + CACHE_MS, negocios: lista };
  return lista;
};

// GET /seo/directorio → { negocios, ciudades }
router.get("/directorio", limitarLecturaPublica, async (req, res) => {
  try {
    const lista = await negocios();
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      negocios: lista.map(({ giftcards, ...n }) => n),
      ciudades: ciudadesDirectorio(lista),
    });
  } catch (error) {
    console.error("❌ directorio:", error);
    res.status(500).json({ message: "No se pudo cargar el directorio" });
  }
});

// GET /seo/sitemap.xml
router.get("/sitemap.xml", async (req, res) => {
  try {
    const xml = generarSitemap(await negocios());
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (error) {
    console.error("❌ sitemap:", error);
    res.status(500).type("text/plain").send("No se pudo generar el sitemap");
  }
});

export default router;
