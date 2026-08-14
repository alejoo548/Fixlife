# Manual de instalacion de Fixlife

Este documento explica, paso a paso, como instalar y correr el proyecto Fixlife en una computadora nueva, tanto en Windows como en Linux. Esta escrito para alguien que recibe el proyecto por primera vez (por ejemplo copiado en una memoria USB) y no tiene el entorno configurado todavia.

El proyecto tiene tres partes:

- Frontend: aplicacion web (React + Vite + TypeScript).
- Backend: servidor de la API (Node.js + Express + TypeScript).
- Base de datos: MySQL 8.

Existen dos formas de instalarlo: con Docker (recomendada, mas simple, funciona igual en Windows y Linux) o de forma manual instalando Node.js y MySQL directamente en la computadora. Se explican ambas.

---

## 1. Requisitos previos

### 1.1 Comunes a ambas formas de instalacion

- Una copia del proyecto (la carpeta completa "Fixlife", ya sea clonada con git o copiada desde una memoria USB/disco externo).
- Conexion a internet la primera vez, para descargar dependencias e imagenes de Docker.
- Un editor de texto o codigo (opcional, por ejemplo Visual Studio Code) si se necesita revisar o modificar archivos de configuracion.

### 1.2 Si se va a instalar con Docker (recomendado)

- Windows: instalar "Docker Desktop". Requiere Windows 10/11 de 64 bits con WSL2 habilitado. Docker Desktop lo instala automaticamente si no esta activado, puede pedir reiniciar la computadora.
- Linux: instalar "Docker Engine" y el plugin "docker compose". En distribuciones basadas en Debian/Ubuntu se puede instalar con el script oficial de Docker o con el gestor de paquetes de la distribucion.

Para confirmar que Docker quedo instalado correctamente, abrir una terminal (en Windows puede ser PowerShell o la terminal de Docker Desktop; en Linux, cualquier terminal) y ejecutar:

```
docker --version
docker compose version
```

Ambos comandos deben mostrar un numero de version, sin errores.

### 1.3 Si se va a instalar de forma manual (sin Docker)

- Node.js version 20 o superior (incluye npm). Descargar desde nodejs.org, version LTS.
- MySQL Server version 8. Se puede instalar el instalador oficial de MySQL (Windows) o el paquete del gestor de paquetes de la distribucion (Linux).
- Git (opcional, solo si se va a clonar el repositorio en vez de copiar la carpeta).

Para confirmar que Node quedo instalado, ejecutar:

```
node --version
npm --version
```

Debe mostrar version 20.x o mayor.

---

## 2. Obtener el proyecto

### Opcion A: clonar con git

```
git clone <URL_DEL_REPOSITORIO>
cd Fixlife
```

### Opcion B: copiar la carpeta directamente

Si el proyecto se recibio copiado (por ejemplo desde una memoria USB), simplemente pegar la carpeta "Fixlife" completa en el disco de la computadora nueva (por ejemplo en "Documentos" en Windows, o en el directorio personal en Linux) y abrir una terminal dentro de esa carpeta.

Importante: si la carpeta incluye una subcarpeta llamada "node_modules" o "backend/node_modules", se pueden borrar antes de instalar, ya que se van a volver a generar y pueden pesar varios cientos de megabytes sin necesidad de copiarse.

---

## 3. Configurar las variables de entorno

El proyecto usa un archivo llamado ".env" en la raiz del proyecto para guardar configuracion sensible (contraseñas, claves, URLs). Este archivo nunca se sube al repositorio por seguridad, asi que hay que crearlo manualmente a partir de la plantilla incluida.

### Windows (PowerShell)

```
copy .env.example .env
```

### Linux

```
cp .env.example .env
```

Despues de copiarlo, abrir el archivo ".env" con un editor de texto y revisar/completar al menos estos valores:

