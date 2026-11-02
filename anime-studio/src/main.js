import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';
import { DEFAULTS, SCHEMA, applyHairPreset, HAIR_PRESETS } from './params.js';
import { CharacterView } from './render/character.js';
import { shared } from './render/materials.js';
import { UI } from './ui.js';
import { randomParams } from './random.js';
import { exportGLB, exportVRM } from './export.js';
import { saveFile } from './save.js';

const SCHEMA_BY_KEY = Object.fromEntries(SCHEMA.map((s) => [s.key, s]));
const FACE_DEPS = new Set(['skin', 'skinShade', 'hairColor']);

const BGS = {
  studio: 'radial-gradient(ellipse at 50% 35%, #fdf6ff 0%, #ead9f2 45%, #b9a6cf 100%)',
  sky: 'linear-gradient(180deg, #8ec9ff 0%, #cfe8ff 55%, #fff6e6 100%)',
  sunset: 'linear-gradient(180deg, #3b2a6b 0%, #c9608a 50%, #ffc58a 100%)',
  night: 'radial-gradient(ellipse at 50% 30%, #2b3168 0%, #141633 60%, #07081a 100%)',
  plain: 'linear-gradient(180deg, #d9dbe2 0%, #b9bcc7 100%)',
  green: '#00b140',
};

class App {
  constructor() {
    this.params = { ...DEFAULTS };
    this.history = [];
    this.future = [];
    this.loadSaved();
    this.lastCommitted = JSON.stringify(this.params);

    const vp = document.getElementById('viewport');
    this.vp = vp;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    vp.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    camera.position.set(0.35, 1.05, 4.2);
    this.camera = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.85, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.35;
    controls.maxDistance = 9;
    controls.screenSpacePanning = true;
    this.controls = controls;

    // ground shadow blob
    const sc = document.createElement('canvas');
    sc.width = sc.height = 256;
    const sx = sc.getContext('2d');
    const g = sx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(40,20,60,0.42)');
    g.addColorStop(0.5, 'rgba(40,20,60,0.18)');
    g.addColorStop(1, 'rgba(40,20,60,0)');
    sx.fillStyle = g;
    sx.fillRect(0, 0, 256, 256);
    const st = new THREE.CanvasTexture(sc);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    scene.add(ground);
    this.ground = ground;

    this.view = new CharacterView();
    scene.add(this.view.root);

    this.ui = new UI(document.getElementById('sidebar'), this);
    this.ui.sync(this.params);

    // three workers build body / clothing / head+hair in parallel
    this.groups = ['A', 'B', 'C'];
    this.workers = this.groups.map((g) => {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onPartial(g, e.data);
      return w;
    });
    this.reqId = 0;
    this.partial = {};
    this.first = true;

    this.view.updateFace(this.params);
    this.requestBuild();
    this.applyView();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.frame());

