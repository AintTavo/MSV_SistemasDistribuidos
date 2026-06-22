-- dm-service: historias, grimorio y bestiario (su propia BD).
-- party_id / dm_user_id se guardan como enteros (referencias lógicas a user-service).
CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  party_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS grimoire_spells (
  id SERIAL PRIMARY KEY,
  dm_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  school TEXT DEFAULT '', casting_time TEXT DEFAULT '', range TEXT DEFAULT '',
  components TEXT DEFAULT '', duration TEXT DEFAULT '', description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bestiary_monsters (
  id SERIAL PRIMARY KEY,
  dm_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT '', cr TEXT DEFAULT '0',
  hp INTEGER NOT NULL DEFAULT 1, ac INTEGER NOT NULL DEFAULT 10,
  stats JSONB NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
  abilities TEXT DEFAULT '', description TEXT DEFAULT ''
);
