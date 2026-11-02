import { buildCharacter } from './core/builder.js';
import { simplifierReady } from './core/partkit.js';

let busy = false;
let pending = null;

async function run(msg) {
  busy = true;
  await simplifierReady;
  try {
    const res = buildCharacter(msg.params, msg.groups || 'ABC');
    const transfer = [];
    for (const p of res.parts) {
      for (const k of ['positions', 'normals', 'uvs', 'hairT', 'index', 'skinIndex', 'skinWeight', 'colors']) {
        if (p[k]) {
          // copy so cached arrays stay intact in the worker
          p[k] = p[k].slice();
          transfer.push(p[k].buffer);
        }
      }
    }
    self.postMessage({ id: msg.id, res }, transfer);
  } catch (e) {
    self.postMessage({ id: msg.id, error: String(e && e.stack || e) });
  }
  busy = false;
  if (pending) {
    const m = pending;
    pending = null;
    run(m);
  }
}

self.onmessage = (e) => {
  if (busy) pending = e.data; // only keep the latest request
  else run(e.data);
};
