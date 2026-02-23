-- Crear usuario root con acceso desde cualquier host
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY 'Info2026/*-';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;

-- Asegurar que root@localhost también tenga la contraseña correcta
ALTER USER 'root'@'localhost' IDENTIFIED BY 'Info2026/*-';

FLUSH PRIVILEGES;
