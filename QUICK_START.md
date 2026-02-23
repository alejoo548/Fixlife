# 🚀 Quick Start Guide

## Inicio Rápido en 3 Pasos

### 1️⃣ Iniciar los Servicios

**Linux/Mac:**
```bash
./start.sh
```

**Windows:**
```bash
start.bat
```

**O manualmente:**
```bash
docker-compose up --build
```

### 2️⃣ Esperar a que Todo Esté Listo

La primera vez puede tardar 2-3 minutos mientras descarga las imágenes y construye los contenedores.

Verás mensajes como:
```
✅ fixlife_mysql      | ready for connections
✅ fixlife_backend    | Starting development server at http://0.0.0.0:8000/
✅ fixlife_frontend   | VITE ready in XXX ms
✅ fixlife_phpmyadmin | Apache/2.4.XX (Debian) configured
```

### 3️⃣ Acceder a los Servicios

Abre tu navegador y visita:

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **phpMyAdmin**: http://localhost:8080

## 🎯 Verificación Rápida

### ✅ Verificar que Todo Funciona

1. **Frontend** (http://localhost:3000)
   - Debe cargar la página de Fixlife
   - Debe mostrar el logo y la interfaz

2. **Backend** (http://localhost:8000)
   - Debe mostrar una página de Django
   - Si ves "The install worked successfully!", todo está bien

3. **phpMyAdmin** (http://localhost:8080)
   - Debe mostrar la pantalla de login
   - Usa estas credenciales:
     - Server: `mysql`
     - Username: `fixlife_user`
     - Password: `fixlife_pass_dev`

## 🔧 Comandos Básicos

### Ver Logs
```bash
# Todos los servicios
docker-compose logs -f

# Solo backend
docker-compose logs -f backend

# Solo MySQL
docker-compose logs -f mysql
```

### Detener Servicios
```bash
# Detener (mantiene datos)
docker-compose down

# Detener y eliminar datos
docker-compose down -v
```

### Reiniciar un Servicio
```bash
docker-compose restart backend
```

### Reconstruir
```bash
docker-compose up --build
```

## 🐛 Problemas Comunes

### Puerto Ocupado
Si ves un error como "port is already allocated":

**Windows:**
```bash
netstat -ano | findstr :3000
netstat -ano | findstr :8000
```

**Linux/Mac:**
```bash
lsof -i :3000
lsof -i :8000
```

Detén el proceso que está usando el puerto o cambia el puerto en docker-compose.yml

### Backend No Conecta a MySQL
Espera unos segundos más. MySQL puede tardar en iniciar la primera vez.

Si persiste:
```bash
docker-compose logs mysql
docker-compose restart backend
```

### Cambios No Se Reflejan
```bash
# Reinicia el servicio específico
docker-compose restart frontend
docker-compose restart backend
```

## 📚 Más Información

- **Documentación completa**: `docker/README.md`
- **Backend Django**: `backend/README.md`
- **Resumen de implementación**: `DOCKER_SETUP_COMPLETE.md`

## 🎉 ¡Listo!

Ahora puedes empezar a desarrollar. Los cambios en el código se reflejarán automáticamente gracias al hot reload.

**Happy coding! 🚀**
