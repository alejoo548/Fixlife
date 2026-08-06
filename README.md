# 🏠 Fixlife — Plataforma de servicios del hogar

<img width="1024" height="1024" alt="Fixilogo" src="https://github.com/user-attachments/assets/4196b4fb-bc62-4ca1-ac24-3c69a22dce42" />

Fixlife conecta clientes con profesionales (pros) para resolver servicios del hogar con flujo completo: solicitud, asignación, seguimiento, chat, pago y cierre.

---

## 🚀 Stack actual

- Frontend: React 18 + Vite + TypeScript + Tailwind + Framer Motion
- Backend: Node.js + Express + TypeScript
- DB: MySQL 8 + phpMyAdmin
- Seguridad: JWT, Helmet, rate limiting, validación Zod
- Infra: Docker + Docker Compose

---

## ✅ Qué incluye hoy

### Cliente
- Registro/login, recuperación de contraseña y perfil.
- Wizard de solicitud de servicio con imágenes, ubicación y presupuesto.
- Seguimiento en vivo del trabajador asignado (`ClientLiveRequestTracker`).
- Chat por solicitud (cliente ↔ pro).
- Flujo de pago y confirmación de finalización.
- Calificación del servicio al cerrar la solicitud.

### Pro (trabajador)
- Registro y verificación documental.
- Dashboard pro: solicitudes, estado, ganancias y configuración.
- Aceptar/rechazar/counter offer, iniciar y completar trabajos.
- Presencia online y gestión de portafolio.

### Admin
- CRUD de servicios y tarjetas (`service_cards`) de homepage.
- Gestión de workers pendientes.
- Gestión de usuarios y estado/rol.
- Histórico de solicitudes y actividad admin.
- Gestión de recompensas de pros.
- Editor de hero slides e imágenes.

### Fixlife Zod
- Validación modular con schemas Zod por dominio (auth, worker, admin).
- Middleware genérico `validate(schema)`.
- Documentación dedicada en `FIXLIFE_ZOD.md`.

---

## 🧭 Flujo funcional principal

1. Cliente crea solicitud (`/api/services/requests`).
2. Sistema/pros toman o responden la solicitud.
3. Cliente ve tracking en mapa y estado del trabajo.
4. Cliente/pro se comunican por chat de solicitud.
5. Cliente confirma pago y finalización.
6. Cliente califica el trabajo.

Notas:
- Geocoding y sugerencias de ubicación: `/api/services/geocode`, `/api/services/geocode/suggest`, `/api/services/geocode/reverse`.
- Workers cercanos: `/api/services/nearby-workers`.

---

## 📁 Estructura relevante del proyecto

```text
Fixlife/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── services.controller.ts
│   │   │   ├── worker.controller.ts
│   │   │   └── admin.controller.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── services.routes.ts
│   │   │   ├── worker.routes.ts
│   │   │   ├── admin.routes.ts
│   │   │   └── notifications.routes.ts
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── security.middleware.ts
│   │   │   ├── upload.middleware.ts
│   │   │   └── validate.middleware.ts
│   │   ├── schemas/
│   │   │   ├── auth.schema.ts
│   │   │   ├── worker.schema.ts
│   │   │   └── admin.schema.ts
│   │   └── index.ts
│   └── uploads/
├── src/
│   ├── config/api.ts
│   ├── components/modals/ServiceRequestWizard.tsx
│   ├── components/modals/ClientLiveRequestTracker.tsx
│   ├── components/modals/AdminDashboard.tsx
│   ├── components/modals/ProDashboard.tsx
│   └── pages/PaymentCheckoutPage.tsx
├── docker/
│   ├── fixlife_db.sql
│   └── mysql-init.sql
├── docker-compose.yml
├── .env.example
└── FIXLIFE_ZOD.md
```

---

## ⚙️ Variables de entorno

Copiar plantilla:

```bash
cp .env.example .env
```

Variables clave para que todo funcione:

- `MYSQL_ROOT_PASSWORD`
- `MYSQL_DATABASE`
- `DB_PASSWORD` (password que usará el backend para MySQL)
- `JWT_SECRET`
- `ALLOWED_ORIGINS` (especialmente en producción)
- `EMAIL_USER` / `EMAIL_PASS` (si se usará email real)
- `VITE_API_URL` (opcional; en red local se resuelve dinámicamente por host)

---

## 🐳 Levantar en Docker (desarrollo)

```bash
docker compose up -d --build
```

Servicios:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- phpMyAdmin: `http://localhost:8080`
- MySQL host: `localhost:3307`

En red local (ej. Raspberry), usar la IP de la máquina host:

