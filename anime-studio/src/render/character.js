// Turns worker build results into a skinned, toon-shaded THREE character.
import * as THREE from 'three';
import { makeToon, makeOutline, setShade, autoShade, shared } from './materials.js';
import { FacePainter } from './face.js';
import { POSES } from './poses.js';

// material key -> how to colour it from params
export const MAT_DEFS = {
  skin: (p) => [p.skin, p.skinShade],
  face: (p) => [p.skin, p.skinShade],
  hair: (p) => [p.hairColor, p.hairShade],
  top: (p) => [p.topColor, autoShade(p.topColor, 0.78)],
  top2: (p) => [p.topColor2, autoShade(p.topColor2, 0.72)],
  ribbon: (p) => [p.ribbonColor, autoShade(p.ribbonColor, 0.7)],
  bottom: (p) => [p.bottomColor, autoShade(p.bottomColor, 0.72)],
  legwear: (p) => [p.legwearColor, autoShade(p.legwearColor, 0.65)],
  shoe: (p) => [p.shoeColor, autoShade(p.shoeColor, 0.68)],
  shoe2: (p) => [p.shoeColor2, autoShade(p.shoeColor2, 0.75)],
  tie: (p) => [p.tieColor, autoShade(p.tieColor, 0.7)],
  acc: (p) => [p.accColor, autoShade(p.accColor, 0.7)],
  animalEar: (p) => [p.earColor, autoShade(p.earColor, 0.7)],
  earInner: (p) => [p.earInner, autoShade(p.earInner, 0.8)],
  glasses: (p) => [p.glassesColor, autoShade(p.glassesColor, 0.7)],
  choker: (p) => [p.chokerColor, autoShade(p.chokerColor, 0.7)],
  gold: () => ['#ffd968', '#d99a3a'],
  white: () => ['#ffffff', '#c9cde0'],
  dark: () => ['#25252e', '#15151a'],
};

const OUTLINE_W = { skin: 0.0007, face: 0.0005, hair: 0.0008, default: 0.0007 };
const KIND = { skin: 'skin', face: 'face', hair: 'hair', gold: 'shiny', glasses: 'shiny' };

export class CharacterView {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Character';
    this.mats = {};
    this.outlineMats = {};
    this.face = new FacePainter(2048);
    const tex = (c, srgb = true) => {
      const t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    this.texBase = tex(this.face.base);
    this.texIris = tex(this.face.iris);
    this.texOvOpen = tex(this.face.ovOpen);
    this.texOvClosed = tex(this.face.ovClosed);
    this.texMask = tex(this.face.mask, false);
    this.pose = 'idle';
    this.animate = true;
    this.blinkT = 2;
    this.meshes = [];
    this.bones = {};
    this.time = 0;
  }

  mat(key) {
    if (!this.mats[key]) {
      const m = key === 'face' ? makeToon({ kind: 'face', map: this.texBase }) : makeToon({ kind: KIND[key] || 'cloth' });
      if (key === 'face') {
        const u = m.userData.uniforms;
        u.uIris.value = this.texIris;
        u.uOverlay.value = this.texOvOpen;
        u.uMask.value = this.texMask;
      }
      m.name = key;
      this.mats[key] = m;
      const o = makeOutline(OUTLINE_W[key] ?? OUTLINE_W.default);
      o.name = key + '_outline';
      this.outlineMats[key] = o;
    }
    return this.mats[key];
  }

  setBuild(res, params) {
    // dispose old
    for (const m of this.meshes) m.geometry.dispose();
    this.root.clear();
    this.meshes = [];

    // skeleton
    const bones = res.bones.map((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      return bone;
    });
    res.bones.forEach((b, i) => {
      const bone = bones[i];
      if (b.parent >= 0) {
        const pp = res.bones[b.parent].pos;
        bone.position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
        bones[b.parent].add(bone);
      } else bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
    });
    const armature = new THREE.Group();
    armature.name = 'Armature';
    armature.add(bones[0]);
    this.root.add(armature);
    this.root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    this.skeleton = skeleton;
    this.bones = Object.fromEntries(bones.map((b) => [b.name, b]));
    this.restQuat = Object.fromEntries(bones.map((b) => [b.name, b.quaternion.clone()]));
    this.meta = res.meta;
    this.res = { bones: res.bones, meta: res.meta };

    for (const part of res.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
      if (part.uvs) g.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
      if (part.hairT) g.setAttribute('hairT', new THREE.BufferAttribute(part.hairT, 1));
      if (part.hairTan) g.setAttribute('hairTan', new THREE.BufferAttribute(part.hairTan, 3));
      if (part.blush) g.setAttribute('blush', new THREE.BufferAttribute(part.blush, 1));
      g.setAttribute('ao', new THREE.BufferAttribute(part.ao || new Float32Array(part.positions.length / 3).fill(1), 1));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(part.skinIndex, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(part.skinWeight, 4));
      g.setIndex(new THREE.BufferAttribute(part.index, 1));
      g.computeBoundingSphere();
      const mat = this.mat(part.mat);
      const mesh = new THREE.SkinnedMesh(g, mat);
      mesh.name = part.name;
      mesh.userData.matKey = part.mat;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      armature.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
      this.meshes.push(mesh);
      if (part.outline !== 0) {
        const om = new THREE.SkinnedMesh(g, this.outlineMats[part.mat]);
        om.name = part.name + '_outline';
        om.userData.isOutline = true;
        om.frustumCulled = false;
        armature.add(om);
        om.bind(skeleton, new THREE.Matrix4());
      }
    }
    this.updateMaterials(params);
    this.applyPose(this.pose);
    if (this.mats.face) {
      const r = res.meta.rect;
      this.mats.face.userData.uniforms.uFaceSize.value.set(r.x1 - r.x0, r.y1 - r.y0);
    }
  }

