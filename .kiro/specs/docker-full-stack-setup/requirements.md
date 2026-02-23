# Requirements Document

## Introduction

Este documento define los requisitos para configurar un entorno completo de desarrollo con Docker para el proyecto Fixlife. El objetivo es crear una infraestructura dockerizada que incluya frontend React (ya existente), backend Django (estructura base), base de datos MySQL y phpMyAdmin para gestión visual de la base de datos. Todo debe funcionar con un solo comando `docker-compose up` y soportar hot reload para desarrollo ágil.

## Glossary

- **Docker_Compose**: Herramienta para definir y ejecutar aplicaciones Docker multi-contenedor
- **Frontend_Service**: Servicio Docker que ejecuta la aplicación React + Vite + Tailwind
- **Backend_Service**: Servicio Docker que ejecuta la estructura base de Django
- **MySQL_Service**: Servicio Docker que ejecuta la base de datos MySQL
- **phpMyAdmin_Service**: Servicio Docker que proporciona interfaz web para gestionar MySQL
- **Hot_Reload**: Capacidad de reflejar cambios en código automáticamente sin reiniciar el contenedor
- **Django_Project**: Estructura base del framework Django sin lógica de negocio implementada
- **Modular_Views**: Organización de vistas Django en archivos separados por funcionalidad
- **Development_Environment**: Entorno configurado para desarrollo local con todas las herramientas necesarias

## Requirements

### Requirement 1: Configuración de Docker Compose Multi-Servicio

**User Story:** Como desarrollador, quiero un archivo docker-compose.yml que orqueste todos los servicios, para poder iniciar el entorno completo con un solo comando.

#### Acceptance Criteria

1. THE Docker_Compose SHALL definir exactamente 4 servicios: frontend, backend, mysql y phpmyadmin
2. WHEN el desarrollador ejecuta `docker-compose up`, THE Docker_Compose SHALL iniciar todos los servicios en el orden correcto
3. THE Docker_Compose SHALL configurar las dependencias entre servicios para que backend espere a mysql
4. THE Docker_Compose SHALL definir una red interna para comunicación entre servicios
5. THE Docker_Compose SHALL exponer los puertos necesarios al host: 3000 (frontend), 8000 (backend), 3306 (mysql), 8080 (phpmyadmin)

### Requirement 2: Servicio Frontend React

**User Story:** Como desarrollador frontend, quiero mantener la configuración Docker existente del frontend, para preservar la funcionalidad actual.

#### Acceptance Criteria

1. THE Frontend_Service SHALL mantener la configuración existente de React + Vite + Tailwind
2. THE Frontend_Service SHALL soportar hot reload para cambios en código
3. WHEN se modifica un archivo del frontend, THE Frontend_Service SHALL reflejar los cambios automáticamente sin reiniciar
4. THE Frontend_Service SHALL ser accesible en http://localhost:3000
5. THE Frontend_Service SHALL montar el código fuente como volumen para desarrollo

### Requirement 3: Estructura Base de Django

**User Story:** Como desarrollador backend, quiero una estructura Django vacía y lista para desarrollar, para poder empezar a implementar funcionalidades mañana.

#### Acceptance Criteria

1. THE Django_Project SHALL crear la estructura estándar de Django con manage.py y settings.py
2. THE Django_Project SHALL organizar las vistas en archivos separados dentro de un directorio views/
3. THE Django_Project SHALL incluir archivos vacíos para vistas modulares: views/login.py, views/register.py
4. THE Django_Project SHALL configurar settings.py para conectarse a MySQL_Service
5. THE Django_Project SHALL incluir requirements.txt con las dependencias mínimas: Django, mysqlclient, django-cors-headers
6. THE Django_Project SHALL NO incluir modelos, lógica de negocio ni implementaciones funcionales

### Requirement 4: Servicio Backend Django

**User Story:** Como desarrollador backend, quiero un contenedor Docker que ejecute Django con hot reload, para desarrollar eficientemente.

#### Acceptance Criteria

1. THE Backend_Service SHALL usar una imagen base de Python 3.11 o superior
2. THE Backend_Service SHALL instalar todas las dependencias desde requirements.txt
3. THE Backend_Service SHALL ejecutar el servidor de desarrollo de Django en modo debug
4. WHEN se modifica un archivo Python, THE Backend_Service SHALL recargar automáticamente el servidor
5. THE Backend_Service SHALL ser accesible en http://localhost:8000
6. THE Backend_Service SHALL montar el código backend como volumen para desarrollo
7. THE Backend_Service SHALL esperar a que MySQL_Service esté listo antes de iniciar

### Requirement 5: Servicio MySQL

**User Story:** Como desarrollador, quiero una base de datos MySQL en contenedor, para almacenar los datos de la aplicación.

#### Acceptance Criteria

1. THE MySQL_Service SHALL usar la imagen oficial de MySQL 8.0
2. THE MySQL_Service SHALL crear una base de datos llamada "fixlife_db" al iniciar
3. THE MySQL_Service SHALL configurar credenciales mediante variables de entorno: MYSQL_ROOT_PASSWORD, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
4. THE MySQL_Service SHALL persistir los datos en un volumen Docker nombrado
5. THE MySQL_Service SHALL exponer el puerto 3306 para conexiones desde otros servicios
6. THE MySQL_Service SHALL estar accesible desde Backend_Service usando el nombre del servicio como hostname

