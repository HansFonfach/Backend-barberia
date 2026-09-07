// diagnostico-membresias-clase.js
//
// Diagnóstico de por qué un cliente con mensualidad de clases "activa" no
// puede reservar. Compara, para cada mensualidad activa de los correos
// indicados abajo:
//
//   - Lo que se VE en el panel: clases usadas contadas en tiempo real
//     (cuenta InscripcionClase reales, igual que hace estadoMembresiaCliente
//     / listarMembresias).
//   - Lo que el sistema usa por dentro para DECIDIR si puede reservar: el
//     contador atómico (CupoMembresiaClase.reservados) que se incrementa al
//     reservar y se libera al cancelar (ver helpers/cupoMembresiaClaseHelper.js).
//
// Si esos dos números no coinciden (el contador interno queda por encima de
// las clases realmente usadas), el cliente ve "3/16" pero el sistema le
// dice que ya no le quedan cupos: eso bloquea la reserva sin que se note
// nada raro a simple vista. Este script solo LEE datos, no cambia nada,
// salvo que actives CORREGIR más abajo.
//
// Cómo correrlo (desde la carpeta BARBERIA BACK, con el .env ahí mismo):
//   node diagnostico-membresias-clase.js
//
// Si el diagnóstico confirma el desajuste y quieres que el script lo
// corrija (deja el contador igual a las clases realmente usadas, nunca
// inventa datos), cambia CORREGIR a true más abajo y vuelve a correrlo.

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Usuario from "./src/models/usuario.model.js";
import MembresiaClase from "./src/models/membresiaClase.model.js";
import CupoMembresiaClase from "./src/models/cupoMembresiaClase.model.js";
import InscripcionClase from "./src/models/inscripcionClase.model.js";
import Clase from "./src/models/clase.model.js";
import ExcepcionClase from "./src/models/excepcionClase.model.js";
import { obtenerRangoConteo } from "./src/helpers/contarClasesUsadasMembresia.js";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// 👉 Correos a revisar. Agrega o quita los que necesites.
const CORREOS = ["karolacarmona@gmail.com", "angi.top14@gmail.com"];

// 👉 Déjalo en false la primera vez (solo diagnostica). Si el reporte
// confirma el desajuste y quieres que lo arregle, pon true y vuelve a
// correr el script.
const CORREGIR = false;