- `MYSQL_ROOT_PASSWORD`: contraseña del usuario root de MySQL. Poner cualquier contraseña larga.
- `MYSQL_DATABASE`: nombre de la base de datos. Se puede dejar el valor por defecto (`fixlife_db`).
- `MYSQL_USER` y `MYSQL_PASSWORD`: usuario y contraseña que se creara para MySQL.
- `DB_USER` y `DB_PASSWORD`: usuario y contraseña que usara el backend para conectarse a MySQL. Deben coincidir con lo que se configure en la base de datos.
- `JWT_SECRET`: una cadena de texto larga y aleatoria, usada para firmar las sesiones de los usuarios. No dejar el valor de ejemplo. Se puede generar una facilmente ejecutando en la terminal:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copiar el resultado y pegarlo como valor de `JWT_SECRET`.

El resto de variables (PayPal, Wompi, Google, correo, notificaciones push, etc.) son opcionales para levantar el proyecto en modo de prueba local. Se pueden dejar vacias; esas funciones especificas simplemente no van a funcionar hasta que se configuren, pero el resto de la aplicacion si va a correr con normalidad.

Si se va a instalar con Docker, no es necesario tocar nada mas en este paso: Docker arma la base de datos automaticamente usando estos valores.

---

## 4. Instalacion con Docker (recomendada)

Este metodo levanta automaticamente el frontend, el backend y la base de datos MySQL, sin necesidad de instalar Node ni MySQL por separado.

Desde la raiz del proyecto (donde esta el archivo `docker-compose.yml`), ejecutar:

### Windows (PowerShell) y Linux (el comando es identico)

```
docker compose up -d --build
```

Este comando puede tardar varios minutos la primera vez, porque descarga las imagenes base y construye el proyecto. Las siguientes veces sera mucho mas rapido.

Cuando termine, el proyecto va a quedar disponible en:

- Frontend (la pagina web): `http://localhost:3000`
- Backend (la API): `http://localhost:8000`
- phpMyAdmin (administrador visual de la base de datos): `http://localhost:8080`
- MySQL (para conectarse con un cliente externo si se necesita): `localhost:3307`

Para confirmar que todos los servicios estan corriendo:

```
docker compose ps
```

Debe mostrar varios contenedores con estado "Up" o "running" (frontend, backend, mysql, entre otros).

### Ver los registros (logs) de un servicio

Si algo no funciona, revisar los logs del backend o del frontend:

```
docker compose logs backend
docker compose logs frontend
```

Agregar `-f` al final para ver los logs en tiempo real (por ejemplo `docker compose logs -f backend`), y presionar Ctrl+C para salir.

### Detener el proyecto

```
docker compose down
```

Esto detiene y elimina los contenedores, pero conserva los datos de la base de datos (guardados en un volumen de Docker) y los archivos subidos.

### Volver a levantarlo despues de detenerlo

```
docker compose up -d
```

(No hace falta `--build` de nuevo, a menos que se hayan modificado archivos del proyecto).

---

## 5. Instalacion manual (sin Docker)

Este metodo es mas largo, mas manual, pero util si no se quiere o no se puede usar Docker en esa computadora.

### 5.1 Instalar y configurar MySQL

1. Instalar MySQL Server 8 (Windows: instalador oficial de MySQL; Linux: paquete `mysql-server` o `mariadb-server` segun la distribucion).
2. Crear la base de datos y el usuario que va a usar el backend. Abrir una terminal de MySQL (o usar phpMyAdmin/MySQL Workbench si se prefiere una interfaz grafica) y ejecutar:

```sql
CREATE DATABASE fixlife_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fixlife_app'@'%' IDENTIFIED BY 'una_contraseña_segura';
GRANT ALL PRIVILEGES ON fixlife_db.* TO 'fixlife_app'@'%';
FLUSH PRIVILEGES;
```

3. Cargar la estructura inicial de la base de datos usando el archivo incluido en el proyecto (`docker/fixlife_db.sql`):

Windows (PowerShell, ajustar la ruta de mysql.exe si no esta en el PATH):

```
mysql -u fixlife_app -p fixlife_db < docker\fixlife_db.sql
```

Linux:

```
mysql -u fixlife_app -p fixlife_db < docker/fixlife_db.sql
```

