#!/usr/bin/env bash
# Prueba rápida de despliegue de los MICROSERVICIOS con Docker Compose.
# Verifica el enrutado del gateway y la comunicación entre servicios.
set -euo pipefail
cd "$(dirname "$0")"

BASE="http://localhost:8080"
echo "==> Levantando microservicios (gateway + user + dm + dungeon + db)…"
docker compose up -d --build

cleanup() { echo "==> Apagando…"; docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Esperando al gateway…"
for i in $(seq 1 60); do
  if curl -sf "$BASE/api/health" >/dev/null 2>&1; then break; fi
  sleep 2
  [ "$i" = "60" ] && { echo "FALLO: gateway no respondió"; docker compose logs; exit 1; }
done
# margen extra para que los servicios apliquen su esquema
sleep 5

pass=0; fail=0
check() { if [ "$1" = "$2" ]; then echo "  ✔ $3"; pass=$((pass+1)); else echo "  ✘ $3 (esperado '$2', obtenido '$1')"; fail=$((fail+1)); fi; }

U="dm_$RANDOM"
echo "==> [user-service] registro"
TOKEN=$(curl -sf -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"secret123\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && { echo "  ✔ token recibido"; pass=$((pass+1)); } || { echo "  ✘ sin token"; fail=$((fail+1)); }
AUTH="Authorization: Bearer $TOKEN"

echo "==> [user-service] personaje + inventario"
CHAR=$(curl -sf -X POST "$BASE/api/characters" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Gimli","class":"Guerrero","level":4}')
CID=$(echo "$CHAR" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
check "$(echo "$CHAR" | grep -c Gimli)" "1" "personaje creado (user-service)"
curl -sf -X POST "$BASE/api/characters/$CID/items" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Hacha","quantity":2}' >/dev/null
check "$(curl -sf "$BASE/api/characters/$CID/items" -H "$AUTH" | grep -c Hacha)" "1" "inventario (user-service)"

echo "==> [user-service] crear mesa"
PARTY=$(curl -sf -X POST "$BASE/api/parties" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Khazad-dum"}')
PID=$(echo "$PARTY" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
check "$(echo "$PARTY" | grep -c join_code)" "1" "mesa creada"

echo "==> [dm-service] grimorio + bestiario"
curl -sf -X POST "$BASE/api/dm/grimoire" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Rayo","level":3}' >/dev/null
check "$(curl -sf "$BASE/api/dm/grimoire" -H "$AUTH" | grep -c Rayo)" "1" "hechizo (dm-service)"
curl -sf -X POST "$BASE/api/dm/bestiary" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Balrog","cr":"19"}' >/dev/null
check "$(curl -sf "$BASE/api/dm/bestiary" -H "$AUTH" | grep -c Balrog)" "1" "monstruo (dm-service)"

echo "==> [dm-service -> user-service] historia (autorización entre servicios)"
STORY=$(curl -sf -X POST "$BASE/api/dm/stories" -H "$AUTH" -H 'Content-Type: application/json' -d "{\"party_id\":$PID,\"title\":\"Las Minas\",\"content\":\"...\"}")
SID=$(echo "$STORY" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
check "$(echo "$STORY" | grep -c 'Las Minas')" "1" "historia creada (dm valida DM vía user-service)"

echo "==> [dungeon-service -> user-service] iniciar sala (autorización entre servicios)"
SESS=$(curl -sf -X POST "$BASE/api/dungeon/sessions" -H "$AUTH" -H 'Content-Type: application/json' -d "{\"party_id\":$PID,\"name\":\"Puente\"}")
check "$(echo "$SESS" | grep -c '"status":"waiting"')" "1" "sala iniciada (dungeon valida DM vía user-service)"

echo "==> [gateway] sync agregado (pull)"
SNAP=$(curl -sf "$BASE/api/sync/pull" -H "$AUTH")
check "$(echo "$SNAP" | grep -c Gimli)" "1" "pull agrega user-service"
check "$(echo "$SNAP" | grep -c Rayo)" "1" "pull agrega dm-service"

echo "==> [gateway] sync agregado (push dividido entre servicios)"
PUSH=$(curl -sf -X POST "$BASE/api/sync/push" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"operations\":[{\"entity\":\"character\",\"op\":\"update\",\"id\":$CID,\"data\":{\"name\":\"Gimli hijo de Gloin\",\"race\":\"Enano\",\"class\":\"Guerrero\",\"level\":5,\"hp\":44,\"max_hp\":44,\"ac\":17,\"stats\":{\"str\":16},\"notes\":\"\"}},{\"entity\":\"story\",\"op\":\"update\",\"id\":$SID,\"data\":{\"title\":\"Las Minas de Moria\",\"content\":\"editado\"}}]}")
check "$(echo "$PUSH" | grep -c '"applied":2')" "1" "push dividido aplicado (2 ops)"
check "$(curl -sf "$BASE/api/characters/$CID" -H "$AUTH" | grep -c 'Gloin')" "1" "cambio de personaje persistido"
check "$(curl -sf "$BASE/api/dm/stories/party/$PID" -H "$AUTH" | grep -c 'Moria')" "1" "cambio de historia persistido"

echo "==> Control de acceso (sin token => 401)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/characters")
check "$CODE" "401" "rutas protegidas exigen login"

echo "==> PWA servida por el gateway"
HASUI=$(curl -sf "$BASE/" | grep -q 'AppPaTavo' && echo 1 || echo 0)
check "$HASUI" "1" "frontend PWA servido"

echo ""
echo "Resultado MICROSERVICIOS: $pass pruebas OK, $fail fallidas"
[ "$fail" = "0" ]
