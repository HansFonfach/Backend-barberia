import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Container } from "reactstrap";
import { FiMapPin, FiClock, FiArrowRight } from "react-icons/fi";
import { axiosPublic } from "api/axiosPublic";
import "./negociosConfianza.css";

// Catálogo de rubros. Cubre tanto el campo "rubro" (vigente, obligatorio en
// empresas nuevas) como el campo "tipo" (antiguo, solo lo tienen empresas
// creadas antes de que existiera "rubro") — por eso una misma categoría
// puede tener varias llaves ("salon_belleza" y "salon de belleza").
const CATEGORIAS = {
  barberia: { label: "Barbería", color: "#4361ee" },
  peluqueria: { label: "Peluquería", color: "#4361ee" },
  salon_belleza: { label: "Salón de belleza", color: "#d6246e" },
  "salon de belleza": { label: "Salón de belleza", color: "#d6246e" },
  spa: { label: "Spa", color: "#d6246e" },
  centro_estetica: { label: "Centro de estética", color: "#a21caf" },
  estetica: { label: "Centro de estética", color: "#a21caf" },
  nutricion: { label: "Nutrición", color: "#059669" },
  kinesiologia: { label: "Kinesiología", color: "#059669" },
  psicologia: { label: "Psicología", color: "#059669" },
  medicina_general: { label: "Medicina general", color: "#059669" },
  consultorio: { label: "Consultorio", color: "#059669" },
  dental: { label: "Clínica dental", color: "#059669" },
  gimnasio: { label: "Gimnasio", color: "#d97706" },
  masajes: { label: "Masajes", color: "#7209b7" },
  tatuajes: { label: "Tatuajes", color: "#1a1a2e" },
  restaurante: { label: "Bar · Restaurante", color: "#9a6a2c", accion: "Reservar mesa" },
  otros: { label: "Negocio", color: "#6c757d" },
};

const CATEGORIA_DEFAULT = { label: "Negocio", color: "#6c757d" };

// Una empresa puede tener el rubro guardado en "rubro" (vigente) o en
// "tipo" (antiguo). Se prioriza "rubro" porque es el campo obligatorio hoy.
const claveCategoria = (empresa) => (empresa.rubro || empresa.tipo || "").toLowerCase().trim();
const getCategoria = (empresa) => CATEGORIAS[claveCategoria(empresa)] || CATEGORIA_DEFAULT;

