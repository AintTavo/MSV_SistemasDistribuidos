// Capa offline de la PWA: una base SQLite (sql.js) persistida en IndexedDB.
// Permite revisar/editar hojas de personaje y revisar el contenido del DM sin
// conexión, encolando los cambios para subirlos en bache al reconectar.
const Offline = (() => {
  let SQL = null;
  let db = null;
  const IDB_NAME = 'patavo-sqlite';
  const IDB_STORE = 'kv';

  function idb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbGet(key) {
    const d = await idb();
    return new Promise((resolve) => {
      const tx = d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      tx.onsuccess = () => resolve(tx.result || null);
      tx.onerror = () => resolve(null);
    });
  }
  async function idbSet(key, val) {
    const d = await idb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS characters (id INTEGER PRIMARY KEY, json TEXT);
    CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, character_id INTEGER, json TEXT);
    CREATE TABLE IF NOT EXISTS parties (id INTEGER PRIMARY KEY, json TEXT);
    CREATE TABLE IF NOT EXISTS stories (id INTEGER PRIMARY KEY, json TEXT);
    CREATE TABLE IF NOT EXISTS grimoire (id INTEGER PRIMARY KEY, json TEXT);
    CREATE TABLE IF NOT EXISTS bestiary (id INTEGER PRIMARY KEY, json TEXT);
    CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
  `;

  async function init() {
    if (db) return;
    SQL = await initSqlJs({ locateFile: (f) => window.SQL_WASM_BASE + f });
    const saved = await idbGet('db');
    db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();
    db.run(SCHEMA);
    await persist();
  }

  async function persist() {
    if (!db) return;
    await idbSet('db', db.export());
  }

  function rows(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
  }

  function table(name) {
    return rows(`SELECT json FROM ${name} ORDER BY id`).map((r) => JSON.parse(r.json));
  }

  // Guarda la instantánea descargada del servidor.
  async function saveSnapshot(data) {
    db.run('BEGIN');
    const fill = (tbl, list, extra) => {
      db.run(`DELETE FROM ${tbl}`);
      (list || []).forEach((o) => {
        if (extra) db.run(`INSERT OR REPLACE INTO ${tbl} (id, character_id, json) VALUES (?,?,?)`, [o.id, o.character_id, JSON.stringify(o)]);
        else db.run(`INSERT OR REPLACE INTO ${tbl} (id, json) VALUES (?,?)`, [o.id, JSON.stringify(o)]);
      });
    };
    fill('characters', data.characters);
    fill('items', data.items, true);
    fill('parties', data.parties);
    fill('stories', data.stories);
    fill('grimoire', data.grimoire);
    fill('bestiary', data.bestiary);
    db.run('INSERT OR REPLACE INTO meta (k,v) VALUES (?,?)', ['synced_at', data.synced_at || new Date().toISOString()]);
    db.run('COMMIT');
    await persist();
  }

  const getCharacters = () => table('characters');
  const getItems = (charId) => rows('SELECT json FROM items WHERE character_id=? ORDER BY id', [charId]).map((r) => JSON.parse(r.json));
  const getParties = () => table('parties');
  const getStories = () => table('stories');
  const getGrimoire = () => table('grimoire');
  const getBestiary = () => table('bestiary');
  const syncedAt = () => {
    const r = rows("SELECT v FROM meta WHERE k='synced_at'");
    return r[0] ? r[0].v : null;
  };

  // Edición local de una hoja sin conexión + encolado para sincronizar.
  async function updateCharacterLocal(id, data) {
    db.run('UPDATE characters SET json=? WHERE id=?', [JSON.stringify({ ...data, id }), id]);
    await enqueue({ entity: 'character', op: 'update', id, data });
  }
  async function updateStoryLocal(id, data) {
    db.run('UPDATE stories SET json=? WHERE id=?', [JSON.stringify({ ...data, id }), id]);
    await enqueue({ entity: 'story', op: 'update', id, data });
  }
  async function updateGrimoireLocal(id, data) {
    db.run('UPDATE grimoire SET json=? WHERE id=?', [JSON.stringify({ ...data, id }), id]);
    await enqueue({ entity: 'grimoire', op: 'update', id, data });
  }
  async function updateBestiaryLocal(id, data) {
    db.run('UPDATE bestiary SET json=? WHERE id=?', [JSON.stringify({ ...data, id }), id]);
    await enqueue({ entity: 'bestiary', op: 'update', id, data });
  }

  async function addItemLocal(charId, data) {
    const tempId = -Date.now();
    db.run('INSERT INTO items (id, character_id, json) VALUES (?,?,?)',
      [tempId, charId, JSON.stringify({ ...data, id: tempId, character_id: charId })]);
    await enqueue({ entity: 'item', op: 'create', characterId: charId, data });
  }
  async function updateItemLocal(charId, id, data) {
    db.run('UPDATE items SET json=? WHERE id=?', [JSON.stringify({ ...data, id, character_id: charId }), id]);
    if (id > 0) await enqueue({ entity: 'item', op: 'update', characterId: charId, id, data });
    else await persist();
  }
  async function deleteItemLocal(charId, id) {
    db.run('DELETE FROM items WHERE id=?', [id]);
    if (id > 0) await enqueue({ entity: 'item', op: 'delete', characterId: charId, id });
    else await persist();
  }

  async function enqueue(op) {
    op.clientId = 'c' + Date.now() + Math.random().toString(36).slice(2, 6);
    db.run('INSERT INTO outbox (op) VALUES (?)', [JSON.stringify(op)]);
    await persist();
  }
  const outboxCount = () => {
    const r = rows('SELECT count(*) AS n FROM outbox');
    return r[0] ? r[0].n : 0;
  };
  const getOutbox = () => rows('SELECT id, op FROM outbox ORDER BY id').map((r) => ({ rowid: r.id, op: JSON.parse(r.op) }));
  async function clearOutbox() {
    db.run('DELETE FROM outbox');
    await persist();
  }

  // Sube en bache todas las operaciones encoladas.
  async function flush() {
    const box = getOutbox();
    if (!box.length) return { applied: 0 };
    const result = await API.post('/sync/push', { operations: box.map((b) => b.op) });
    await clearOutbox();
    return result;
  }

  return {
    init, persist, saveSnapshot, syncedAt,
    getCharacters, getItems, getParties, getStories, getGrimoire, getBestiary,
    updateCharacterLocal, updateStoryLocal, updateGrimoireLocal, updateBestiaryLocal,
    addItemLocal, updateItemLocal, deleteItemLocal,
    outboxCount, getOutbox, clearOutbox, flush,
  };
})();
