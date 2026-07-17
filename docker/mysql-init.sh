#!/bin/sh
# Corre una sola vez, en la primera inicialización del volumen de MySQL
# (docker-entrypoint-initdb.d). A diferencia de un .sql estático, este script
# sí puede leer variables de entorno reales — así ninguna password queda
# hardcodeada y versionada en git.
set -eu

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD no definida}"
: "${DB_USER:?DB_USER no definida}"
: "${DB_PASSWORD:?DB_PASSWORD no definida}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE no definida}"

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-SQL
	-- root@% con acceso amplio: solo para administración manual (phpMyAdmin, CLI).
	CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';
	GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
	ALTER USER 'root'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';

	-- Usuario de aplicación: privilegios acotados a la base de datos de la app,
	-- sin GRANT OPTION ni acceso a otras bases. Esto es lo que usa el backend
	-- (DB_USER/DB_PASSWORD), en vez de root, para que un backend comprometido
	-- no pueda tomar el servidor MySQL entero.
	CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
	GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, CREATE TEMPORARY TABLES
	  ON \`${MYSQL_DATABASE}\`.* TO '${DB_USER}'@'%';

	-- Usuario de solo lectura para mysqldump/PITR (ver docker/backup.sh).
	CREATE USER IF NOT EXISTS 'fixlife_backup'@'%' IDENTIFIED BY '${BACKUP_DB_PASSWORD:-${DB_PASSWORD}}';
	GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER, RELOAD, REPLICATION CLIENT
	  ON *.* TO 'fixlife_backup'@'%';

	FLUSH PRIVILEGES;
SQL