4. En el archivo `.env`, ajustar:

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=fixlife_app
DB_PASSWORD=una_contraseña_segura
DB_NAME=fixlife_db
DB_SSL=false
```

(El valor `DB_HOST=mysql` que trae la plantilla por defecto es el nombre del servicio dentro de Docker; si MySQL corre directamente en la computadora, debe ser `127.0.0.1`).

### 5.2 Instalar dependencias e iniciar el backend

Desde la raiz del proyecto:

```
cd backend
npm install
```

Copiar tambien el archivo `.env` a la carpeta `backend` si el backend no encuentra las variables (en la mayoria de los casos, con el `.env` en la raiz del proyecto es suficiente, ya que el backend lo carga desde ahi).

Iniciar el backend en modo desarrollo:

```
npm run dev
```

El backend debe quedar escuchando en `http://localhost:8000`. Dejar esta terminal abierta y corriendo.

### 5.3 Instalar dependencias e iniciar el frontend

Abrir una segunda terminal, ir a la raiz del proyecto (no a la carpeta `backend`) y ejecutar:

```
npm install
npm run dev
```

El frontend debe quedar disponible en `http://localhost:5173` (puerto por defecto de Vite en modo desarrollo).

En el archivo `.env`, revisar que la variable `VITE_API_URL` apunte al backend local:

```
VITE_API_URL=http://127.0.0.1:8000/api
```

Si se modifica esta variable con el frontend ya corriendo, hay que detenerlo (Ctrl+C en su terminal) y volver a ejecutar `npm run dev` para que tome el cambio.

### 5.4 Detener el proyecto en modo manual

En cada terminal donde este corriendo el backend o el frontend, presionar Ctrl+C.

---

## 6. Verificar que todo funciona

Con el proyecto ya levantado (por cualquiera de los dos metodos), abrir un navegador web y visitar:

- Con Docker: `http://localhost:3000`
- Sin Docker (manual): `http://localhost:5173`

Debe cargar la pagina principal de Fixlife. Se puede probar creando una cuenta de cliente nueva desde la propia pagina para confirmar que el registro y el login funcionan correctamente contra la base de datos local.

Tambien se puede probar el backend directamente visitando:

```
http://localhost:8000/api/services
```

Debe devolver una respuesta en formato JSON con la lista de servicios (aunque este vacia o con datos de ejemplo la primera vez).

---

## 7. Problemas comunes

### "docker: command not found" o "docker no se reconoce como un comando"

Docker no quedo instalado correctamente o no se reinicio la terminal despues de instalarlo. Cerrar y volver a abrir la terminal, o reiniciar la computadora, y volver a intentar.

### El backend no logra conectarse a MySQL ("Access denied" o "ECONNREFUSED")

Revisar que los valores de `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` en el archivo `.env` coincidan exactamente con el usuario y la base de datos creados en MySQL. Si se esta usando Docker, `DB_HOST` debe quedar como `mysql` (nombre del servicio), no como `localhost` ni `127.0.0.1`.

### La pagina carga pero no puede iniciar sesion ni cargar datos

Revisar que el backend este corriendo (ver logs) y que la variable `VITE_API_URL` del frontend apunte al backend correcto. Si se accede desde otro dispositivo en la misma red (por ejemplo un celular) en vez de la misma computadora, hay que usar la direccion IP de la computadora en vez de `localhost`.

### Los puertos ya estan en uso ("port is already allocated")

Significa que algo mas en la computadora ya esta usando ese puerto (3000, 8000, 3307, 8080). Cerrar el otro programa, o cambiar el puerto en el archivo `docker-compose.yml` (por ejemplo cambiar `"3000:80"` por `"3001:80"` para usar el puerto 3001 en vez de 3000).

### Las imagenes o documentos subidos no se ven

En instalacion con Docker, los archivos subidos se guardan en un volumen de Docker que persiste entre reinicios, siempre que no se borre explicitamente el volumen. En instalacion manual, se guardan en la carpeta `backend/uploads`; confirmar que esa carpeta exista y tenga permisos de escritura.

---

## 8. Resumen rapido (para quien ya tiene experiencia)

```
cp .env.example .env
# editar .env: JWT_SECRET, contraseñas de MySQL
docker compose up -d --build
# abrir http://localhost:3000
```

En Windows, reemplazar `cp` por `copy` en PowerShell. El resto de los comandos son identicos en Windows y Linux al usar Docker.
