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

### Backups y Recuperación (PITR)

El proyecto corre backups diarios automáticos + binlog de MySQL, para poder
recuperar datos aunque ya se haya hecho `commit` (rollback por sí solo no
alcanza para eso — solo protege errores a mitad de una transacción).

**Cómo funciona:**
- Servicio `mysql-backup` (`docker-compose.yml` / `docker-compose.prod.yml`) hace un `mysqldump` completo todos los días a las 3am, comprimido, guardado en el volumen `mysql_backups` (dev) / `mysql_backups_prod` (prod) — separado del volumen de datos, así `docker-compose down -v` sobre `mysql_data` no se lleva los backups.
- El servicio `mysql` corre con binlog activado (`--log-bin`, formato `ROW`, retención 7 días) — permite reproducir cambios fila-por-fila desde el último dump hasta un instante exacto.
- El usuario `fixlife_backup` (creado en `docker/mysql-init.sh`) hace los dumps con privilegios de solo lectura, no con `root`.
- El backend tampoco usa `root` — se conecta con `fixlife_app`, un usuario acotado a la base `fixlife_db` (sin `GRANT ALL` global). Si el backend se compromete, no toma el servidor MySQL entero.
- Conexión backend↔MySQL cifrada (`DB_SSL=true` por defecto, usa el certificado autofirmado que MySQL 8 genera solo).

**Backup manual (sin esperar al cron de las 3am):**
```bash
docker-compose exec mysql-backup /backup.sh
docker-compose exec mysql-backup ls -la /backup
```

**Restaurar (dump completo, sin PITR):**
```bash
docker cp fixlife_mysql_backup:/backup/<archivo>.sql.gz ./backup.sql.gz
export MYSQL_ROOT_PASSWORD=<tu password>
./docker/restore.sh ./backup.sql.gz
```

**Restaurar hasta un momento exacto (PITR)** — útil si algo se borró por error y sabés más o menos cuándo:
```bash
export MYSQL_ROOT_PASSWORD=<tu password>
./docker/restore.sh ./backup.sql.gz "2026-07-15 14:32:00"
```
Esto restaura el último dump completo y reproduce el binlog hasta ese timestamp (no incluye el borrado si ocurrió después).

**Verificar que el binlog está activo:**
```bash
docker-compose exec mysql mysql -u root -p -e "SHOW VARIABLES LIKE 'log_bin'; SHOW BINARY LOGS;"
```

`docker/mysql-init.sh` ahora se monta tanto en dev como en prod y crea `root`, `fixlife_app` y `fixlife_backup` automáticamente la primera vez que se inicializa el volumen de MySQL — no hace falta ningún paso manual post-deploy. Si el volumen de prod ya existía antes de este cambio (init scripts solo corren en volumen nuevo), hay que crear los usuarios una vez a mano:
```bash
docker-compose -f docker-compose.prod.yml exec mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e \
  "CREATE USER IF NOT EXISTS 'fixlife_app'@'%' IDENTIFIED BY '${DB_PASSWORD}'; \
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, CREATE TEMPORARY TABLES ON \`${MYSQL_DATABASE:-fixlife_db}\`.* TO 'fixlife_app'@'%'; \
   CREATE USER IF NOT EXISTS 'fixlife_backup'@'%' IDENTIFIED BY '${BACKUP_DB_PASSWORD}'; \
   GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, RELOAD, REPLICATION CLIENT ON *.* TO 'fixlife_backup'@'%'; \
   FLUSH PRIVILEGES;"
```

**Recomendación adicional (no automatizada acá):** copiar periódicamente el volumen `mysql_backups_prod` a almacenamiento externo (otro disco, S3, etc.) para sobrevivir a la pérdida total del servidor, no solo del volumen de datos.
