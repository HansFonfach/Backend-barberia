export const validarDisponibilidad = async ({
  barberoDoc,
  barbero,
  servicio,
  fecha,
  hora,
  duracionServicio,
  excluirReservaId = null,
}) => {
  const horaFormateada = formatHora(hora);
  const inicioReservaChile = dayjs.tz(
    `${fecha} ${horaFormateada}`,
    "YYYY-MM-DD HH:mm",
    "America/Santiago",
  );
  const finReservaChile = inicioReservaChile.add(duracionServicio, "minute");
  const diaSemana = inicioReservaChile.day();

  // 👇 movido arriba para reusar en horarios extra y excepciones
  const inicioBusqueda = inicioReservaChile
    .startOf("day")
    .subtract(4, "hour")
    .utc()
    .toDate();
  const finBusqueda = inicioReservaChile
    .endOf("day")
    .add(4, "hour")
    .utc()
    .toDate();

  // Horarios del día
  const horariosDelDia = barberoDoc.horariosDisponibles.filter(
    (h) => Number(h.diaSemana) === diaSemana,
  );

  // 👇 NUEVO: horas extra del día
  const horasExtraDelDia = await excepcionHorarioModel.find({
    barbero,
    tipo: "extra",
    fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
  });

  if (!horariosDelDia.length && !horasExtraDelDia.length)
    return { ok: false, message: "El barbero no trabaja este día" };

  let bloqueValido = null;

  // 1) Horario normal
  for (const h of horariosDelDia) {
    const ini = dayjs.tz(
      `${fecha} ${h.horaInicio}`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago",
    );
    const fin = dayjs.tz(
      `${fecha} ${h.horaFin}`,
      "YYYY-MM-DD HH:mm",
      "America/Santiago",
    );
    if (
      inicioReservaChile.isSameOrAfter(ini) &&
      finReservaChile.isSameOrBefore(fin)
    ) {
      bloqueValido = { inicio: ini, fin };
      break;
    }
  }

  // 2) 👇 NUEVO: horas extra
  if (!bloqueValido) {
    for (const he of horasExtraDelDia) {
      if (!he.horaFin) continue;

      const ini = dayjs.tz(
        `${fecha} ${he.horaInicio}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );
      const fin = dayjs.tz(
        `${fecha} ${he.horaFin}`,
        "YYYY-MM-DD HH:mm",
        "America/Santiago",
      );

      if (
        inicioReservaChile.isSameOrAfter(ini) &&
        finReservaChile.isSameOrBefore(fin)
      ) {
        bloqueValido = { inicio: ini, fin };
        break;
      }
    }
  }

  if (!bloqueValido) {
    console.log("🔴 BLOQUEO EN createReserva");
    console.log("horasExtraDelDia:", JSON.stringify(horasExtraDelDia, null, 2));
    console.log("inicioReservaChile:", inicioReservaChile.format());
    console.log("finReservaChile:", finReservaChile.format());
    return res.status(400).json({
      message: "El servicio no cabe en el horario del profesional",
    });
  }



  const excepciones = await excepcionHorarioModel.find({
    barbero,
    fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
    tipo: "bloqueo",
  });

  const horasBloqueadas = excepciones.map((e) =>
    dayjs(e.fecha).tz("America/Santiago").format("HH:mm"),
  );

  if (horasBloqueadas.includes(horaFormateada))
    return { ok: false, message: "La hora está bloqueada por el barbero" };

  // Colisiones (sin cambios)
  const reservasDelDia = await Reserva.find({
    barbero,
    fecha: { $gte: inicioBusqueda, $lt: finBusqueda },
    estado: { $in: ["pendiente", "confirmada"] },
    ...(excluirReservaId ? { _id: { $ne: excluirReservaId } } : {}),
  });

  for (const r of reservasDelDia) {
    const ini = dayjs(r.fecha).tz("America/Santiago");
    const fin = ini.add(r.duracion, "minute");
    if (inicioReservaChile.isBefore(fin) && finReservaChile.isAfter(ini))
      return { ok: false, message: "La hora ya está ocupada" };
  }

  return { ok: true, inicioReservaChile, finReservaChile };
};
