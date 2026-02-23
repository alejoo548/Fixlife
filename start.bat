@echo off
echo 🚀 Iniciando Fixlife Full Stack...
echo.
echo 📦 Servicios que se iniciarán:
echo   - Frontend (React): http://localhost:3000
echo   - Backend (Django): http://localhost:8000
echo   - MySQL: localhost:3306
echo   - phpMyAdmin: http://localhost:8080
echo.

REM Verificar si existe .env
if not exist .env (
    echo ⚠️  No se encontró .env, copiando desde .env.example...
    copy .env.example .env
    echo ✅ Archivo .env creado
)

echo 🐳 Iniciando Docker Compose...
docker-compose up --build
