// Sidebar UI generated from the parameter schema.
import { SCHEMA, TABS, CHARACTER_PRESETS } from './params.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class UI {
  constructor(root, app) {
    this.app = app;
    this.root = root;
    this.controls = {};
    this.activeTab = 'presets';
    this.build();
  }

  build() {
    const rail = el('nav', 'rail');
    const panel = el('div', 'panel');
    this.panel = panel;
    const tabs = [{ id: 'presets', label: 'Karakterler', icon: '✨' }, ...TABS];
    this.tabButtons = {};
    for (const t of tabs) {
      const b = el('button', 'rail-btn', `<span class="ico">${t.icon}</span><span class="lbl">${t.label}</span>`);
      b.title = t.label;
      b.onclick = () => this.showTab(t.id);
      rail.appendChild(b);
      this.tabButtons[t.id] = b;
    }
    this.root.append(rail, panel);
    this.pages = {};
    for (const t of tabs) {
      const page = el('div', 'page');
      page.dataset.tab = t.id;
      page.appendChild(el('h2', 'page-title', `${t.icon} ${t.label}`));
      this.pages[t.id] = page;
      panel.appendChild(page);
    }
    this.buildPresets(this.pages.presets);
    // schema controls
    const sections = {};
    for (const s of SCHEMA) {
      const key = s.tab + '/' + s.section;
      if (!sections[key]) {
        const sec = el('section', 'sec');
        const head = el('button', 'sec-head', `<span>${s.section}</span><span class="chev">▾</span>`);
        const body = el('div', 'sec-body');
        head.onclick = () => sec.classList.toggle('collapsed');
        sec.append(head, body);
        this.pages[s.tab].appendChild(sec);
        sections[key] = body;
      }
      sections[key].appendChild(this.control(s));
    }
    this.buildExport(this.pages.export);
    this.showTab('presets');
  }

  showTab(id) {
    this.activeTab = id;
    for (const [k, p] of Object.entries(this.pages)) p.classList.toggle('active', k === id);
    for (const [k, b] of Object.entries(this.tabButtons)) b.classList.toggle('active', k === id);
    this.panel.scrollTop = 0;
    this.app.onTab?.(id);
  }

  control(s) {
    const row = el('div', 'row row-' + s.type);
    this.rows = this.rows || {};
    this.rows[s.key] = row;
    const label = el('label', 'lab', s.label);
    row.appendChild(label);
    const app = this.app;
    if (s.type === 'range') {
      const val = el('span', 'val');
      const inp = el('input');
      inp.type = 'range';
      inp.min = s.min;
      inp.max = s.max;
      inp.step = s.step;
      const fmt = (v) => (s.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2));
      inp.oninput = () => {
        val.textContent = fmt(inp.value);
        app.set(s.key, parseFloat(inp.value), { live: true });
        this.fill(inp);
      };
      inp.onchange = () => app.commit();
      inp.ondblclick = () => {
        inp.value = s.def;
        inp.oninput();
        app.commit();
      };
      label.title = 'Çift tıkla: varsayılana dön';
      const top = el('div', 'range-top');
      top.append(label, val);
      row.innerHTML = '';
      row.append(top, inp);
      this.controls[s.key] = {
        set: (v) => {
          inp.value = v;
          val.textContent = fmt(v);
          this.fill(inp);
        },
      };
    } else if (s.type === 'color') {
      const wrap = el('div', 'color-wrap');
      const inp = el('input');
      inp.type = 'color';
      const hex = el('span', 'hex');
      inp.oninput = () => {
        hex.textContent = inp.value.toUpperCase();
        app.set(s.key, inp.value, { live: true });
      };
      inp.onchange = () => app.commit();
      wrap.append(hex, inp);
      row.appendChild(wrap);
      this.controls[s.key] = {
        set: (v) => {
          inp.value = v;
          hex.textContent = v.toUpperCase();
        },
      };
    } else if (s.type === 'select') {
      const chips = el('div', 'chips' + (s.options.length > 4 ? ' many' : ''));
      const btns = {};
      for (const [v, l] of s.options) {
        const b = el('button', 'chip', l);
        b.onclick = () => {
          app.set(s.key, v);
          app.commit();
        };
        btns[v] = b;
        chips.appendChild(b);
      }
      row.appendChild(chips);
      this.controls[s.key] = {
        set: (v) => {
          for (const [k, b] of Object.entries(btns)) b.classList.toggle('on', k === v);
        },
      };
    } else if (s.type === 'toggle') {
      const sw = el('button', 'switch');
      sw.onclick = () => {
        app.set(s.key, !app.params[s.key]);
        app.commit();
      };
      row.appendChild(sw);
      this.controls[s.key] = { set: (v) => sw.classList.toggle('on', !!v) };
    }
    return row;
  }

  fill(inp) {
    const pct = ((inp.value - inp.min) / (inp.max - inp.min)) * 100;
    inp.style.setProperty('--pct', pct + '%');
  }

  buildPresets(page) {
    page.appendChild(el('p', 'hint', 'Hazır bir karakterle başla, sonra her detayı kendine göre değiştir. Tüm ayarlar sol menüdeki sekmelerde.'));
    const grid = el('div', 'preset-grid');
    for (const c of CHARACTER_PRESETS) {
      const card = el('button', 'preset');
      const hc = c.p.hairColor || '#4a2f2a';
      const ic = c.p.irisBottom || '#5fb6ff';
      card.innerHTML = `<span class="swatch" style="background:linear-gradient(135deg, ${hc} 0 55%, ${c.p.hairTip || hc} 55% 75%, ${ic} 75%)"></span><b>${c.name}</b><small>${c.desc}</small>`;
      card.onclick = () => this.app.applyPreset(c);
      grid.appendChild(card);
    }
    page.appendChild(grid);
    const actions = el('div', 'actions');
    const rnd = el('button', 'btn primary', '🎲 Rastgele karakter');
    rnd.onclick = () => this.app.randomize();
    const reset = el('button', 'btn', '↺ Varsayılan');
    reset.onclick = () => this.app.reset();
    actions.append(rnd, reset);
    page.appendChild(actions);
    page.appendChild(el('p', 'hint small', 'İpucu: kaydırıcıya çift tıklayarak varsayılan değerine döndürebilirsin. Ctrl+Z / Ctrl+Y ile geri al / yinele.'));
  }

  buildExport(page) {
    const box = el('div', 'export');
    box.innerHTML = `
      <p class="hint">Modelin iskeleti (Humanoid), ağırlıkları ve materyalleriyle birlikte dışa aktarılır. PNG görsel ekrandaki render kalitesiyle (gölgeler ve efektler dahil) kaydedilir. Unity, Unreal, Godot, Blender ve VRChat/VTuber araçlarında kullanılabilir.</p>
      <div class="stat-grid" id="exportStats"></div>
      <label class="field"><span>Karakter adı</span><input id="charName" value="AnimeKarakter" maxlength="40"></label>
      <label class="field"><span>Yazar</span><input id="charAuthor" value="" maxlength="40" placeholder="İsmin"></label>
      <div class="actions col">
        <button class="btn primary" data-act="glb">⬇ GLB indir (Blender / Unity / Godot / Unreal)</button>
        <button class="btn primary" data-act="vrm">⬇ VRM 1.0 indir (VRChat, VTuber, UniVRM)</button>
        <button class="btn" data-act="png">🖼 PNG görsel (render)</button>
        <button class="btn" data-act="json">💾 Karakteri kaydet (.json)</button>
        <button class="btn" data-act="load">📂 Karakter yükle (.json)</button>
      </div>
      <details class="hint"><summary>Oyun motoruna aktarma ipuçları</summary>
        <ul>
          <li><b>Blender:</b> Dosya → İçe Aktar → glTF 2.0. İskelet ve ağırlıklar hazır gelir.</li>
          <li><b>Unity:</b> VRM dosyasını <i>UniVRM</i> ile içe aktar: toon shader (MToon), konturlar ve Humanoid avatar otomatik kurulur.</li>
          <li><b>Godot 4:</b> GLB dosyasını projeye sürükle. Godot-VRM eklentisi ile VRM de açılır.</li>
          <li><b>Unreal:</b> GLB'yi Interchange ile veya VRM4U eklentisiyle VRM'yi içe aktar.</li>
          <li>Kemik isimleri standarttır (Hips, Spine, LeftUpperArm…): Mixamo / humanoid animasyonları yeniden hedeflenebilir.</li>
        </ul>
      </details>`;
    box.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => this.app.exportAs(b.dataset.act)));
    page.appendChild(box);
  }

  sync(params) {
    for (const [k, c] of Object.entries(this.controls)) if (k in params) c.set(params[k]);
    // conditional visibility
    const vis = {
      irisTop2: params.hetero, irisBottom2: params.hetero, browColor: !params.browFromHair,
      tailLen: params.tails !== 'none' && params.tails !== 'bun' && params.tails !== 'twinbun',
      tailHeight: params.tails !== 'none', tailVolume: params.tails !== 'none', tieColor: params.tails !== 'none',
      skirtFlare: params.bottom === 'skirt' || params.bottom === 'aline', pleats: params.bottom === 'skirt',
      legwearColor: params.legwear !== 'none', shoeColor: params.shoes !== 'none', shoeColor2: params.shoes !== 'none',
      earColor: params.animalEars !== 'none', earInner: params.animalEars !== 'none', accColor: params.headAcc !== 'none',
      glassesColor: params.glasses !== 'none', chokerColor: params.choker, bangsLen: params.bangs !== 'none', bangsCount: params.bangs !== 'none',
    };
    for (const s of SCHEMA) {
      if (!(s.key in vis)) continue;
      const row = this.rowOf(s.key);
      if (row) row.style.display = vis[s.key] ? '' : 'none';
    }
  }

  rowOf(key) {
    return this.rows[key];
  }
}
