# FixLife Zod — Sistema de Seguridad Modular

## ¿Qué es?

**FixLife Zod** es el sistema de validación y seguridad del backend de FixLife. Reemplaza las validaciones manuales dispersas por un pipeline modular, tipado y reutilizable construido sobre [Zod](https://zod.dev/), combinado con correcciones estructurales de seguridad en toda la API.

---

## Arquitectura

```
backend/src/
├── schemas/                        ← Schemas de validación Zod
│   ├── auth.schema.ts              (registro, login, OTP, reset password)
│   ├── worker.schema.ts            (settings, password, email change)
│   └── admin.schema.ts             (services, service cards, hero slides)
│
├── middlewares/
│   └── validate.middleware.ts      ← Wrapper genérico: validate(schema)
│
└── routes/
    ├── auth.routes.ts              → usa validate(AuthSchema.xxx)
    ├── worker.routes.ts            → usa validate(WorkerSchema.xxx)
    └── admin.routes.ts             → usa validate(AdminSchema.xxx)
```

---

## Cómo funciona

Cualquier ruta que reciba datos del cliente pasa por el middleware `validate()`:

```ts
// Antes (manual, ~257 líneas)
router.post('/login', authLimiter, validateEmailAndPassword, login);

// Después (FixLife Zod)
router.post('/login', authLimiter, validate(AuthSchema.login), login);
```

El middleware es genérico y reutilizable para cualquier ruta:

```ts
export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      res.status(400).json({ error: firstIssue?.message ?? 'Invalid request data.' });
      return;
    }
    req.body = result.data;
    next();
  };
```

---

## Qué protege

| Amenaza | Solución |
|---|---|
| Inputs malformados | Zod rechaza y responde 400 antes de llegar al controlador |
| SQL Injection | Zod + queries parametrizadas en el ORM |
| XSS en campos de texto | Regex estrictos en schemas (`safeTextRegex`) |
| Datos fuera de rango | Longitudes y formatos validados en schema |
| Tipos incorrectos | Zod valida tipos estrictamente (TypeScript en runtime) |
| CORS abierto | Restringido a orígenes en `ALLOWED_ORIGINS` (.env) |
| JWT sin configurar | `process.exit(1)` si `JWT_SECRET` no está en producción |
| Archivos sensibles expuestos | `/uploads` protegido con `verifyToken` |

---

## Configuración requerida

Agregar estas variables al archivo `.env` del backend:

```env
# Orígenes permitidos para CORS (separados por coma)
ALLOWED_ORIGINS=https://tu-dominio.com

# Secret para JWT (cadena larga y aleatoria)
JWT_SECRET=tu_secret_aqui
```

> En producción, si `JWT_SECRET` no está configurado el servidor **no arrancará**.

---

## Schemas disponibles

### `AuthSchema`
| Schema | Ruta |
|---|---|
| `login` | `POST /api/auth/login` |
| `registerWorker` | `POST /api/auth/register/worker` |
| `registerUser` | `POST /api/auth/register-user` |
| `verifyEmail` | `POST /api/auth/verify-worker-email` |
| `emailOnly` | `POST /api/auth/resend-otp`, `forgot-password` |
| `resetPassword` | `POST /api/auth/reset-password` |
| `verifyResetToken` | `POST /api/auth/verify-reset-token` |

### `WorkerSchema`
| Schema | Ruta |
|---|---|
| `settings` | `PUT /api/worker/settings` |
| `changePassword` | `PUT /api/worker/change-password` |
| `emailChangeRequest` | `POST /api/worker/email-change/request` |
| `tokenOnly` | `POST /api/worker/email-change/verify` |

### `AdminSchema`
| Schema | Ruta |
|---|---|
| `createService` | `POST /api/admin/services` |
| `updateService` | `PUT /api/admin/services/:id` |
| `createServiceCard` | `POST /api/admin/service-cards` |
| `updateServiceCard` | `PUT /api/admin/service-cards/:id` |
| `heroSlides` | `PUT /api/admin/hero-slides` |

---

## Pendiente (próximas iteraciones)

- [ ] Agregar schema Zod a `PUT /api/auth/profile` (updateProfile)
- [ ] Agregar schema Zod a `POST /api/worker/requests/:id/counter-offer`
- [ ] Agregar schema Zod a `PUT /api/worker/presence`
- [ ] Implementar audit log de acciones críticas

---

## Rama

Este sistema fue implementado en la rama `fixlife-zod` y está listo para merge a `main`.
