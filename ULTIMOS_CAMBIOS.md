# Últimos cambios subidos

## Resumen general
Se realizó una refactorización importante del flujo de solicitud de servicio en el cliente, enfocada en separar responsabilidades, mejorar mantenibilidad y elevar la experiencia visual/táctil en desktop y mobile.

## Cambios principales

### 1) Refactorización del `ServiceRequestWizard`
- Se redujo el componente principal y se extrajeron varias secciones a componentes dedicados.
- Se organizó el flujo por bloques claros: selección de servicio, ubicación, problema/presupuesto, historial, tracker y panel.

Nuevos componentes creados:
- `src/components/modals/ServiceRequestServiceStep.tsx`
- `src/components/modals/ServiceRequestDetailsHeader.tsx`
- `src/components/modals/ServiceRequestLocationSection.tsx`
- `src/components/modals/ServiceRequestProblemSection.tsx`
- `src/components/modals/ServiceRequestHistorySection.tsx`
- `src/components/modals/ServiceRequestAssignedWorkerCard.tsx`
- `src/components/modals/ServiceRequestMapOverlays.tsx`
- `src/components/modals/ServiceRequestPanelShell.tsx`
- `src/components/modals/ServiceRequestPaymentModal.tsx`
- `src/components/modals/ServiceRequestFixesSuccessModal.tsx`
- `src/components/modals/serviceRequestHelpers.tsx`

### 2) Mejoras de UX/UI en solicitudes
- Se mejoró el layout tipo “sheet” para mobile/desktop.
- Se añadieron overlays de mapa para estado, resumen de reserva y seguimiento activo.
- Se reforzó la tarjeta de trabajador asignado con acciones claras (aprobar/declinar/ver perfil).
- Se mejoró la sección de historial con filtro de estado y banner de servicio activo.
- Se optimizó la entrada de ubicación (detección, guardado y reutilización de lugares).

### 3) Flujo de pagos y cierre
- Se creó un modal de pago más completo con:
  - Selector de método (`card` / `paypal` visible como “próximamente”).
  - Formulario de pago demo para tarjeta.
  - Resumen claro de monto y solicitud.
- Se añadió modal de confirmación de reseña/fixes al finalizar.

### 4) Lógica reutilizable y responsiva
- Se movió lógica transversal a helpers:
  - badges/labels de estado
  - reglas de timeline
  - validaciones de chat y contraoferta
- Nuevo hook:
  - `src/hooks/useResponsiveSheet.ts` para manejar comportamiento responsivo del panel.

### 5) Ajustes adicionales
Archivos modificados con mejoras puntuales:
- `src/components/dashboard/RequestsView.tsx`
- `src/components/modals/AuthModal.tsx`
- `src/components/modals/ClientLiveRequestTracker.tsx`
- `src/components/modals/ServiceRequestWizard.tsx`

---

## Impacto esperado
- Código más modular, fácil de mantener y escalar.
- Mejor experiencia de usuario durante todo el ciclo de solicitud (crear, seguir, pagar y cerrar).
- Base más limpia para iterar nuevas features sin crecer un único componente monolítico.
