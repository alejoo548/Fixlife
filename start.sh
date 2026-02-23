#!/bin/bash

echo "🚀 Iniciando Fixlife Full Stack..."
echo ""
echo "📦 Servicios que se iniciarán:"
echo "  - Frontend (React): http://localhost:3000"
echo "  - Backend (Django): http://localhost:8000"
echo "  - MySQL: localhost:3306"
echo "  - phpMyAdmin: http://localhost:8080"
echo ""

# Verificar si existe .env
if [ ! -f .env ]; then
    echo "⚠️  No se encontró .env, copiando desde .env.example..."
    cp .env.example .env
    echo "✅ Archivo .env creado"
fi

echo "🐳 Iniciando Docker Compose..."
docker-compose up --build
