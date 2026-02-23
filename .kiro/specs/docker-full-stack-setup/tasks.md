# Implementation Plan: Docker Full Stack Setup

## Overview

Este plan implementa un entorno de desarrollo completo dockerizado con 4 servicios: frontend React (existente), backend Django (estructura base), MySQL y phpMyAdmin. Todo se orquesta con Docker Compose y soporta hot reload para desarrollo ágil.

## Tasks

- [ ] 1. Crear estructura de directorios del backend Django
  - Crear directorio backend/ en la raíz del proyecto
  - Crear estructura backend/fixlife_backend/ con subdirectorios
  - Crear directorio backend/fixlife_backend/views/ para vistas modulares
  - Crear archivos __init__.py en todos los paquetes Python
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 2. Crear proyecto Django base con configuración
  - [ ] 2.1 Inicializar proyecto Django y crear manage.py
    - Crear manage.py en backend/
    - Crear settings.py, urls.py, wsgi.py, asgi.py en backend/fixlife_backend/
    - _Requirements: 3.1_
  
  - [ ] 2.2 Configurar base de datos MySQL en settings.py
    - Configurar DATABASES con engine mysql y variables de entorno
    - Usar os.environ.get() para DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
    - _Requirements: 3.4, 7.3_
  
  - [ ] 2.3 Configurar CORS para desarrollo en settings.py
    - Agregar django-cors-headers a INSTALLED_APPS y MIDDLEWARE
    - Configurar CORS_ALLOWED_ORIGINS con localhost:3000
    - Configurar ALLOWED_HOSTS con localhost, 127.0.0.1, 0.0.0.0
    - Agregar comentarios de advertencia sobre uso solo en desarrollo
    - _Requirements: 12.2, 12.3, 12.5_

- [ ] 3. Crear archivos de vistas modulares vacías
  - Crear backend/fixlife_backend/views/__init__.py
  - Crear backend/fixlife_backend/views/login.py con comentario TODO
  - Crear backend/fixlife_backend/views/register.py con comentario TODO
  - Asegurar que no contengan lógica de negocio implementada
  - _Requirements: 3.2, 3.3, 3.6_

- [ ] 4. Crear archivo de dependencias del backend
  - Crear backend/requirements.txt
  - Incluir Django>=4.2,<5.0
  - Incluir mysqlclient>=2.2.0
  - Incluir django-cors-headers>=4.3.0
  - _Requirements: 3.5, 12.1_

- [ ] 5. Crear Dockerfile para el backend
  - Crear docker/Dockerfile.dev
  - Usar imagen base python:3.11-slim
  - Instalar dependencias del sistema para mysqlclient (default-libmysqlclient-dev, build-essential, pkg-config)
  - Copiar requirements.txt primero, luego instalar dependencias
  - Copiar código de aplicación después
  - Configurar WORKDIR /app
  - Configurar CMD para ejecutar runserver en 0.0.0.0:8000
  - _Requirements: 4.1, 4.2, 4.3, 8.1, 8.3, 8.4, 8.5_

- [ ] 6. Crear archivo docker-compose.yml
  - [ ] 6.1 Definir estructura base y red
    - Crear docker-compose.yml en raíz del proyecto
    - Definir version: '3.8'
    - Definir red fixlife-network con driver bridge
    - Definir volumen nombrado mysql_data
    - _Requirements: 1.1, 1.4_
  
  - [ ] 6.2 Configurar servicio MySQL
    - Usar imagen mysql:8.0
    - Configurar variables de entorno: MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
    - Montar volumen mysql_data en /var/lib/mysql
    - Exponer puerto 3306:3306
    - Configurar healthcheck con mysqladmin ping, timeout 30s, interval 10s, retries 5
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 10.1, 10.5_
  
  - [ ] 6.3 Configurar servicio backend
    - Definir build context ./backend y dockerfile ../docker/Dockerfile.dev
    - Configurar depends_on mysql con condition: service_healthy
    - Configurar variables de entorno: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
    - Montar volumen ./backend:/app para hot reload
    - Exponer puerto 8000:8000
    - _Requirements: 1.3, 4.5, 4.6, 4.7, 10.2_
  
  - [ ] 6.4 Configurar servicio phpMyAdmin
    - Usar imagen phpmyadmin:latest
    - Configurar depends_on mysql con condition: service_healthy
    - Configurar variables de entorno: PMA_HOST=mysql, PMA_PORT=3306, PMA_ARBITRARY=1
    - Exponer puerto 8080:80
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 10.3_
  
  - [ ] 6.5 Preservar configuración del servicio frontend existente
    - Mantener configuración existente del frontend sin cambios
    - Asegurar que expone puerto 3000:3000
    - Asegurar que monta volumen para hot reload
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [ ] 7. Crear archivos de variables de entorno
  - Crear .env.example con valores de ejemplo para todas las variables
  - Incluir MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
  - Agregar comentarios explicativos en .env.example
  - Actualizar .gitignore para excluir .env
  - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [ ] 8. Crear documentación de Docker
  - Actualizar docker/README.md con información de los 4 servicios
  - Documentar comandos básicos: up, down, logs, rebuild
  - Documentar URLs de acceso: localhost:3000, localhost:8000, localhost:8080
  - Incluir sección de troubleshooting con problemas comunes
  - Documentar cómo ver logs de servicios individuales
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 9. Checkpoint - Verificar configuración completa
  - Verificar que todos los archivos de configuración existen
  - Verificar que la estructura de directorios es correcta
  - Revisar que no hay errores de sintaxis en archivos Python, YAML y Dockerfile
  - Asegurar que el usuario puede proceder con `docker-compose up`

## Notes

- Este plan crea solo la estructura base y configuración, sin lógica de negocio
- El frontend mantiene su configuración existente sin modificaciones
- Las vistas Django se entregan vacías, listas para implementar
- Todos los servicios soportan hot reload para desarrollo ágil
- La configuración es solo para desarrollo, no para producción
