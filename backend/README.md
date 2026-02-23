# Fixlife Backend

Backend Django para el proyecto Fixlife.

## Estructura

```
backend/
├── manage.py                    # Utilidad de línea de comandos de Django
├── requirements.txt             # Dependencias Python
└── fixlife_backend/
    ├── settings.py              # Configuración del proyecto
    ├── urls.py                  # Rutas URL
    ├── wsgi.py                  # Configuración WSGI
    ├── asgi.py                  # Configuración ASGI
    └── views/
        ├── login.py             # Vista de login (vacía, lista para implementar)
        └── register.py          # Vista de registro (vacía, lista para implementar)
```

## Estado Actual

Este es un proyecto Django base listo para desarrollo. Incluye:

- ✅ Estructura de proyecto Django configurada
- ✅ Configuración de base de datos MySQL
- ✅ Configuración CORS para desarrollo
- ✅ Vistas modulares organizadas (vacías, listas para implementar)
- ✅ Hot reload habilitado en Docker

## Próximos Pasos

1. Implementar lógica de negocio en las vistas
2. Crear modelos de base de datos
3. Definir endpoints de API
4. Agregar autenticación y autorización
5. Escribir tests

## Comandos Útiles

Todos los comandos deben ejecutarse desde el contenedor Docker:

```bash
# Crear migraciones
docker-compose exec backend python manage.py makemigrations

# Aplicar migraciones
docker-compose exec backend python manage.py migrate

# Crear superusuario
docker-compose exec backend python manage.py createsuperuser

# Shell de Django
docker-compose exec backend python manage.py shell

# Ejecutar tests
docker-compose exec backend python manage.py test
```

## Configuración

La configuración se gestiona mediante variables de entorno definidas en `.env`:

- `DB_HOST`: Host de MySQL (default: mysql)
- `DB_PORT`: Puerto de MySQL (default: 3306)
- `DB_NAME`: Nombre de la base de datos (default: fixlife_db)
- `DB_USER`: Usuario de MySQL (default: fixlife_user)
- `DB_PASSWORD`: Contraseña de MySQL (default: fixlife_pass_dev)

## Desarrollo

El servidor de desarrollo se ejecuta automáticamente en el contenedor Docker con hot reload habilitado. Los cambios en el código se reflejan automáticamente sin necesidad de reiniciar el contenedor.