    document.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => this.frameCamera(b.dataset.cam)));
    document.getElementById('undo').onclick = () => this.undo();
    document.getElementById('redo').onclick = () => this.redo();
    document.getElementById('rand').onclick = () => this.randomize();
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? this.redo() : this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      }
    });
  }

  loadSaved() {
    try {
      const s = localStorage.getItem('animeforge.params');
      if (s) Object.assign(this.params, JSON.parse(s));
    } catch (e) {}
  }
  save() {
    try {
      localStorage.setItem('animeforge.params', JSON.stringify(this.params));
    } catch (e) {}
  }

  // --- parameter flow -------------------------------------------------
  set(key, value, { live = false } = {}) {
    if (key === 'hairStyle' && HAIR_PRESETS[value]) {
      this.params = applyHairPreset(this.params, value);
      this.ui.sync(this.params);
      this.requestBuild();
      return;
    }
    this.params[key] = value;
    const s = SCHEMA_BY_KEY[key];
    // touching any hair shape parameter switches the style label to "custom"
    if (s && s.tab === 'hair' && s.r === 'mesh' && key !== 'seed' && this.params.hairStyle !== 'custom') {
      this.params.hairStyle = 'custom';
    }
    this.refresh(s ? s.r : 'mesh', key);
    if (!live) this.ui.sync(this.params);
    else if (s && (s.type === 'select' || s.type === 'toggle')) this.ui.sync(this.params);
  }

  refresh(r, key) {
    if (r === 'mesh') this.requestBuild();
    else if (r === 'face') this.view.updateFace(this.params);
    else if (r === 'mat') {
      this.view.updateMaterials(this.params);
      if (FACE_DEPS.has(key)) this.view.updateFace(this.params);
      this.updateLight();
    } else if (r === 'pose') this.view.applyPose(this.params.pose);
    else if (r === 'view') this.applyView();
  }

  refreshAll() {
    this.ui.sync(this.params);
    this.view.updateFace(this.params);
    this.view.updateMaterials(this.params);
    this.view.applyPose(this.params.pose);
    this.applyView();
    this.updateLight();
    this.requestBuild();
  }

  commit() {
    const cur = JSON.stringify(this.params);
    if (cur === this.lastCommitted) return;
    this.history.push(this.lastCommitted);
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    this.lastCommitted = cur;
    this.ui.sync(this.params);
    this.save();
  }
  undo() {
    if (!this.history.length) return;
    this.future.push(this.lastCommitted);
    this.lastCommitted = this.history.pop();
    this.params = JSON.parse(this.lastCommitted);
    this.refreshAll();
    this.save();
  }
  redo() {
    if (!this.future.length) return;
    this.history.push(this.lastCommitted);
    this.lastCommitted = this.future.pop();
    this.params = JSON.parse(this.lastCommitted);
    this.refreshAll();
    this.save();
  }
  applyPreset(c) {
    this.params = { ...DEFAULTS, quality: this.params.quality, pose: this.params.pose, animate: this.params.animate, bg: this.params.bg, ...c.p };
    this.refreshAll();
    this.commit();
    this.toast(`${c.name} yüklendi`);
  }
  randomize() {
    this.params = randomParams(this.params);
    this.refreshAll();
    this.commit();
  }
  reset() {
    this.params = { ...DEFAULTS };
    this.refreshAll();
    this.commit();
  }

  // --- building -------------------------------------------------------
  requestBuild() {
    this.reqId++;
    document.body.classList.add('building');
    this.workers.forEach((w, i) => w.postMessage({ id: this.reqId, params: this.params, groups: this.groups[i] }));
  }
  onPartial(group, msg) {
    if (msg.error) return this.onBuilt(msg);
    const slot = (this.partial[msg.id] = this.partial[msg.id] || {});
    slot[group] = msg.res;
    if (Object.keys(slot).length < this.groups.length) return;
    delete this.partial[msg.id];
    for (const k of Object.keys(this.partial)) if (+k < msg.id) delete this.partial[k];
    if (msg.id < (this.shownId || 0)) return;
    this.shownId = msg.id;
    const parts = [];
    let ms = 0, tris = 0;
    for (const g of this.groups) {
      parts.push(...slot[g].parts);
      ms = Math.max(ms, slot[g].meta.ms);
      tris += slot[g].meta.tris;
    }
    const base = slot.A;
    this.onBuilt({ id: msg.id, res: { bones: base.bones, parts, meta: { ...base.meta, ms, tris } } });
  }
  onBuilt(msg) {
    if (msg.error) {
      console.error(msg.error);
      this.toast('Model oluşturulamadı: ' + msg.error.split('\n')[0]);
      document.body.classList.remove('building');
      return;
    }
    if (msg.id === this.reqId) document.body.classList.remove('building');
    this.view.setBuild(msg.res, this.params);
    this.view.animate = this.params.animate;
    const m = msg.res.meta;
    this.ground.scale.setScalar(m.height / 1.6);
    this.ground.position.y = this.params.shoes !== 'none' ? -0.011 : 0.001;
    document.getElementById('stats').textContent = `${m.tris.toLocaleString('tr-TR')} üçgen · ${msg.res.bones.length} kemik · ${m.ms} ms`;
    const es = document.getElementById('exportStats');
    if (es) es.innerHTML = `<div><b>${m.tris.toLocaleString('tr-TR')}</b><span>üçgen</span></div><div><b>${msg.res.bones.length}</b><span>kemik</span></div><div><b>${msg.res.parts.length}</b><span>parça</span></div><div><b>${(m.height * 100).toFixed(0)} cm</b><span>boy</span></div>`;
    if (this.first) {
      this.first = false;
      this.frameCamera('full', true);
      document.body.classList.add('ready');
    }
  }

  // --- view -----------------------------------------------------------
  applyView() {
    this.vp.style.background = BGS[this.params.bg] || BGS.studio;
    this.view.animate = this.params.animate;
    this.updateLight();
  }
  updateLight() {
    const a = (this.params.lightAngle * Math.PI) / 180;
    const h = (this.params.lightHeight * Math.PI) / 180;
    // camera-relative light: always flattering regardless of orbit
    this.lightView = new THREE.Vector3(Math.sin(a) * Math.cos(h), Math.sin(h), Math.cos(a) * Math.cos(h)).normalize();
  }
  frameCamera(kind, instant = false) {
    const m = this.view.meta;
    if (!m) return;
    const H = m.height;
    let target, dist;
    if (kind === 'face') {
      target = new THREE.Vector3(0, H - m.hH * 0.52, 0);
      dist = m.hH * 5.8;
    } else if (kind === 'upper') {
      target = new THREE.Vector3(0, H - m.hH * 1.4, 0);
      dist = m.hH * 10;
    } else {
      target = new THREE.Vector3(0, H * 0.52, 0);
      dist = H * 2.75;
    }
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (kind) dir.set(0.12, 0.08, 1).normalize();
    this.camAnim = { from: this.camera.position.clone(), fromT: this.controls.target.clone(), to: target.clone().add(dir.multiplyScalar(dist)), toT: target, t: instant ? 1 : 0 };
    if (instant) {
      this.camera.position.copy(this.camAnim.to);
      this.controls.target.copy(target);
      this.camAnim = null;
    }
  }
  resize() {
    const w = this.vp.clientWidth, h = this.vp.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.camAnim) {
      const c = this.camAnim;
      c.t = Math.min(1, c.t + dt * 2.2);
      const e = 1 - Math.pow(1 - c.t, 3);
      this.camera.position.lerpVectors(c.from, c.to, e);
      this.controls.target.lerpVectors(c.fromT, c.toT, e);
      if (c.t >= 1) this.camAnim = null;
    }
    if (this.params.turntable) this.view.root.rotation.y += dt * 0.5;
    this.controls.update();
    this.view.update(dt);
    if (this.lightView) shared.uLightDir.value.copy(this.lightView);
    this.renderer.render(this.scene, this.camera);
  }

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // --- export ---------------------------------------------------------
  async exportAs(kind) {
    const name = (document.getElementById('charName')?.value || 'AnimeKarakter').trim() || 'AnimeKarakter';
    const author = (document.getElementById('charAuthor')?.value || '').trim() || 'AnimeForge';
    const fname = name.replace(/[^\w\-ğüşıöçĞÜŞİÖÇ]+/g, '_');
    try {
      let msg = null;
      if (kind === 'glb') {
        this.toast('GLB hazırlanıyor…');
        const buf = await exportGLB(this.view, this.params, { name });
        msg = await saveFile(new Blob([buf], { type: 'model/gltf-binary' }), fname + '.glb');
      } else if (kind === 'vrm') {
        this.toast('VRM hazırlanıyor…');
        const buf = await exportVRM(this.view, this.params, { name, author });
        msg = await saveFile(new Blob([buf], { type: 'application/octet-stream' }), fname + '.vrm');
      } else if (kind === 'png') {
        const ground = this.ground.visible;
        this.ground.visible = false;
        this.renderer.render(this.scene, this.camera);
        const blob = await new Promise((r) => this.renderer.domElement.toBlob(r, 'image/png'));
        this.ground.visible = ground;
        msg = await saveFile(blob, fname + '.png');
      } else if (kind === 'json') {
        msg = await saveFile(new Blob([JSON.stringify({ app: 'AnimeForge', version: 1, name, params: this.params }, null, 2)], { type: 'application/json' }), fname + '.json');
      } else if (kind === 'load') {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,application/json';
        inp.onchange = async () => {
          const f = inp.files[0];
          if (!f) return;
          try {
            const data = JSON.parse(await f.text());
            this.params = { ...DEFAULTS, ...(data.params || data) };
            if (data.name) document.getElementById('charName').value = data.name;
            this.refreshAll();
            this.commit();
            this.toast('Karakter yüklendi');
          } catch (e) {
            this.toast('Dosya okunamadı: geçerli bir AnimeForge .json dosyası seç');
          }
        };
        inp.click();
        return;
      }
      if (msg) this.toast(msg);
    } catch (e) {
      console.error(e);
      this.toast('Dışa aktarma hatası: ' + e.message);
    }
  }
}

window.app = new App();
