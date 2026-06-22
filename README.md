# PaTavo — Microservicios

La misma aplicación de mesas de **D&D** que el monolito `api/`, pero descompuesta
en servicios independientes que se comunican por HTTP/JSON y un **API Gateway**.
El front-end (PWA) es servido por **Nginx**.

## Arquitectura

```
Navegador (PWA)
      │  http://localhost:8080
      ▼
┌─────────────┐  /            (estáticos: gateway/public)
│   Nginx     │  /api/*       ──► proxy ─┐
│  (puerto 80)│  /socket.io/* ──► proxy ─┤ (WebSocket)
└─────────────┘                         │
                                        ▼
                              ┌───────────────────┐
                              │  gateway  :8080    │  (interno)
                              │  proxy + /api/sync │
                              └───┬─────┬─────┬────┘
              /api/auth,characters,│     │dm   │dungeon + socket.io
                        parties    │     │     │
                                   ▼     ▼     ▼
                         ┌──────────┐ ┌──────┐ ┌───────────┐
                         │   user   │ │  dm  │ │  dungeon  │
                         │ :4001    │ │:4002 │ │  :4003    │
                         └────┬─────┘ └──┬───┘ └─────┬─────┘
                              │          │           │
                              ▼          ▼           ▼
                         user_db      dm_db      dungeon_db   (un PostgreSQL,
                         └──────────────────────────────┘     una BD por servicio)
```

- **Nginx** (`WEB_PORT`, def. **8080**): sirve el front y proxya API + WebSockets al gateway.
- **gateway**: enruta cada prefijo al servicio correcto y **compone** `/api/sync`
  (agrega/reparte datos de `user` y `dm` en una sola llamada).
- **user-service**: usuarios, mesas, personajes, inventario. Es la **autoridad**:
  expone `/api/parties/:id/access` que consultan los demás servicios.
- **dm-service**: historias, grimorio, bestiario.
- **dungeon-service**: salas en tiempo real (Socket.IO) con dados anti-trampa y turnos.
- **db**: un PostgreSQL con **una base lógica por servicio** (`db-init/init.sql`).

## Flujo interno

1. El cliente se autentica contra `user-service` (vía gateway) y obtiene un **JWT**
   firmado con un `JWT_SECRET` **compartido** por todos los servicios.
2. Cada servicio valida el JWT localmente; para decidir permisos sobre una mesa
   (¿es DM? ¿es miembro?) `dm`/`dungeon` **preguntan a `user-service`**
   (`partyAccess`), evitando duplicar el modelo de mesas.
3. El **modo mazmorra** abre WebSocket: Nginx → gateway → `dungeon-service`,
   propagando el upgrade en toda la cadena.
4. La **sincronización offline** la orquesta el gateway: divide las operaciones por
   entidad y las reenvía al servicio dueño de cada dato.

## Puesta en marcha

```bash
./install.sh          # instala Docker + Compose, prepara .env y levanta todo
# o manualmente:
cd src && docker compose up -d --build
```

App disponible en **http://localhost:8080**. Variables en `src/.env`
(plantilla en `src/.env.example`). Prueba de humo: `cd src && ./test.sh`.
