export const clasificarCliente = totalReservas => {

  if (totalReservas >= 5) {
    return "fiel";
  }

  if (totalReservas >= 2) {
    return "medio";
  }

  return "nuevo";
};