const fmt = (d) => (d ? new Date(d).toLocaleString("es-CL", { timeZone: "America/Santiago" }) : "—");

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Conectado a la base de datos\n");

  const empresasVistas = new Set();

  for (const correo of CORREOS) {
    console.log("=".repeat(70));
    console.log(`📧 ${correo}`);

    const usuarios = await Usuario.find({
      email: new RegExp(`^${correo}$`, "i"),
    });

    if (!usuarios.length) {
      console.log("   ❌ No encontré ningún usuario con ese correo.");
      continue;
    }

    for (const usuario of usuarios) {
      console.log(
        `   👤 ${usuario.nombre || ""} ${usuario.apellido || ""} (rol: ${usuario.rol}, empresa: ${usuario.empresa})`,
      );
      empresasVistas.add(String(usuario.empresa));

      const membresias = await MembresiaClase.find({
        cliente: usuario._id,
        activa: true,
      });

      if (!membresias.length) {
        console.log("      ⚠️  No tiene ninguna mensualidad de clases ACTIVA.");
        continue;
      }

      for (const membresia of membresias) {
        console.log(`\n      📋 Mensualidad: "${membresia.nombrePlan}"`);
        console.log(`         clasesIncluidas: ${membresia.clasesIncluidas}`);
        console.log(`         tipoCiclo: ${membresia.tipoCiclo}`);
        console.log(`         fechaInicio: ${fmt(membresia.fechaInicio)}`);
        console.log(`         fechaFin:    ${fmt(membresia.fechaFin)}`);
        console.log(
          `         ¿vigente hoy?: ${membresia.fechaInicio <= new Date() && membresia.fechaFin >= new Date() ? "sí" : "NO"}`,
        );

        const { desde, hasta } = obtenerRangoConteo(membresia, new Date());
        const cicloClave = desde.toISOString();

        const usadasReal = await InscripcionClase.countDocuments({
          empresa: membresia.empresa,
          cliente: membresia.cliente,
          tipoAcceso: "membresia",
          estado: { $ne: "cancelada" },
          fecha: { $gte: desde, $lte: hasta },
        });

        const contador = await CupoMembresiaClase.findOne({
          membresia: membresia._id,
          cicloClave,
        });

        console.log(`         Ciclo vigente: ${fmt(desde)} → ${fmt(hasta)}`);
        console.log(`         Clases realmente usadas (InscripcionClase): ${usadasReal}/${membresia.clasesIncluidas}`);
        console.log(
          `         Contador interno de reserva (CupoMembresiaClase): ${
            contador ? `${contador.reservados}/${membresia.clasesIncluidas}` : "no existe todavía (se crea en la primera reserva)"
          }`,
        );

        if (!contador) {
          console.log("         ✅ Sin problema: al reservar, el contador se va a crear recién con el conteo real.");
        } else if (contador.reservados > usadasReal) {
          console.log(
            `         🚨 DESAJUSTE ENCONTRADO: el contador interno (${contador.reservados}) está por ENCIMA de las clases reales (${usadasReal}).`,
          );
          console.log(
            `            Esto bloquea nuevas reservas aunque en el panel se vea que le quedan clases disponibles.`,
          );
          if (contador.reservados >= membresia.clasesIncluidas) {
            console.log("            → Esto explica exactamente el problema: el sistema cree que ya no le quedan cupos.");
          }

          if (CORREGIR) {
            contador.reservados = usadasReal;
            await contador.save();
            console.log(`            🔧 CORREGIDO: contador ajustado a ${usadasReal}.`);
          } else {
            console.log("            (CORREGIR está en false — no se cambió nada. Cambia CORREGIR a true arriba y vuelve a correr para arreglarlo.)");
          }
        } else if (contador.reservados < usadasReal) {
          console.log(
            `         ⚠️  El contador (${contador.reservados}) está por DEBAJO de las clases reales (${usadasReal}) — raro, pero no bloquea reservas (al revés, le da más cupo del que debería). Avísame si ves esto.`,
          );
        } else {
          console.log("         ✅ Coinciden. No hay desajuste en el contador — si no puede reservar, la causa es otra (revisar el horario de la clase específica que intentó).");
        }

        // Últimas inscripciones de esta mensualidad, para contexto rápido
        const ultimas = await InscripcionClase.find({
          empresa: membresia.empresa,
          cliente: membresia.cliente,
          tipoAcceso: "membresia",
        })
          .sort({ fecha: -1 })
          .limit(5)
          .populate("clase", "nombre");

        if (ultimas.length) {
          console.log("         Últimas inscripciones con esta mensualidad:");
          ultimas.forEach((i) => {
            console.log(`           - ${fmt(i.fecha)} · ${i.clase?.nombre || "(clase eliminada)"} · estado: ${i.estado}`);
          });
        }
      }
    }
  }

  // ── Horario real de las clases involucradas, para descartar (o confirmar)
  // que el problema sea "esa fecha/hora no corresponde a una sesión válida"
  // en vez del cupo de la mensualidad. Revisa TODAS las clases activas de
  // cada empresa donde encontramos a alguno de los correos de arriba.
  console.log("\n" + "=".repeat(70));
  console.log("📅 Horario semanal de las clases (para revisar a ojo si algo no cuadra)\n");

  for (const empresaId of empresasVistas) {
    const clases = await Clase.find({ empresa: empresaId });
    if (!clases.length) {
      console.log(`   (empresa ${empresaId}: no tiene clases creadas)`);
      continue;
    }

    for (const clase of clases) {
      console.log(`   🏋️  "${clase.nombre}" — activa: ${clase.activa ? "sí" : "NO"}`);
      if (clase.vigenciaDesde || clase.vigenciaHasta) {
        console.log(
          `        vigencia: ${clase.vigenciaDesde ? fmt(clase.vigenciaDesde) : "sin inicio"} → ${clase.vigenciaHasta ? fmt(clase.vigenciaHasta) : "sin fin"}`,
        );
      }
      if (!clase.horarioSemanal?.length) {
        console.log("        ⚠️  Sin bloques en horarioSemanal — nadie puede reservarla.");
      } else {
        const bloques = [...clase.horarioSemanal].sort(
          (a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio),
        );
        bloques.forEach((b) => {
          console.log(`        - ${DIAS[b.diaSemana]} ${b.horaInicio}`);
        });
      }

      // Excepciones puntuales (canceladas / cupo modificado) de los
      // próximos 14 días, por si hay algo bloqueando fechas futuras.
      const desde14 = new Date();
      const hasta14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const excepciones = await ExcepcionClase.find({
        clase: clase._id,
        fecha: { $gte: desde14, $lte: hasta14 },
      });
      if (excepciones.length) {
        console.log("        Excepciones puntuales próximas:");
        excepciones.forEach((e) => {
          console.log(`          - ${fmt(e.fecha)} · tipo: ${e.tipo}${e.motivo ? ` (${e.motivo})` : ""}`);
        });
      }
      console.log("");
    }
  }

  console.log("=".repeat(70));
  console.log(CORREGIR ? "🎉 Listo, revisado y corregido lo que tenía desajuste." : "🎉 Diagnóstico terminado (no se modificó nada).");

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
