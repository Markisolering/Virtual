// Egna avatarer från Avaturn (avaturn.me). Avataren skapas i Avaturns redigerare, som öppnas i en ram i
// spelet (eller laddas upp som GLB-fil), och sparas i webbläsarens databas (IndexedDB) så att den finns
// kvar till nästa gång. Avatarerna styrs av samma skelett och rörelser som de inbyggda personerna.

const DB = 'virtual-room-avatars';
const STORE = 'avatars';

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

// [{ id, name, gender: 'f' | 'm', created }] utan själva filen
export async function listAvatars() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return all.map(({ blob, ...meta }) => meta).sort((a, b) => a.created - b.created);
  } catch {
    return [];
  }
}

export async function avatarBlob(id) {
  const rec = await tx('readonly', (s) => s.get(id));
  return rec?.blob || null;
}

export async function saveAvatar(blob, { name, gender }) {
  const id = `av_${Date.now().toString(36)}`;
  await tx('readwrite', (s) => s.put({ id, name: name || 'Min avatar', gender: gender === 'm' ? 'm' : 'f', created: Date.now(), blob }));
  return id;
}

export async function updateAvatar(id, changes) {
  const rec = await tx('readonly', (s) => s.get(id));
  if (rec) await tx('readwrite', (s) => s.put({ ...rec, ...changes }));
}

export async function deleteAvatar(id) {
  await tx('readwrite', (s) => s.delete(id));
}

// En GLB-fil måste börja med "glTF"
export async function isGlb(blob) {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return String.fromCharCode(...head) === 'glTF';
}

// Öppna Avaturns redigerare i en ram över spelet. Löftet ger { blob, gender } när man har exporterat,
// eller null om man stänger.
export async function createWithAvaturn(container) {
  const { AvaturnSDK } = await import('@avaturn/sdk');
  const sdk = new AvaturnSDK();
  return new Promise((resolve, reject) => {
    const done = (value) => {
      try {
        sdk.destroy();
      } catch {
        // Redan borttagen
      }
      resolve(value);
    };
    container.closeAvaturn = () => done(null);
    sdk
      .init(container, { iframeClassName: 'avaturn-frame' })
      .then(() =>
        sdk.on('export', async (data) => {
          try {
            const res = await fetch(data.url);
            const blob = await res.blob();
            done({ blob, gender: data.gender === 'male' ? 'm' : 'f' });
          } catch (err) {
            reject(err);
          }
        }),
      )
      .catch(reject);
  });
}
