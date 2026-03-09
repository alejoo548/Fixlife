# 🏠 Fixlife - Home Services Platform

<img width="1024" height="1024" alt="Fixilogo" src="https://github.com/user-attachments/assets/4196b4fb-bc62-4ca1-ac24-3c69a22dce42" />

Una plataforma web moderna para conectar usuarios con profesionales de servicios del hogar (plomería, electricidad, limpieza, etc.).

## 🚀 Stack Tecnológico

- **Frontend**: React 18 + Vite + Tailwind CSS + TypeScript + Framer Motion
- **Backend**: Node.js + Express + TypeScript
- **Base de Datos**: MySQL 8.0
- **Gestión de BD**: phpMyAdmin
- **Contenedorización**: Docker + Docker Compose
- **Autenticación**: JWT (JSON Web Tokens)
- **Email**: Nodemailer
- **Seguridad**: Helmet, Rate Limiting, CORS

---

## 📋 Requisitos Previos

- Docker Desktop instalado y corriendo
- Git
- Puertos disponibles: 3000, 8000, 3307, 8080

---

## 🎯 Guía de Inicio Rápido

### 1. Clonar el Repositorio

```bash
git clone https://github.com/alejoo548/Fixlife.git
cd Fixlife
```

### 2. Configurar Variables de Entorno

```bash
cp .env.example .env
```

El archivo `.env.example` ya está configurado con las credenciales por defecto para desarrollo local.

### 3. Iniciar los Contenedores

```bash
docker-compose up --build
```

Para ejecutar en segundo plano:
```bash
docker-compose up -d --build
```

### 4. Acceder a los Servicios

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **phpMyAdmin**: http://localhost:8080
- **MySQL**: `localhost:3307`

---

## 🗂️ Estructura del Proyecto

```
Fixlife/
├── 📁 backend/                      # Backend Node.js + Express + TypeScript
│   ├── 📁 src/
│   │   ├── 📁 config/              # Configuraciones
│   │   │   ├── db.ts               # Conexión a MySQL
│   │   │   └── mail.ts             # Configuración de email
│   │   │
│   │   ├── 📁 controllers/         # Lógica de negocio
│   │   │   ├── admin.controller.ts # CRUD servicios, aprobación workers, stats, hero slides
│   │   │   ├── auth.controller.ts  # Registro, login, verificación, reset password
│   │   │   ├── services.controller.ts # Servicios públicos
│   │   │   └── worker.controller.ts   # Perfil worker, documentos, especialidades
│   │   │
│   │   ├── 📁 middlewares/         # Middlewares de Express
│   │   │   ├── admin.middleware.ts # Verificación rol admin
│   │   │   ├── auth.middleware.ts  # Verificación JWT
│   │   │   ├── security.middleware.ts # Rate limiting
│   │   │   ├── upload.middleware.ts   # Multer para archivos
│   │   │   └── validation.middleware.ts # Validación de datos
│   │   │
│   │   ├── 📁 routes/              # Definición de rutas
│   │   │   ├── admin.routes.ts     # /api/admin/*
│   │   │   ├── auth.routes.ts      # /api/auth/*
│   │   │   ├── services.routes.ts  # /api/services/*
│   │   │   └── worker.routes.ts    # /api/worker/*
│   │   │
│   │   ├── 📁 types/               # Definiciones TypeScript
│   │   │   ├── express-rate-limit.d.ts
│   │   │   ├── helmet.d.ts
│   │   │   └── nodemailer.d.ts
│   │   │
│   │   ├── 📁 utils/               # Utilidades
│   │   │   └── email.ts            # Envío de emails
│   │   │
│   │   └── index.ts                # Punto de entrada del servidor
│   │
│   ├── 📁 uploads/                 # Archivos subidos (DUI, certificados, imágenes)
│   ├── .env                        # Variables de entorno backend
│   ├── Dockerfile                  # Imagen Docker backend
│   ├── package.json
│   └── tsconfig.json
│
├── 📁 src/                         # Frontend React + TypeScript
│   ├── 📁 components/
│   │   ├── 📁 common/              # Componentes reutilizables
│   │   │   ├── Button.tsx
│   │   │   ├── Logo.tsx
│   │   │   ├── ScrollReveal.tsx
│   │   │   └── SkeletonLoader.tsx
│   │   │
│   │   ├── 📁 dashboard/           # Vistas del dashboard worker
│   │   │   ├── EarningsView.tsx
│   │   │   ├── RequestsView.tsx
│   │   │   ├── ScheduleView.tsx
│   │   │   ├── SettingsView.tsx
│   │   │   └── UploadDocumentsView.tsx
│   │   │
│   │   ├── 📁 effects/             # Efectos visuales
│   │   │   └── ParticlesBackground.tsx
│   │   │
│   │   ├── 📁 layout/              # Layouts de la app
│   │   │
│   │   ├── 📁 modals/              # Modales y dashboards
│   │   │   ├── AdminDashboard.tsx  # Dashboard completo del admin
│   │   │   ├── AuthModal.tsx       # Modal login/registro usuarios
│   │   │   ├── ProDashboard.tsx    # Dashboard workers
│   │   │   ├── ProSidebar.tsx      # Sidebar del dashboard worker
│   │   │   ├── ServiceRequestWizard.tsx # Wizard solicitud servicio
│   │   │   └── WorkerAuthModal.tsx # Modal login/registro workers
│   │   │
│   │   ├── 📁 sections/            # Secciones de la landing
│   │   │   ├── FAQSection.tsx
│   │   │   ├── HeroSlider.tsx      # Carrusel hero (editable desde admin)
│   │   │   ├── ProBento.tsx
│   │   │   ├── SafetySection.tsx
│   │   │   ├── StepsSection.tsx
│   │   │   └── TestimonialsCarousel.tsx
│   │   │
│   │   ├── JoinProSlider.tsx
│   │   └── ServiceRequestWizard.tsx
│   │
│   ├── 📁 config/
│   │   └── api.ts                  # Endpoints del API
│   │
│   ├── 📁 context/
│   │   └── AuthContext.tsx         # Context de autenticación
│   │
│   ├── 📁 pages/
│   │   └── ForgotPassword.tsx      # Página recuperar contraseña
│   │
│   ├── 📁 routes/                  # Rutas del frontend
│   │
│   ├── 📁 services/
│   │   └── authService.ts          # Servicios de autenticación
│   │
│   ├── 📁 utils/
│   │   ├── heroSlides.ts           # Gestión de hero slides
│   │   └── session.ts              # Gestión de sesión
│   │
│   ├── types.ts                    # Tipos TypeScript globales
│   ├── App.tsx                     # Componente principal
│   ├── main.tsx                    # Punto de entrada
│   └── index.css                   # Estilos globales
│
├── 📁 docker/                      # Configuración Docker
│   ├── Dockerfile.backend.dev
│   ├── Dockerfile.dev
│   ├── Dockerfile.prod
│   ├── fixlife_db.sql              # Schema completo de la BD
│   ├── mysql-init.sql              # Script de inicialización
│   └── README.md
│
├── 📁 public/                      # Assets estáticos
│   ├── Fixilogo.png
│   ├── Fixlogo.png
│   ├── mascot.png
│   └── tranquilo.png
│
├── .dockerignore
├── .env                            # Variables de entorno globales
├── .env.example                    # Ejemplo de variables
├── .gitignore
├── docker-compose.yml              # Orquestación de contenedores
├── docker-compose.prod.yml         # Configuración producción
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js              # Configuración Tailwind
├── tsconfig.json
├── vite.config.ts                  # Configuración Vite
└── README.md
```

