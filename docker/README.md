# 🐳 Docker Setup - Fixlife

## 📦 Servicios

Este proyecto utiliza Docker Compose para orquestar 4 servicios:

- **Frontend**: React + Vite + Tailwind (Puerto 3000)
- **Backend**: Django REST API (Puerto 8000)
- **MySQL**: Base de datos (Puerto 3306)
- **phpMyAdmin**: Interfaz web para MySQL (Puerto 8080)

## 🚀 Comandos Rápidos

### Desarrollo

```bash
# Iniciar todos los servicios
docker-compose up

# Iniciar en background
docker-compose up -d

# Ver logs de todos los servicios
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f mysql
docker-compose logs -f phpmyadmin

# Detener servicios
docker-compose down

# Detener y eliminar volúmenes (borra datos de MySQL)
docker-compose down -v

# Reconstruir contenedores
docker-compose up --build

# Reconstruir un servicio específico
docker-compose up --build backend
```

### Producción

```bash
# Build y levantar en producción
docker-compose -f docker-compose.prod.yml up -d

# Reconstruir producción
docker-compose -f docker-compose.prod.yml up --build -d
```

## 🌐 URLs de Acceso

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **phpMyAdmin**: http://localhost:8080
- **MySQL**: localhost:3306 (para clientes de base de datos)

## ⚙️ Configuración Inicial

1. Copia el archivo de variables de entorno:
```bash
cp .env.example .env
```

2. Edita `.env` con tus valores (opcional, los valores por defecto funcionan para desarrollo)

3. Inicia los servicios:
```bash
docker-compose up
```

4. Espera a que todos los servicios estén listos (el backend esperará a que MySQL esté disponible)

## 🔧 Troubleshooting

### Puerto ocupado

Si algún puerto está en uso, identifica el proceso:

**Windows:**
```bash
netstat -ano | findstr :3000
netstat -ano | findstr :8000
netstat -ano | findstr :3306
netstat -ano | findstr :8080
```

**Linux/Mac:**
```bash
lsof -i :3000
lsof -i :8000
lsof -i :3306
lsof -i :8080
```

### Backend no puede conectar a MySQL

1. Verifica que MySQL esté saludable:
```bash
docker-compose ps
```

2. Revisa los logs de MySQL:
```bash
docker-compose logs mysql
```

3. Verifica las variables de entorno:
```bash
docker-compose config
```

### Limpiar todo y empezar de cero

```bash
# Detener servicios y eliminar volúmenes
docker-compose down -v

# Eliminar imágenes
docker-compose down --rmi all

# Reconstruir todo
docker-compose up --build
```

### Ver contenedores activos

```bash
docker ps
```

### Acceder a un contenedor

```bash
# Backend (Django shell)
docker-compose exec backend python manage.py shell

# MySQL
docker-compose exec mysql mysql -u root -p

# Frontend (bash)
docker-compose exec frontend sh
```

### Hot Reload no funciona

1. Verifica que los volúmenes estén montados correctamente:
```bash
docker-compose config
```

2. En Windows, asegúrate de que Docker Desktop tenga acceso a la carpeta del proyecto

3. Reinicia el servicio específico:
```bash
docker-compose restart frontend
docker-compose restart backend
```

### phpMyAdmin no carga

1. Verifica que MySQL esté corriendo:
```bash
docker-compose ps mysql
```

2. Espera unos segundos más (MySQL puede tardar en iniciar)

3. Revisa los logs:
```bash
docker-compose logs phpmyadmin
```

## 📊 Estructura de Archivos

```
fixlife/
├── docker-compose.yml          # Orquestación de servicios
├── docker-compose.prod.yml     # Configuración de producción
├── .env                        # Variables de entorno (no versionado)
├── .env.example                # Ejemplo de variables de entorno
├── .dockerignore               # Archivos ignorados
├── backend/                    # Código Django
│   ├── manage.py
│   ├── requirements.txt
│   └── fixlife_backend/
│       ├── settings.py
│       ├── urls.py
│       └── views/
└── docker/
    ├── Dockerfile.dev          # Frontend dev (Vite HMR)
    ├── Dockerfile.backend.dev  # Backend dev (Django runserver)
    ├── Dockerfile.prod         # Frontend prod (Nginx)
    └── README.md               # Esta guía
```

## 💡 Tips

1. **Hot Reload**: Los cambios en código se reflejan automáticamente en dev (frontend y backend)
2. **Logs**: Usa `docker-compose logs -f <servicio>` para debugging de un servicio específico
3. **Performance**: En Windows, considera usar WSL2 para mejor rendimiento
4. **Persistencia**: Los datos de MySQL se guardan en un volumen Docker y persisten entre reinicios
5. **Orden de inicio**: Docker Compose maneja automáticamente el orden (MySQL → Backend/phpMyAdmin → Frontend)
6. **Desarrollo**: El backend Django está en modo DEBUG, no usar en producción
7. **CORS**: El backend acepta peticiones desde localhost:3000 para desarrollo

## 🗄️ Gestión de Base de Datos

### Acceder a phpMyAdmin

1. Abre http://localhost:8080
2. Servidor: `mysql`
3. Usuario: `fixlife_user` (o el configurado en .env)
4. Contraseña: `fixlife_pass_dev` (o la configurada en .env)

### Ejecutar migraciones de Django

```bash
# Crear migraciones
docker-compose exec backend python manage.py makemigrations

# Aplicar migraciones
docker-compose exec backend python manage.py migrate

# Crear superusuario
docker-compose exec backend python manage.py createsuperuser
```

### Backup de MySQL

```bash
# Exportar base de datos
docker-compose exec mysql mysqldump -u root -p fixlife_db > backup.sql

# Importar base de datos
docker-compose exec -T mysql mysql -u root -p fixlife_db < backup.sql
```
