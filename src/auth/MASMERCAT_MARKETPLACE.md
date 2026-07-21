# MasMercat Marketplace

MasMercat es el nombre de la plataforma. Su mercado inicial está orientado a
productores, compradores y forwarders de los países del Mercosur, sin incorporar
el nombre de la región a la marca.

Esta entrega añade perfiles comerciales sin cambiar los roles históricos de usuario.
Un usuario autenticado puede crear un único perfil como `producer`, `buyer` o
`forwarder`.

## Confianza y certificados

Los niveles previstos son `registered`, `identity_verified`, `company_verified`,
`certified_producer` y `trusted_supplier`. En esta primera versión, un productor
pasa automáticamente a `certified_producer` cuando un administrador aprueba al
menos un certificado vigente. Los niveles superiores que dependan de identidad,
empresa e historial se completarán con el flujo administrativo.

Los documentos y notas de revisión nunca se incluyen en el listado público. El
perfil propietario sí puede consultar toda la información de sus certificados.
Los identificadores fiscales y los estados internos de verificación tampoco se
exponen en perfiles públicos ni en anuncios de forwarders.

## Endpoints

- `GET /marketplace/profiles?accountType=producer`: directorio público.
- `POST /marketplace/profile`: crea el perfil del usuario autenticado.
- `GET /marketplace/profile`: devuelve el perfil propio y sus certificados.
- `POST /marketplace/certificates`: presenta un certificado para revisión.
- `POST /marketplace/certificates/:id/review`: aprobación o rechazo por admin.
- `GET /marketplace/admin/certificates?status=pending`: cola documental para admin.
- `GET /marketplace/admin/profiles`: perfiles comerciales completos para admin.
- `GET /marketplace/forwarder-services?country=Argentina`: servicios públicos.
- `POST /marketplace/forwarder-services`: publica un servicio desde un perfil forwarder.
- `POST /marketplace/trade-requests`: crea una solicitud y oferta inicial de compra.
- `POST /marketplace/trade-requests/:id/offers`: envía oferta o contraoferta.
- `POST /marketplace/trade-offers/:id/accept`: acepta y reserva el lote durante 48 horas.
- `GET /marketplace/trades/mine`: negociaciones y pedidos del usuario.
- `POST /marketplace/orders/:id/confirm`: confirmación del stock por el productor.
- `POST /marketplace/orders/:id/cancel`: cancelación y liberación del lote.
- `POST /marketplace/orders/:id/complete`: recepción confirmada por el comprador.
- `POST /marketplace/freight-requests`: solicita propuestas para un pedido.
- `GET /marketplace/freight-requests/open`: oportunidades visibles para forwarders.
- `POST /marketplace/freight-requests/:id/quotes`: cotización de un forwarder.
- `POST /marketplace/freight-quotes/:id/select`: selección por el comprador.

Las categorías iniciales cubren transporte terrestre, marítimo y aéreo, cadena
de frío, aduanas, almacenamiento y seguro de carga. MasMercat funciona como
directorio y punto de contacto: no ejecuta ni garantiza la operación logística.

Ejemplo de perfil:

```json
{
  "accountType": "producer",
  "legalName": "Frutas del Litoral SA",
  "taxId": "AR-30-12345678-9",
  "country": "Argentina",
  "region": "Entre Ríos",
  "website": "https://example.com",
  "description": "Productor y exportador de cítricos"
}
```

Ejemplo de certificado:

```json
{
  "name": "GlobalG.A.P.",
  "issuer": "GLOBALG.A.P.",
  "certificateNumber": "GGN-123456789",
  "issuedAt": "2026-01-01",
  "expiresAt": "2027-01-01",
  "documentUrl": "https://storage.example.com/private/document.pdf"
}
```

La entidad `Language` existente ya contiene `es`, `pt`, `en` y `fr`, por lo que
la API conserva soporte estructural para los cuatro idiomas solicitados.

## Compra y reserva de stock

Solo un perfil `buyer` puede iniciar una solicitud. Comprador y productor pueden
intercambiar ofertas con cantidad, precio unitario, moneda y fecha de validez.
Cuando la otra parte acepta, MasMercat bloquea el lote dentro de una transacción,
rechaza las demás ofertas y crea un pedido con el precio acordado. Esta primera
versión reserva el lote completo para evitar sobreventa; la reserva parcial será
una ampliación posterior del modelo de inventario.

La oferta aceptada genera una reserva de 48 horas. El productor debe confirmarla
antes del vencimiento. Si vence, la consulta de operaciones libera el lote de
forma transaccional. Comprador o productor pueden cancelar una operación abierta;
el lote vuelve a estar disponible. Solo el comprador puede marcar como completado
un pedido confirmado, momento en que el lote pasa definitivamente a vendido.

## Forwarders independientes

El comprador puede publicar una necesidad de transporte después de crear el
pedido. Los forwarders registrados consultan las solicitudes y presentan precio,
moneda, plazo y condiciones. El comprador selecciona una propuesta, pero el
servicio se contrata entre las empresas: MasMercat no planifica rutas, transporta
la mercancía ni garantiza la ejecución logística.
