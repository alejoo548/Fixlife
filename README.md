<img src="public/Fixilogo.webp" alt="Fixlife mascot" width="72" align="left" />

# Fixlife — Plataforma de servicios del hogar

**Prototipo funcional completo.** Fixlife es una plataforma que conecta clientes con profesionales ("pros") para resolver servicios del hogar — desde instalación y reparación de aire acondicionado hasta plomería, electricidad y más — con un flujo de punta a punta: solicitud, asignación automática o por selección, seguimiento en vivo, chat, pago y calificación.

<br clear="left" />

---

## 💡 La idea

En El Salvador (y en general en Latinoamérica) conseguir un profesional de confianza para un arreglo del hogar suele depender de recomendaciones informales, sin garantía de disponibilidad, precio claro ni seguimiento del trabajo. Fixlife busca resolver eso con una app tipo "Uber para servicios del hogar":

- El cliente publica lo que necesita (con fotos, ubicación y presupuesto).
- El sistema asigna automáticamente al pro disponible más cercano y verificado (o el cliente elige entre postulantes, según el modo).
- El cliente sigue al pro en el mapa en tiempo real, como un pedido de comida o un viaje.
- El pago queda protegido hasta que el trabajo se confirma como terminado.
- Ambas partes se califican al cerrar.

Esta versión es un **prototipo terminado y funcional** de esa idea: no es solo una maqueta visual, corre de extremo a extremo con base de datos real, pagos reales (PayPal/Wompi), notificaciones, geolocalización y paneles de administración completos.

---

## 🚀 Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind + Framer Motion
- **Backend:** Node.js + Express + TypeScript
- **Base de datos:** MySQL 8 + phpMyAdmin
- **Seguridad:** JWT por rol, Helmet, rate limiting, validación con Zod
- **Infraestructura:** Docker + Docker Compose (listo para producción con Traefik/GHCR)

---

## ✅ Qué incluye esta versión

### Cliente
- Registro/login, recuperación de contraseña y perfil.
- Wizard de solicitud de servicio con fotos, ubicación y presupuesto.
- Seguimiento en vivo del profesional asignado en el mapa.
- Chat por solicitud (cliente ↔ pro).
- Flujo de pago y confirmación de finalización.
- Calificación del servicio al cerrar la solicitud.

### Pro (trabajador)
- Registro y verificación documental (DUI + certificaciones).
- Dashboard con solicitudes, estado, ganancias y configuración.
- Aceptar, rechazar o hacer contraoferta; iniciar y completar trabajos.
- Presencia en línea y gestión de portafolio.

### Admin
- CRUD de servicios y tarjetas de la página principal.
- Aprobación/rechazo de profesionales pendientes (con notificación por correo).
- Gestión de usuarios: rol, estado (con notificación por correo).
- Histórico de solicitudes y actividad administrativa.
- Gestión de recompensas y estados de pago de los pros.
- Editor de banners/hero de la página principal.
- Exportes en PDF (estadísticas y estados de cuenta de pros).

### Base técnica
- Validación modular con esquemas Zod por dominio (auth, worker, admin) — ver `FIXLIFE_ZOD.md`.
- Seed automático de servicios/tarjetas si la base de datos está vacía (para que una instalación nueva nunca arranque en blanco).
- Compresión de imágenes en el cliente antes de subir, límites de tamaño consistentes entre frontend y backend.

---

## 🧭 Flujo funcional principal

1. Cliente crea una solicitud (`POST /api/services/requests`).
2. El sistema asigna o los pros responden a la solicitud.
3. Cliente ve el seguimiento en mapa y el estado del trabajo.
4. Cliente y pro se comunican por el chat de la solicitud.
5. Cliente confirma pago y finalización.
6. Cliente califica el trabajo.

---

## ⬇️ Cómo descargarlo y correrlo

### Requisitos
- Docker y Docker Compose
- (Opcional) Node.js 20+ si se quiere correr fuera de Docker

### Pasos rápidos

```bash
git clone https://github.com/alejoo548/Fixlife.git
cd Fixlife
cp .env.example .env
# Editar .env con tus valores (ver sección de variables abajo)
docker compose up -d --build
```

Servicios levantados:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- phpMyAdmin: `http://localhost:8080`
- MySQL: `localhost:3307`

