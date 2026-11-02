// File saving: uses the host's download capability when running inside a sandboxed viewer,
// otherwise a normal browser download. Formats the host doesn't accept are wrapped in a .zip.

const HOST_OK = new Set(['png', 'json', 'zip', 'txt', 'csv', 'jpg', 'jpeg', 'webp', 'gif']);

let hostDownloads; // undefined = not checked, null = unavailable
async function getHost() {
  if (hostDownloads !== undefined) return hostDownloads;
  hostDownloads = null;
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      hostDownloads = await Promise.race([window.claude.use('downloads'), new Promise((r) => setTimeout(() => r(null), 4000))]);
    }
  } catch (e) {
    hostDownloads = null;
  }
  return hostDownloads;
}

// ---- minimal ZIP (store, no compression) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  let csize = 0;
  for (const c of central) csize += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

function browserDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// returns a short status text for the toast
export async function saveFile(blob, name) {
  const host = await getHost();
  if (!host) {
    browserDownload(blob, name);
    return 'İndirme başladı ✔';
  }
  const ext = name.split('.').pop().toLowerCase();
  let file = blob, fname = name;
  if (!HOST_OK.has(ext)) {
    const data = new Uint8Array(await blob.arrayBuffer());
    file = makeZip([{ name, data }]);
    fname = name.replace(/\.[^.]+$/, '') + '.zip';
  }
  try {
    await host.save({ filename: fname, data: file });
    return fname.endsWith('.zip') && fname !== name ? `${fname} kaydedildi (içinde ${name})` : `${fname} kaydedildi ✔`;
  } catch (e) {
    if (e && e.code === 'declined') return 'İndirme iptal edildi';
    browserDownload(blob, name);
    return 'İndirme başladı ✔';
  }
}