---

## 🎨 Características Principales

### 👤 Para Usuarios
- ✅ Registro y autenticación con verificación por email
- ✅ Búsqueda y solicitud de servicios
- ✅ Sistema de wizard para solicitudes paso a paso
- ✅ Recuperación de contraseña
- ✅ Interfaz moderna y responsiva

### 👷 Para Trabajadores (Pros)
- ✅ Registro con documentación (DUI, certificados)
- ✅ Selección de especialidades/servicios
- ✅ Dashboard con vistas de: solicitudes, agenda, ganancias, configuración
- ✅ Sistema de aprobación por admin
- ✅ Subida de documentos con validación

### 👨‍💼 Para Administradores
- ✅ **Dashboard completo** con estadísticas en tiempo real
- ✅ **CRUD de Servicios**: crear, editar, activar/desactivar servicios
- ✅ **Gestión de Workers**: aprobar o rechazar solicitudes pendientes
- ✅ **Previsualización de documentos**: ver DUI y certificados
- ✅ **Editor de Hero Slides**: gestionar carrusel de la homepage
  - Subida de imágenes con auto-crop a 16:9
  - Edición de texto (tag, título, descripción, CTA)
  - Reordenamiento de slides
  - Restaurar valores por defecto
- ✅ **Analytics**: gráficos de usuarios, pros, ingresos
- ✅ **Monitoreo del sistema**: CPU, base de datos, storage

---

## 🔐 Sistema de Autenticación

### Roles de Usuario
- **user**: Usuario regular que solicita servicios
- **worker**: Profesional que ofrece servicios
- **admin**: Administrador de la plataforma

### Flujo de Autenticación
1. Registro → Email de verificación
2. Click en link de verificación
3. Login con credenciales
4. JWT token almacenado en localStorage
5. Token enviado en header `Authorization: Bearer <token>`

---

## 📡 API Endpoints

### Auth (`/api/auth`)
```
POST   /register          - Registro de usuario
POST   /register-worker   - Registro de worker
POST   /login             - Login
POST   /verify-email      - Verificar email
POST   /forgot-password   - Solicitar reset password
POST   /reset-password    - Resetear password
```

### Services (`/api/services`)
```
GET    /                  - Obtener servicios activos (público)
```

