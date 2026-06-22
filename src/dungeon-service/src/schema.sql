-- dungeon-service: salas de mazmorra en tiempo real (su propia BD).
CREATE TABLE IF NOT EXISTS dungeon_sessions (
  id SERIAL PRIMARY KEY,
  party_id INTEGER NOT NULL,
  dm_user_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT 'Sala',
  status TEXT NOT NULL DEFAULT 'waiting',
  canvas_data JSONB NOT NULL DEFAULT '[]',
  turn_order JSONB NOT NULL DEFAULT '[]',
  current_turn INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skill_checks (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES dungeon_sessions(id) ON DELETE CASCADE,
  user_id INTEGER,
  actor TEXT NOT NULL,
  ability TEXT NOT NULL,
  roll INTEGER NOT NULL,
  modifier INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  dc INTEGER,
  success BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
