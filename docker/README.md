# 🐳 Docker Setup - Fixlife

## 📦 Servicios

- **Frontend**: React + Vite + Tailwind (Puerto 3000 dev / Puerto 80 prod)

## 🚀 Comandos Rápidos

### Desarrollo

```bash
# Iniciar el frontend
docker-compose up

# Iniciar en background
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down

# Reconstruir contenedor
docker-compose up --build
```

### Producción

```bash
# Build y levantar en producción
docker-compose -f docker-compose.prod.yml up -d

# Reconstruir producción
docker-compose -f docker-compose.prod.yml up --build -d
```

## 🔧 Troubleshooting

### Puerto ocupado

```bash
netstat -ano | findstr :3000
```

### Limpiar todo y empezar de cero

```bash
docker-compose down -v
docker-compose down --rmi all
docker-compose up --build
```

### Ver contenedores activos

```bash
docker ps
```

## 📊 Estructura de Archivos

```
fixlife/
├── docker-compose.yml          # Dev compose
├── docker-compose.prod.yml     # Prod compose
├── .dockerignore               # Archivos ignorados
└── docker/
    ├── Dockerfile.dev          # Frontend dev (Vite HMR)
    ├── Dockerfile.prod         # Frontend prod (Nginx)
    └── README.md               # Esta guía
```

## 🌐 URLs

- **Desarrollo**: http://localhost:3000
- **Producción**: http://localhost:80

## 💡 Tips

1. **Hot Reload**: Los cambios en código se reflejan automáticamente en dev
2. **Logs**: Usa `docker-compose logs -f` para debugging
3. **Performance**: En Windows, considera usar WSL2 para mejor rendimiento
