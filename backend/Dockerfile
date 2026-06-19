# Usar imagen oficial de Node.js
FROM node:20-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Instalar nodemon globalmente para el entorno de desarrollo
RUN npm install -g nodemon ts-node typescript

# Copiar el resto del código
COPY . .

# Crear usuario sin privilegios y ceder propiedad del directorio
RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app

USER app

# Exponer el puerto
EXPOSE 8000

# Iniciar la aplicación
CMD ["npm", "run", "dev"]