Para acceder desde otro dispositivo en la misma red (celular, otra compu), usar la IP de la máquina host en vez de `localhost`, por ejemplo `http://192.168.1.50:3000`.

Guía detallada paso a paso (Windows y Linux, desde cero): **[INSTALACION.md](INSTALACION.md)**.

### Variables de entorno clave

- `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `DB_PASSWORD`
- `JWT_SECRET`
- `ALLOWED_ORIGINS` (obligatorio en producción)
- `EMAIL_USER` / `EMAIL_PASS` (para correos reales: verificación, notificaciones admin, etc.)
- `VITE_API_URL` (opcional; en red local se resuelve dinámicamente por host)
- Claves de pago (`PAYPAL_*`, `WOMPI_*`) si se quiere probar el flujo de pago real

---

## 📁 Estructura relevante del proyecto

```text
Fixlife/
├── backend/
│   ├── src/
│   │   ├── controllers/       (auth, services, worker, admin)
│   │   ├── routes/
│   │   ├── middlewares/       (auth, security, uploads, validación)
│   │   ├── schemas/           (Zod, por dominio)
│   │   └── index.ts
│   └── uploads/
├── src/
│   ├── config/api.ts
│   ├── components/modals/     (wizard de solicitud, tracker en vivo, dashboard pro)
│   ├── features/admin/        (panel admin: módulos, layout, i18n propio)
│   └── pages/PaymentCheckoutPage.tsx
├── docker/
│   ├── fixlife_db.sql
│   └── mysql-init.sh
├── docker-compose.yml
├── .env.example
├── INSTALACION.md
└── FIXLIFE_ZOD.md
```

---

## 📡 Endpoints principales (resumen)

### Auth (`/api/auth`)
`register/worker` · `register-user` · `verify-worker-email` · `resend-otp` · `login` · `forgot-password` · `reset-password` · `verify-reset-token` · `profile` · `profile-image`

### Services (`/api/services`)
Públicos: `/`, `/cards`, `/geocode`, `/geocode/suggest`, `/geocode/reverse`, `/nearby-workers`
Privados: `saved-locations*`, `my-requests`, `requests/:id/...`, rating y chat de solicitud

### Worker (`/api/worker`)
`/me`, `/rewards-dashboard`, `/requests` (accept/reject/counter/start/complete), `/presence`, `/settings`, `/change-password`, `/verify`, `/profile-image`, `/portfolio`

### Admin (`/api/admin`)
Servicios y homepage cards (CRUD) · workers pendientes/aprobar/rechazar · usuarios (rol/estado) · `/stats`, `/requests-history`, `/activity` · recompensas de pros · hero slides

### Notifications (`/api/notifications`)
`GET /` · `POST /read-all` · `POST /:idNotification/read`

---

## 🛡️ Seguridad y validación

- JWT por rol (cliente / pro / admin).
- Rate limiting en auth y rutas sensibles.
- CORS configurable por `ALLOWED_ORIGINS`.
- Uploads protegidos (`/uploads` requiere token).
- Validación con Zod en rutas críticas vía `validate.middleware.ts`.

Detalle completo: [FIXLIFE_ZOD.md](FIXLIFE_ZOD.md).

---

## 🚀 Despliegue en producción

```bash
# Las imágenes se publican desde GitHub Actions al hacer push a main.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

Producción consume imágenes `ghcr.io/alejoo548/fixlife-*`, no código local. Configurar en GitHub → Settings → Secrets and variables → Actions los valores `VITE_*` necesarios para compilar el frontend.

Checklist mínimo:
1. `JWT_SECRET` fuerte y único.
2. `ALLOWED_ORIGINS` correctamente definido.
3. Credenciales de base de datos reales (sin placeholders).
4. HTTPS y reverse proxy para entorno público.

---

## 🧪 Troubleshooting rápido

**Frontend carga pero login o API falla en celular** → acceder por IP (`http://<IP>:3000`), no por `localhost`.

**Error DB `Access denied for user root@...`** → revisar `DB_PASSWORD` contra la contraseña real de MySQL en `docker compose`.

**Servicios/cards vacíos** → revisar logs del backend; deben auto-sembrarse al consultar `/api/services` o `/api/services/cards`.

---

<p align="center"><img src="public/Fixilogo.webp" alt="Fixlife" width="40" /><br /><sub>Fixlife — hecho con 💙 en El Salvador</sub></p>
