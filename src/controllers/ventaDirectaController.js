import productoModel from "../models/producto.Model.js";
import ventaDirectaModel from "../models/ventaDirecta.model.js";

export const crearVentaDirecta = async (req, res) => {
  const { productos, metodoPago, observacion, fecha } = req.body;
  // El vendedor siempre es el usuario logueado
 
  try {
    if (!productos || productos.length === 0) {
      return res.status(400).json({ message: "Debes incluir al menos un producto." });
    }
 
    // Validar productos y armar snapshot
    const productosVenta = [];
 
    for (const item of productos) {
      const prod = await productoModel.findOne({
        _id: item.producto,
        empresa: req.usuario.empresaId,
        activo: true,
      });
 
      if (!prod) {
        return res.status(404).json({ message: `Producto ${item.producto} no encontrado o inactivo.` });
      }
 
      if (prod.stock !== null && prod.stock < item.cantidad) {
        return res.status(400).json({
          message: `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock}, solicitado: ${item.cantidad}.`,
        });
      }
 
      productosVenta.push({
        producto: prod._id,
        nombre: prod.nombre,
        precio: prod.precio,
        categoria: prod.categoria || "",
        cantidad: item.cantidad,
        subtotal: prod.precio * item.cantidad,
      });
    }
 
    const totalFinal = productosVenta.reduce((acc, p) => acc + p.subtotal, 0);
 
    // Crear la venta
    const venta = await ventaDirectaModel.create({
      empresa: req.usuario.empresaId,
      vendedor: req.usuario.id,
      productos: productosVenta,
      totalFinal,
      metodoPago: metodoPago || "efectivo",
      observacion: observacion || "",
      fecha: fecha ? new Date(fecha) : new Date(),
    });
 
    // Descontar stock
    for (const item of productosVenta) {
      const prod = await productoModel.findById(item.producto);
      if (prod && prod.stock !== null) {
        await productoModel.findByIdAndUpdate(item.producto, {
          $inc: { stock: -item.cantidad },
        });
      }
    }
 
    res.status(201).json({ msg: "Venta registrada exitosamente!", venta });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const listarVentasDirectas = async (req, res) => {
  const { desde, hasta, vendedor, metodoPago } = req.query;

  try {
    const filtro = {
      empresa: req.usuario.empresaId,
      anulada: false,
    };

    if (desde || hasta) {
      filtro.fecha = {};
      if (desde) filtro.fecha.$gte = new Date(desde);
      if (hasta) {
        const hastaFin = new Date(hasta);
        hastaFin.setHours(23, 59, 59, 999);
        filtro.fecha.$lte = hastaFin;
      }
    }

    if (vendedor) filtro.vendedor = vendedor;
    if (metodoPago) filtro.metodoPago = metodoPago;

    const ventas = await ventaDirectaModel.find(filtro)
      .populate("vendedor", "nombre email")
      .sort({ fecha: -1 });

    res.json({ message: "Lista de ventas directas", ventas });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const obtenerVentaDirecta = async (req, res) => {
  const { id } = req.params;

  try {
    const venta = await ventaDirectaModel.findOne({
      _id: id,
      empresa: req.usuario.empresaId,
    }).populate("vendedor", "nombre email");

    if (!venta) {
      return res
        .status(404)
        .json({ message: `No se encontró la venta con id ${id}` });
    }

    res.json({ venta });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const anularVentaDirecta = async (req, res) => {
  const { id } = req.params;
  const { motivoAnulacion } = req.body;

  try {
    const venta = await ventaDirectaModel.findOne({
      _id: id,
      empresa: req.usuario.empresaId,
    });

    if (!venta) {
      return res
        .status(404)
        .json({ message: `No se encontró la venta con id ${id}` });
    }

    if (venta.anulada) {
      return res.status(400).json({ message: "La venta ya fue anulada." });
    }

    // Devolver stock
    for (const item of venta.productos) {
      const prod = await productoModel.findById(item.producto);
      if (prod && prod.stock !== null) {
        await productoModel.findByIdAndUpdate(item.producto, {
          $inc: { stock: item.cantidad },
        });
      }
    }

    const ventaAnulada = await ventaDirectaModel.findByIdAndUpdate(
      id,
      {
        anulada: true,
        anuladaEn: new Date(),
        motivoAnulacion: motivoAnulacion || "",
      },
      { new: true },
    );

    res.json({
      message: "Venta anulada correctamente. Stock restaurado.",
      venta: ventaAnulada,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const estadisticasVentasDirectas = async (req, res) => {
  const { desde, hasta } = req.query;

  try {
    const matchFecha = {};
    if (desde) matchFecha.$gte = new Date(desde);
    if (hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      matchFecha.$lte = hastaFin;
    }

    const match = {
      empresa: req.usuario.empresaId,
      anulada: false,
      ...(Object.keys(matchFecha).length > 0 && { fecha: matchFecha }),
    };

    const stats = await ventaDirectaModel.aggregate([
      { $match: match },
      {
        $facet: {
          resumen: [
            {
              $group: {
                _id: null,
                totalVentas: { $sum: 1 },
                totalIngresos: { $sum: "$totalFinal" },
                ticketPromedio: { $avg: "$totalFinal" },
              },
            },
          ],
          topProductos: [
            { $unwind: "$productos" },
            {
              $group: {
                _id: "$productos.producto",
                nombre: { $first: "$productos.nombre" },
                cantidadVendida: { $sum: "$productos.cantidad" },
                ingresos: { $sum: "$productos.subtotal" },
              },
            },
            { $sort: { cantidadVendida: -1 } },
            { $limit: 10 },
          ],
          porMetodoPago: [
            {
              $group: {
                _id: "$metodoPago",
                cantidad: { $sum: 1 },
                total: { $sum: "$totalFinal" },
              },
            },
          ],
        },
      },
    ]);

    const resultado = stats[0];

    res.json({
      resumen: resultado.resumen[0] || {
        totalVentas: 0,
        totalIngresos: 0,
        ticketPromedio: 0,
      },
      topProductos: resultado.topProductos,
      porMetodoPago: resultado.porMetodoPago,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