const isOpen = (horarioStr) => {
  if (!horarioStr) return null;
  const now = new Date();
  const dayIndex = now.getDay();
  const timeMatch = horarioStr.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;

  const openMinutes = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
  const closeMinutes = parseInt(timeMatch[3], 10) * 60 + parseInt(timeMatch[4], 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const includesSat = /sáb|sabado|sábado/i.test(horarioStr);
  const includesSun = /domingo/i.test(horarioStr);

  if (dayIndex === 0 && !includesSun) return false;
  if (dayIndex === 6 && !includesSat) return false;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
};

const getHorarioDisplay = (horarioStr) => {
  if (!horarioStr) return null;
  const m = horarioStr.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  return m ? `${m[1]} – ${m[2]}` : horarioStr;
};

const iniciales = (nombre = "") =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

const EmpresaCard = ({ empresa }) => {
  const categoria = getCategoria(empresa);
  const open = isOpen(empresa.horarios);
  const horario = getHorarioDisplay(empresa.horarios);
  const color = empresa.colores?.primario || categoria.color;

  return (
    <Link to={`/${empresa.slug}`} className="nc-card" style={{ "--nc-color": color }}>
      {/* Portada: el propio logo, desenfocado, le da a cada tarjeta su identidad */}
      <div className="nc-portada">
        {empresa.logo ? (
          <img className="nc-portada-fondo" src={empresa.logo} alt="" aria-hidden="true" />
        ) : (
          <div className="nc-portada-fondo nc-portada-color" />
        )}
        <div className="nc-portada-velo" />
        {empresa.logo ? (
          <img className="nc-logo" src={empresa.logo} alt={`Logo de ${empresa.nombre}`} loading="lazy" />
        ) : (
          <div className="nc-logo nc-logo-iniciales">{iniciales(empresa.nombre)}</div>
        )}
        {open !== null && (
          <span className={`nc-estado ${open ? "abierto" : "cerrado"}`}>
            <i /> {open ? "Abierto ahora" : "Cerrado"}
          </span>
        )}
      </div>

      <div className="nc-cuerpo">
        <div className="nc-categoria">{categoria.label}</div>
        <h3 className="nc-nombre">{empresa.nombre}</h3>
        {empresa.descripcion && <p className="nc-descripcion">{empresa.descripcion}</p>}

        {(horario || empresa.direccion) && (
          <ul className="nc-datos">
            {horario && (
              <li>
                <FiClock aria-hidden="true" /> <span>{horario}</span>
              </li>
            )}
            {empresa.direccion && (
              <li>
                <FiMapPin aria-hidden="true" /> <span>{empresa.direccion}</span>
              </li>
            )}
          </ul>
        )}

        <span className="nc-boton">
          {categoria.accion || "Reservar hora"} <FiArrowRight aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
};

// Placeholder mientras cargan las empresas, para que la sección no se
// sienta vacía en el primer render.
const CardSkeleton = () => (
  <div className="nc-card nc-skeleton" aria-hidden="true">
    <div className="nc-portada nc-shimmer" />
    <div className="nc-cuerpo">
      <div className="nc-shimmer" style={{ height: 10, width: "35%", borderRadius: 6 }} />
      <div className="nc-shimmer" style={{ height: 18, width: "65%", borderRadius: 6, marginTop: 12 }} />
      <div className="nc-shimmer" style={{ height: 12, width: "90%", borderRadius: 6, marginTop: 14 }} />
      <div className="nc-shimmer" style={{ height: 40, width: "100%", borderRadius: 12, marginTop: 24 }} />
    </div>
  </div>
);

const NegociosConfianza = () => {
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    axiosPublic
      .get("/empresa/publicas")
      .then((res) => setEmpresas(Array.isArray(res.data) ? res.data : []))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  // Filtros solo con las categorías que de verdad hay (agrupadas por nombre)
  const categorias = useMemo(() => {
    const m = new Map();
    for (const e of empresas) {
      const c = getCategoria(e);
      m.set(c.label, (m.get(c.label) || 0) + 1);
    }
    return [...m.entries()];
  }, [empresas]);

  const visibles = filtro === "todos" ? empresas : empresas.filter((e) => getCategoria(e).label === filtro);

  return (
    <section className="nc-seccion">
      <Container>
        <div className="nc-encabezado">
          <span className="nc-eyebrow">Negocios en AgendaFonfach</span>
          <h2 className="nc-titulo">Negocios que confían en nosotros</h2>
          <p className="nc-subtitulo">Elige un negocio y reserva en línea en menos de un minuto.</p>
        </div>

        {categorias.length > 1 && (
          <div className="nc-filtros" role="tablist" aria-label="Filtrar por rubro">
            <button
              type="button"
              role="tab"
              aria-selected={filtro === "todos"}
              className={filtro === "todos" ? "activo" : ""}
              onClick={() => setFiltro("todos")}
            >
              Todos <small>{empresas.length}</small>
            </button>
            {categorias.map(([label, n]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={filtro === label}
                className={filtro === label ? "activo" : ""}
                onClick={() => setFiltro(label)}
              >
                {label} <small>{n}</small>
              </button>
            ))}
          </div>
        )}

        <div className="nc-grilla">
          {cargando && [...Array(3)].map((_, i) => <CardSkeleton key={i} />)}

          {!cargando && empresas.length === 0 && (
            <p className="nc-vacio">Pronto vas a encontrar acá negocios increíbles.</p>
          )}

          {!cargando && visibles.map((empresa) => <EmpresaCard key={empresa._id} empresa={empresa} />)}
        </div>
      </Container>
    </section>
  );
};

export default NegociosConfianza;
