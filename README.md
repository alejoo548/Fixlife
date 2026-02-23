# 🏠 Fixlife - Plataforma de Servicios del Hogar

Plataforma web para conectar usuarios con profesionales de servicios del hogar (plomería, electricidad, limpieza, etc.).

## 🚀 Stack Tecnológico

- **Frontend**: React + Vite + Tailwind CSS + TypeScript
- **Backend**: Django + Django REST Framework
- **Base de Datos**: MySQL 8.0
- **Gestión DB**: phpMyAdmin
- **Containerización**: Docker + Docker Compose

## 📋 Requisitos Previos

- Docker Desktop instalado y corriendo
- Git
- Puerto 3000, 8000, 3307 y 8080 disponibles

## 🎯 Inicio Rápido

### 1. Clonar el Repositorio

```bash
git clone https://github.com/alejoo548/Fixlife.git
cd Fixlife
```

### 2. Configurar Variables de Entorno

Copia el archivo de ejemplo y ajusta si es necesario:

```bash
cp .env.example .env
```

El archivo `.env` contiene:
```env
MYSQL_ROOT_PASSWORD=Info2026/*-
MYSQL_DATABASE=fixlife_db
```

### 3. Iniciar los Servicios

**Opción A - Scripts de inicio rápido:**

Linux/Mac:
```bash
chmod +x start.sh
./start.sh
```

Windows:
```bash
start.bat
```

**Opción B - Docker Compose directo:**

```bash
docker-compose up --build
```

### 4. Esperar a que Todo Esté Listo

La primera vez puede tardar 2-3 minutos. Verás mensajes como:

```
✅ fixlife_mysql      | ready for connections
✅ fixlife_backend    | Starting development server at http://0.0.0.0:8000/
✅ fixlife_frontend   | VITE ready in XXX ms
✅ fixlife_phpmyadmin | Apache configured
```

### 5. Acceder a los Servicios

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **phpMyAdmin**: http://localhost:8080
- **MySQL**: localhost:3307

## 🔑 Credenciales

### phpMyAdmin / MySQL
- **Usuario**: `root`
- **Contraseña**: `Info2026/*-`
- **Base de Datos**: `fixlife_db`

## 🛠️ Comandos Útiles

### Ver Logs

```bash
# Todos los servicios
docker-compose logs -f

# Solo un servicio específico
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mysql
```

### Detener Servicios

```bash
# Detener (mantiene datos)
docker-compose down

# Detener y eliminar volúmenes (borra datos de MySQL)
docker-compose down -v
```

### Reiniciar un Servicio

```bash
docker-compose restart backend
docker-compose restart frontend
```

### Reconstruir Contenedores

```bash
docker-compose up --build
```

### Ejecutar Comandos en Contenedores

```bash
# Migraciones de Django
docker-compose exec backend python manage.py migrate

# Crear superusuario de Django
docker-compose exec backend python manage.py createsuperuser

# Shell de Django
docker-compose exec backend python manage.py shell

# Acceder a MySQL
docker-compose exec mysql mysql -u root -p
```

## 📁 Estructura del Proyecto

```
fixlife/
├── backend/                    # Backend Django
│   ├── fixlife_backend/       # Proyecto Django
│   │   ├── settings.py        # Configuración
│   │   ├── urls.py            # URLs principales
│   │   └── views/             # Vistas modulares
│   │       ├── login.py       # (vacío, listo para implementar)
│   │       └── register.py    # (vacío, listo para implementar)
│   ├── manage.py
│   └── requirements.txt
├── docker/                     # Dockerfiles
│   ├── Dockerfile.dev         # Frontend dev
│   ├── Dockerfile.backend.dev # Backend dev
│   ├── Dockerfile.prod        # Frontend prod
│   ├── mysql-init.sql         # Script de inicialización MySQL
│   └── README.md              # Documentación Docker
├── src/                        # Código fuente React
│   ├── components/
│   ├── App.tsx
│   └── main.tsx
├── public/                     # Assets estáticos
├── docker-compose.yml          # Orquestación de servicios
├── .env                        # Variables de entorno (no versionado)
├── .env.example                # Template de variables
├── package.json
└── README.md
```

## 🔧 Desarrollo

### Hot Reload

Los cambios en el código se reflejan automáticamente:

- **Frontend**: Cambios en archivos `.tsx`, `.ts`, `.css` se recargan al instante
- **Backend**: Cambios en archivos `.py` reinician el servidor automáticamente

### Agregar Dependencias

**Frontend:**
```bash
# Detener contenedores
docker-compose down

# Agregar dependencia en package.json
npm install <paquete>

# Reconstruir
docker-compose up --build
```

**Backend:**
```bash
# Agregar dependencia en backend/requirements.txt
echo "nueva-dependencia==1.0.0" >> backend/requirements.txt

# Reconstruir
docker-compose down
docker-compose up --build backend
```

## 🐛 Troubleshooting

### Puerto Ocupado

Si ves un error como "port is already allocated":

**Windows:**
```bash
netstat -ano | findstr :3000
netstat -ano | findstr :8000
netstat -ano | findstr :3307
```

**Linux/Mac:**
```bash
lsof -i :3000
lsof -i :8000
lsof -i :3307
```

Detén el proceso que está usando el puerto o cambia el puerto en `docker-compose.yml`.

### Backend No Conecta a MySQL

Espera unos segundos más. MySQL puede tardar en iniciar la primera vez.

```bash
# Ver logs de MySQL
docker-compose logs mysql

# Reiniciar backend
docker-compose restart backend
```

### Cambios No Se Reflejan

```bash
# Reinicia el servicio específico
docker-compose restart frontend
docker-compose restart backend

# O reconstruye completamente
docker-compose down
docker-compose up --build
```

### Limpiar Todo y Empezar de Cero

```bash
# Detener y eliminar todo (incluye volúmenes)
docker-compose down -v

# Eliminar imágenes
docker-compose down --rmi all

# Reconstruir desde cero
docker-compose up --build
```

### Error de Permisos en Linux

```bash
# Dar permisos al script de inicio
chmod +x start.sh

# Si hay problemas con volúmenes
sudo chown -R $USER:$USER .
```

## 📚 Documentación Adicional

- **Docker**: Ver `docker/README.md` para documentación detallada de Docker
- **Backend**: Ver `backend/README.md` para documentación del backend Django
- **Quick Start**: Ver `QUICK_START.md` para guía de inicio rápido

## 🚢 Producción

Para desplegar en producción, usa:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Nota**: Antes de producción, asegúrate de:
- Cambiar `SECRET_KEY` de Django
- Cambiar contraseñas de MySQL
- Configurar `DEBUG=False` en Django
- Configurar CORS correctamente
- Usar HTTPS

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Notas Importantes

- Esta configuración es para **desarrollo local**
- El modo DEBUG está habilitado en Django
- CORS acepta peticiones desde localhost:3000
- Las contraseñas por defecto son inseguras (cambiar en producción)
- El archivo `.env` está en `.gitignore` y no se versionará

## 📄 Licencia

Este proyecto es privado y confidencial.

## 👥 Equipo

- Desarrollo Frontend & Backend
- Infraestructura Docker

---

**¿Problemas?** Revisa la sección de Troubleshooting o consulta `docker/README.md` para más detalles.

**Happy coding! 🚀**