### Requirement 6: Servicio phpMyAdmin

**User Story:** Como desarrollador, quiero una interfaz web para gestionar la base de datos, para visualizar y manipular datos fácilmente durante el desarrollo.

#### Acceptance Criteria

1. THE phpMyAdmin_Service SHALL usar la imagen oficial de phpMyAdmin optimizada para recursos
2. THE phpMyAdmin_Service SHALL conectarse automáticamente a MySQL_Service
3. THE phpMyAdmin_Service SHALL ser accesible en http://localhost:8080
4. THE phpMyAdmin_Service SHALL permitir login con las credenciales configuradas en MySQL_Service
5. THE phpMyAdmin_Service SHALL depender de MySQL_Service y esperar a que esté listo

### Requirement 7: Configuración de Variables de Entorno

**User Story:** Como desarrollador, quiero gestionar configuraciones sensibles mediante variables de entorno, para mantener la seguridad y flexibilidad.

#### Acceptance Criteria

1. THE Docker_Compose SHALL soportar un archivo .env para variables de entorno
2. THE Docker_Compose SHALL definir variables por defecto para desarrollo: nombres de base de datos, usuarios, contraseñas
3. THE Backend_Service SHALL leer las credenciales de MySQL desde variables de entorno
4. THE Docker_Compose SHALL incluir un archivo .env.example con valores de ejemplo
5. THE Docker_Compose SHALL NO incluir el archivo .env en el control de versiones

### Requirement 8: Dockerfiles para Backend

**User Story:** Como desarrollador, quiero Dockerfiles optimizados para el backend, para builds rápidos y eficientes.

#### Acceptance Criteria

1. THE Backend_Service SHALL tener un Dockerfile.dev en el directorio docker/
2. THE Dockerfile.dev SHALL usar multi-stage builds si es posible para optimizar tamaño
3. THE Dockerfile.dev SHALL copiar requirements.txt primero para aprovechar caché de Docker
4. THE Dockerfile.dev SHALL instalar dependencias del sistema necesarias para mysqlclient
5. THE Dockerfile.dev SHALL configurar el directorio de trabajo en /app

### Requirement 9: Documentación de Docker

**User Story:** Como desarrollador nuevo en el proyecto, quiero documentación clara de cómo usar Docker, para empezar a trabajar rápidamente.

#### Acceptance Criteria

1. THE Docker_Compose SHALL actualizar el archivo docker/README.md con información de los 4 servicios
2. THE Docker_Compose SHALL documentar los comandos básicos: up, down, logs, rebuild
3. THE Docker_Compose SHALL documentar las URLs de acceso a cada servicio
4. THE Docker_Compose SHALL incluir sección de troubleshooting común
5. THE Docker_Compose SHALL documentar cómo acceder a los logs de cada servicio individual

### Requirement 10: Healthchecks y Dependencias

**User Story:** Como desarrollador, quiero que los servicios inicien en el orden correcto, para evitar errores de conexión durante el startup.

#### Acceptance Criteria

1. THE MySQL_Service SHALL incluir un healthcheck que verifique que el servidor está listo
2. THE Backend_Service SHALL depender de MySQL_Service y esperar su healthcheck
3. THE phpMyAdmin_Service SHALL depender de MySQL_Service y esperar su healthcheck
4. WHEN MySQL_Service no está listo, THE Backend_Service SHALL esperar antes de intentar conectarse
5. THE Docker_Compose SHALL configurar timeouts razonables para los healthchecks (30 segundos máximo)

### Requirement 11: Estructura de Directorios del Backend

**User Story:** Como desarrollador backend, quiero una estructura de directorios clara y modular, para organizar el código eficientemente desde el inicio.

#### Acceptance Criteria

1. THE Django_Project SHALL crear un directorio backend/ en la raíz del proyecto
2. THE Django_Project SHALL crear la estructura: backend/fixlife_backend/ para el proyecto Django
3. THE Django_Project SHALL crear backend/fixlife_backend/views/ para las vistas modulares
4. THE Django_Project SHALL crear archivos __init__.py en todos los paquetes Python
5. THE Django_Project SHALL incluir un archivo .gitkeep en directorios vacíos para mantenerlos en git

### Requirement 12: Configuración CORS para Desarrollo

**User Story:** Como desarrollador fullstack, quiero que el backend acepte peticiones del frontend en desarrollo, para poder probar la integración localmente.

#### Acceptance Criteria

1. THE Django_Project SHALL incluir django-cors-headers en requirements.txt
2. THE Django_Project SHALL configurar CORS en settings.py para permitir localhost:3000
3. THE Django_Project SHALL configurar ALLOWED_HOSTS para incluir localhost y 0.0.0.0
4. THE Django_Project SHALL habilitar CORS solo para entorno de desarrollo
5. THE Django_Project SHALL incluir comentarios en settings.py explicando la configuración CORS