  updateMaterials(p) {
    for (const [key, m] of Object.entries(this.mats)) {
      const def = MAT_DEFS[key];
      if (!def) continue;
      const [c, s] = def(p);
      setShade(m, c, s);
      const u = m.userData.uniforms;
      u.uRimColor.value.set(key === 'hair' ? p.hairSpec : '#fff6ee');
      if (u.uBlushCol) u.uBlushCol.value.set(p.blushColor).lerp(new THREE.Color('#ffffff'), 0.25);
      if (key === 'face') u.uIrisDepth.value = 0.0035 * (p.eyeDepth ?? 1);
      if (key === 'hair') {
        u.uSpec.value.set(p.hairSpec);
        u.uSpecStr.value = p.hairSpecStr;
        u.uTip.value.set(p.hairTip);
        u.uGrad.value = p.hairGrad;
      }
      const o = this.outlineMats[key];
      if (o) o.userData.uniforms.uTint.value.set(autoShade(key === 'face' ? p.skinShade : c, key === 'skin' || key === 'face' ? 0.55 : 0.4));
    }
    shared.uSoft.value = p.shadeSoft * 0.5;
    shared.uThreshold.value = 0.2 + p.shadeThreshold * 0.6;
    shared.uRim.value = p.rim;
    shared.uOutlineScale.value = p.outline;
    shared.uOutlineColor.value.set(p.outlineColor);
    shared.uLightColor.value.set(p.lightColor);
  }

  updateFace(p) {
    this.face.draw(p);
    for (const t of [this.texBase, this.texIris, this.texOvOpen, this.texOvClosed, this.texMask]) t.needsUpdate = true;
  }

  applyPose(name) {
    this.pose = name;
    const pose = POSES[name] || {};
    const e = new THREE.Euler();
    const d = Math.PI / 180;
    for (const [bn, bone] of Object.entries(this.bones)) {
      const r = pose[bn];
      if (r) bone.quaternion.setFromEuler(e.set(r[0] * d, r[1] * d, r[2] * d, 'XYZ'));
      else bone.quaternion.identity();
    }
    this.poseQuat = Object.fromEntries(Object.entries(this.bones).map(([n, b]) => [n, b.quaternion.clone()]));
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (!this.poseQuat) return;
    const faceMat = this.mats.face;
    if (this.animate) {
      // breathing / sway
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const add = (bn, x, y, z) => {
        const b = this.bones[bn];
        if (!b) return;
        q.setFromEuler(e.set(x, y, z));
        b.quaternion.copy(this.poseQuat[bn]).multiply(q);
      };
      const br = Math.sin(t * 1.6);
      add('Spine', br * 0.012, Math.sin(t * 0.5) * 0.01, 0);
      add('Chest', br * 0.015, 0, 0);
      add('UpperChest', br * 0.012, 0, 0);
      add('Head', -br * 0.01 + Math.sin(t * 0.7) * 0.012, Math.sin(t * 0.45) * 0.03, Math.sin(t * 0.6) * 0.012);
      if (this.pose !== 'tpose') {
        add('LeftUpperArm', 0, 0, br * 0.02);
        add('RightUpperArm', 0, 0, -br * 0.02);
      }
      if (this.pose === 'wave') add('RightLowerArm', 0, Math.sin(t * 6) * 0.25, 0);
      // blink
      this.blinkT -= dt;
      let closed = false;
      if (this.blinkT < 0) {
        closed = true;
        if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3.5;
      }
      if (faceMat) {
        const u = faceMat.userData.uniforms;
        u.uEyeOpen.value = closed ? 0 : 1;
        u.uOverlay.value = closed ? this.texOvClosed : this.texOvOpen;
      }
    } else {
      for (const [n, b] of Object.entries(this.bones)) b.quaternion.copy(this.poseQuat[n]);
      if (faceMat) {
        faceMat.userData.uniforms.uEyeOpen.value = 1;
        faceMat.userData.uniforms.uOverlay.value = this.texOvOpen;
      }
    }
  }
}
