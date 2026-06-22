# ── El mapa del aventurero (microservicios) — Imagen Nginx para el front-end ──────
# El contexto de build es msv/src (ver docker-compose.yml) para poder
# copiar tanto el front del gateway como la configuración de nginx.
FROM nginx:1.27-alpine

# Front-end estático de la PWA (servido directamente por Nginx).
COPY gateway/public/ /usr/share/nginx/html/

# Configuración del reverse proxy.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