### Worker (`/api/worker`)
```
GET    /profile           - Obtener perfil worker
PUT    /profile           - Actualizar perfil
POST   /documents         - Subir documentos
GET    /services          - Obtener servicios disponibles
POST   /services          - Asignar servicios al worker
```

### Admin (`/api/admin`)
```
# Services CRUD
GET    /services          - Listar todos los servicios
POST   /services          - Crear servicio
PUT    /services/:id      - Actualizar servicio
DELETE /services/:id      - Eliminar servicio

# Worker Approval
GET    /pending-workers   - Listar workers pendientes
PUT    /workers/:id/approve - Aprobar worker
PUT    /workers/:id/reject  - Rechazar worker

# Dashboard Stats
GET    /stats             - Obtener estadísticas

# Hero Slides
GET    /hero-slides       - Obtener slides (público)
PUT    /hero-slides       - Actualizar slides (admin)
POST   /hero-slides/image-upload - Subir imagen temporal
POST   /hero-slides/:id/image    - Actualizar imagen de slide
```

---

## 🗄️ Base de Datos

### Tablas Principales

#### `users`
Almacena todos los usuarios (users, workers, admins)
- Campos: id_user, name, lastname, email, password, phone_number, rol, verification_token, etc.

#### `worker_profiles`
Perfil extendido para workers
- Campos: id_worker_profile, id_user, bio, dui_document, cert_document, is_verified

#### `services`
Catálogo de servicios disponibles
- Campos: id_service, name, description, icon, is_active

#### `worker_services`
Relación many-to-many entre workers y servicios
- Campos: id_worker_service, id_worker_profile, id_service

#### `hero_slides`
Slides del carrusel de la homepage (editable desde admin)
- Campos: id_slide, sort_order, image_url, tag, title, description, cta

---

## 🔧 Comandos Útiles

### Docker

```bash
# Iniciar servicios
docker-compose up

# Iniciar en segundo plano
docker-compose up -d

# Ver logs
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f backend

# Detener servicios
docker-compose down

# Resetear base de datos (elimina volumen)
docker-compose down -v
docker-compose up --build

# Reconstruir imágenes
docker-compose up --build

# Entrar a un contenedor
docker exec -it fixlife_backend bash
```

### Backend

```bash
# Dentro del contenedor backend
cd backend
npm run dev      # Modo desarrollo con nodemon
npm run build    # Compilar TypeScript
npm start        # Ejecutar versión compilada
```

### Frontend

```bash
# En la raíz del proyecto
npm run dev      # Modo desarrollo
npm run build    # Build para producción
npm run preview  # Preview del build
```

---

## 🔑 Credenciales de Base de Datos

**phpMyAdmin** (http://localhost:8080)
- **Usuario**: `root`
- **Contraseña**: `Info2026/*-`
- **Base de datos**: `fixlife_db`

**Conexión directa MySQL**
- **Host**: `localhost`
- **Puerto**: `3307`
- **Usuario**: `root`
- **Contraseña**: `Info2026/*-`

---

## 📦 Gestión de Archivos

Los archivos subidos (documentos, imágenes) se almacenan en:
```
backend/uploads/
├── dui_document-*.{pdf,jpg,png,webp}
├── cert_document-*.{pdf,jpg,png,webp}
└── profile_image-*.{jpg,png,webp}
```

**Límites:**
- Tamaño máximo: 10MB por archivo
- Formatos permitidos: PDF, JPG, PNG, WEBP

---

## 🎨 Personalización de Tema

Los colores principales están definidos en `tailwind.config.js`:

```javascript
colors: {
  'bird-blue': '#0090FF',
  'bird-darkBlue': '#0070CC',
  'bird-lightBlue': '#33A9FF',
  'bird-orange': '#FF8000',
  'bird-yellow': '#FFC20E',
  'bird-gold': '#E6A500',
}
```

---

## 🚀 Despliegue a Producción

Para producción, usa:
```bash
docker-compose -f docker-compose.prod.yml up --build
```

Asegúrate de:
1. Cambiar las contraseñas en `.env`
2. Configurar un JWT_SECRET seguro
3. Configurar SMTP real para emails
4. Usar HTTPS
5. Configurar CORS apropiadamente

---

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📝 Notas para Desarrolladores

- **Hot Reload**: Tanto frontend como backend tienen hot-reload activado
- **TypeScript**: Todo el código está tipado
- **Validación**: Los middlewares validan datos antes de llegar a los controllers
- **Seguridad**: Rate limiting, helmet, CORS configurados
- **Logs**: Los logs del backend se muestran en la consola de Docker

---

## 📄 Licencia

Este proyecto es privado y pertenece al equipo de desarrollo de Fixlife.

---

## 👥 Equipo

Desarrollado con ❤️ por el equipo de Fixlife

---

## 📞 Soporte

Para problemas o preguntas, abre un issue en el repositorio de GitHub.
