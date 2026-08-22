// crear-empresa-gimnasio.js
//
// Script de una sola pasada para pruebas locales:
//   1) crea la empresa (rubro gimnasio) + el usuario admin
//   2) activa el módulo modulos.clasesGrupales
//   3) crea una clase de ejemplo (Crossfit) con horario recurrente
//   4) muestra las sesiones generadas para los próximos días
//
// Requisitos: tener el backend corriendo en local (npm run dev) ANTES de ejecutar esto.
// Uso:        node crear-empresa-gimnasio.js
// (si tu backend no corre en el puerto 4000, exporta BASE_URL antes, ej:
//  BASE_URL=http://localhost:5000 node crear-empresa-gimnasio.js)

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

const DATOS_EMPRESA = {
  nombre: "Focus Train Test",
  rubro: "gimnasio",
  telefono: "9 5851 4982",
  correo: "escobaredu4@gmail.com",
};

const DATOS_CLASE = {
  nombre: "Crossfit",
  descripcion: "Clase grupal de crossfit",
  duracion: 60,
  cupoMaximo: 15,
  horarioSemanal: [
    { diaSemana: 1, horaInicio: "19:00" }, // lunes
    { diaSemana: 3, horaInicio: "19:00" }, // miércoles
    { diaSemana: 5, horaInicio: "19:00" }, // viernes
  ],
};

async function llamar(path, options, etiqueta) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`❌ Error en "${etiqueta}" (HTTP ${res.status}):`, data);
    process.exit(1);
  }
  return data;
}

async function main() {
  console.log(`Usando BASE_URL = ${BASE_URL}\n`);

  console.log("1) Creando empresa + usuario admin...");
  const { slug, token } = await llamar(
    "/empresa/registro-negocio",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DATOS_EMPRESA),
    },
    "crear empresa",
  );
  console.log(`   ✅ Empresa creada. slug: ${slug}\n`);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  console.log("2) Activando el módulo de clases grupales...");
  await llamar(
    "/empresa/actualizar",
    {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        modulos: {
          fichaClinica: false,
          historialControles: false,
          planAlimentario: false,
          examenesLab: false,
          clasesGrupales: true,
        },
      }),
    },
    "activar módulo",
  );
  console.log("   ✅ Módulo clasesGrupales activado.\n");

  console.log("3) Creando clase de ejemplo (Crossfit)...");
  const { clase } = await llamar(
    "/clases",
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(DATOS_CLASE),
    },
    "crear clase",
  );
  console.log(`   ✅ Clase creada. _id: ${clase._id}\n`);

  console.log("4) Consultando sesiones disponibles (próximos 14 días)...");
  const { sesiones } = await llamar(
    `/clases/sesiones?claseId=${clase._id}`,
    { method: "GET", headers: authHeaders },
    "listar sesiones",
  );
  console.log(`   ✅ Se generaron ${sesiones.length} sesiones. Ejemplo:`);
  console.log("  ", sesiones[0] || "(ninguna en el rango por defecto)");

  console.log("\n================= LISTO =================");
  console.log("slug empresa:  ", slug);
  console.log("claseId:       ", clase._id);
  console.log("token (12h):   ", token);
  console.log("===========================================");
  console.log(
    "\nCon el token de arriba ya puedes seguir probando en Postman:\n" +
      "  Authorization: Bearer <token>\n" +
      `  POST ${BASE_URL}/clases/${clase._id}/inscribir\n` +
      '  body: { "fecha": "<copia el campo fecha de una sesión de arriba>", "tipoAcceso": "prueba_gratis" }',
  );
}

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