- `http://<IP_RASPBERRY>:3000`
- `http://<IP_RASPBERRY>:8000`
- `http://<IP_RASPBERRY>:8080`

`0.0.0.0:puerto` en Docker significa “escucha en todas las interfaces”; no es la IP que debes abrir en el navegador.

---

## 🧪 Validaciones rápidas

```bash
# Frontend build
npm run build

# Backend build
cd backend && npm run build

# Salud de contenedores
docker compose ps

# Servicios públicos
curl http://localhost:8000/api/services
curl http://localhost:8000/api/services/cards
```

---

## 📡 Endpoints principales (resumen)

### Auth (`/api/auth`)
- `POST /register/worker`
- `POST /register-user`
- `POST /verify-worker-email`
- `POST /resend-otp`
- `POST /login`
- `POST /forgot-password`
- `POST /reset-password`
- `POST /verify-reset-token`
- `PUT /profile`
- `POST /profile-image`
- `DELETE /profile-image`

### Services (`/api/services`)
- Públicos: `/`, `/cards`, `/geocode`, `/geocode/suggest`, `/geocode/reverse`, `/nearby-workers`
- Privados: `/saved-locations*`, `/my-requests`, `/requests/:id/...`, rating y chat de solicitud

### Worker (`/api/worker`)
- `/me`, `/rewards-dashboard`, `/requests`
- Acciones de request: accept/reject/counter/start/complete
- `/presence`, `/settings`, `/change-password`
- Verificación y archivos: `/verify`, `/profile-image`, `/portfolio`

### Admin (`/api/admin`)
- Servicios: CRUD `/services`
- Homepage cards: CRUD `/service-cards`
- Workers: `/pending-workers`, `/:id/approve`, `/:id/reject`
- Usuarios: `/users`, role/status
- Dashboard: `/stats`, `/requests-history`, `/activity`
- Rewards: `/worker-rewards`, `/worker-rewards/settings`, `/worker-rewards/payouts/:idBonusPayout/pay`
- Hero: `/hero-slides`, `/hero-slides/image-upload`, `/hero-slides/:idSlide/image`

### Notifications (`/api/notifications`)
- `GET /`
- `POST /read-all`
- `POST /:idNotification/read`

## 🛡️ Seguridad y validación

- JWT por rol (cliente/pro/admin).
- Rate limiting en auth y rutas sensibles.
- CORS configurable por `ALLOWED_ORIGINS`.
- Uploads protegidos (ruta `/uploads` requiere token).
- Validación Zod en rutas críticas vía `validate.middleware.ts`.

Ver detalle completo: `FIXLIFE_ZOD.md`.

---

## 🧱 Base de datos y seed inicial

- Script base: `docker/fixlife_db.sql`.
- Init MySQL: `docker/mysql-init.sql`.
- Seed defensivo en runtime:
  - Si `services` está vacía, backend inserta catálogo por defecto.
  - Si `service_cards` está vacía, backend genera cards base.

Esto evita despliegues “vacíos” cuando se monta en una máquina nueva.

---

## 🔧 Troubleshooting rápido

### Frontend carga pero login o API falla en celular
- Revisar que accedes por IP (`http://<IP>:3000`) y no por `localhost`.
- Verificar backend en `http://<IP>:8000`.

### Error DB `Access denied for user root@...`
- Verificar `DB_PASSWORD` vs contraseña real de MySQL.
- Revisar variables efectivas del backend en `docker compose`.

### Servicios/cards vacíos
- Revisar logs backend; se deben auto-sembrar al consultar servicios/cards.

---

## 🚀 Producción

Referencia base:

```bash
# Las imágenes se publican desde GitHub Actions al hacer push a main.
# latest trae última versión; fijar sha-<commit> permite rollback reproducible.
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

Producción consume imágenes `ghcr.io/alejoo548/fixlife-*`, no código local.
Configura en GitHub → Settings → Secrets and variables → Actions los valores
`VITE_*` necesarios para compilar frontend. Si paquetes GHCR quedan privados,
configura credenciales de lectura de GHCR en Docker Manager antes de actualizar.

Checklist mínimo:

1. `JWT_SECRET` fuerte.
2. `ALLOWED_ORIGINS` correctamente definido.
3. Credenciales DB reales (sin placeholders).
4. HTTPS y reverse proxy para entorno público.

---

## 📌 Notas finales

- Recomendado trabajar en una sola fuente de verdad para configuración (`.env` de despliegue).
- Este repositorio está orientado a desarrollo y despliegue con Docker en entornos locales/LAN (incluyendo Raspberry Pi).
