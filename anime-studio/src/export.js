// GLB / VRM 1.0 export of the skinned character (T-pose bind, humanoid skeleton).
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MAT_DEFS } from './render/character.js';

const vrmName = (n) => n[0].toLowerCase() + n.slice(1);
const lin = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

function buildScene(view, params, { atlas }) {
  const res = view.res;
  if (!res) throw new Error('Model henüz hazır değil');
  const bones = res.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  res.bones.forEach((b, i) => {
    if (b.parent >= 0) {
      const pp = res.bones[b.parent].pos;
      bones[i].position.set(b.pos[0] - pp[0], b.pos[1] - pp[1], b.pos[2] - pp[2]);
      bones[b.parent].add(bones[i]);
    } else bones[i].position.set(...b.pos);
  });
  const root = new THREE.Group();
  root.name = 'AnimeCharacter';
  const armature = new THREE.Group();
  armature.name = 'Armature';
  root.add(armature);
  armature.add(bones[0]);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  // face texture (optionally an atlas: open eyes | closed eyes, for VRM blink)
  const fp = view.face;
  const S = fp.open.width;
  const cv = document.createElement('canvas');
  cv.width = atlas ? S * 2 : S;
  cv.height = S;
  const cx = cv.getContext('2d');
  cx.drawImage(fp.open, 0, 0);
  if (atlas) cx.drawImage(fp.closed, S, 0);
  const faceTex = new THREE.CanvasTexture(cv);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.flipY = true;

  // hair root->tip gradient as a small texture (works in every engine, unlike vertex colours)
  const gc = document.createElement('canvas');
  gc.width = 4;
  gc.height = 256;
  const gx = gc.getContext('2d');
  const hairA = new THREE.Color(params.hairColor), hairB = new THREE.Color(params.hairTip);
  const tmpC = new THREE.Color();
  for (let y = 0; y < 256; y++) {
    const t = y / 255;
    const e = THREE.MathUtils.smoothstep(t, 0.25, 1.0) * params.hairGrad;
    tmpC.copy(hairA).lerp(hairB, e);
    gx.fillStyle = '#' + tmpC.getHexString();
    gx.fillRect(0, y, 4, 1);
  }
  const hairTex = new THREE.CanvasTexture(gc);
  hairTex.colorSpace = THREE.SRGBColorSpace;
  hairTex.wrapS = hairTex.wrapT = THREE.ClampToEdgeWrapping;

  const mats = {};
  const getMat = (key) => {
    if (mats[key]) return mats[key];
    const def = MAT_DEFS[key] || (() => ['#ffffff', '#cccccc']);
    const [color, shade] = def(params);
    const m = new THREE.MeshStandardMaterial({ color: key === 'face' || key === 'hair' ? '#ffffff' : color, roughness: 0.92, metalness: 0 });
    m.name = key;
    if (key === 'face') m.map = faceTex;
    if (key === 'hair') m.map = hairTex;
    m.userData.toon = { color: key === 'face' ? params.skin : color, shade, key };
    mats[key] = m;
    return m;
  };

  for (const src of view.meshes) {
    const sg = src.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', sg.getAttribute('position').clone());
    g.setAttribute('normal', sg.getAttribute('normal').clone());
    g.setAttribute('skinIndex', sg.getAttribute('skinIndex').clone());
    g.setAttribute('skinWeight', sg.getAttribute('skinWeight').clone());
    g.setIndex(sg.getIndex().clone());
    const key = src.userData.matKey;
    if (key === 'face') {
      const uv = sg.getAttribute('uv').clone();
      if (atlas) for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
      g.setAttribute('uv', uv);
    }
    if (key === 'hair') {
      const t = sg.getAttribute('hairT');
      const uv = new Float32Array(t.count * 2);
      for (let i = 0; i < t.count; i++) {
        uv[i * 2] = 0.5;
        uv[i * 2 + 1] = 1 - t.getX(i) * 0.996 - 0.002;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    const mesh = new THREE.SkinnedMesh(g, getMat(key));
    mesh.name = src.name;
    armature.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }
  return { root, bones, mats };
}

async function runExport(root, plugins = []) {
  const exporter = new GLTFExporter();
  for (const p of plugins) exporter.register(p);
  return await exporter.parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 4096 });
}

export async function exportGLB(view, params, { name }) {
  const { root } = buildScene(view, params, { atlas: false });
  root.name = name;
  return await runExport(root);
}

export async function exportVRM(view, params, { name, author }) {
  const { root, bones, mats } = buildScene(view, params, { atlas: true });
  root.name = name;
  const outlineW = 0.0011 * params.outline;
  const outlineC = lin(params.outlineColor);
  const plugin = (writer) => ({
    name: 'VRMC_vrm_writer',
    async writeMaterialAsync(material, def) {
      const t = material.userData.toon;
      if (!t) return;
      def.extensions = def.extensions || {};
      def.extensions.KHR_materials_unlit = {};
      writer.extensionsUsed.KHR_materials_unlit = true;
      const base = new THREE.Color(t.color);
      const shade = new THREE.Color(t.shade);
      let shadeTex = null;
      if (t.key === 'face' || t.key === 'hair') {
        // textured: shade = texture * (shade/base ratio)
        const r = (a, b) => Math.min(1, b / Math.max(a, 0.02));
        shade.setRGB(r(base.r, shade.r), r(base.g, shade.g), r(base.b, shade.b));
        const bt = def.pbrMetallicRoughness && def.pbrMetallicRoughness.baseColorTexture;
        if (bt) shadeTex = JSON.parse(JSON.stringify(bt));
      }
      def.extensions.VRMC_materials_mtoon = {
        specVersion: '1.0',
        transparentWithZWrite: false,
        renderQueueOffsetNumber: 0,
        shadeColorFactor: [shade.r, shade.g, shade.b],
        ...(shadeTex ? { shadeMultiplyTexture: shadeTex } : {}),
        shadingShiftFactor: -(0.2 + params.shadeThreshold * 0.6 - 0.5) * 2,
        shadingToonyFactor: 1 - params.shadeSoft * 0.5,
        giEqualizationFactor: 0.9,
        matcapFactor: [0, 0, 0],
        parametricRimColorFactor: [params.rim * 0.5, params.rim * 0.5, params.rim * 0.5],
        parametricRimFresnelPowerFactor: 4,
        parametricRimLiftFactor: 0,
        rimLightingMixFactor: 1,
        outlineWidthMode: params.outline > 0 ? 'worldCoordinates' : 'none',
        outlineWidthFactor: outlineW,
        outlineColorFactor: outlineC,
        outlineLightingMixFactor: 1,
        uvAnimationScrollXSpeedFactor: 0,
        uvAnimationScrollYSpeedFactor: 0,
        uvAnimationRotationSpeedFactor: 0,
      };
      writer.extensionsUsed.VRMC_materials_mtoon = true;
    },
    afterParse() {
      const json = writer.json;
      const humanBones = {};
      for (const b of bones) {
        const idx = writer.nodeMap.get(b);
        if (idx !== undefined) humanBones[vrmName(b.name)] = { node: idx };
      }
      const faceIdx = writer.cache.materials.get(mats.face);
      const expressions = { preset: {} };
      if (faceIdx !== undefined) {
        expressions.preset.blink = { isBinary: true, textureTransformBinds: [{ material: faceIdx, scale: [1, 1], offset: [0.5, 0] }], overrideBlink: 'none', overrideLookAt: 'none', overrideMouth: 'none' };
      }
      writer.extensionsUsed.VRMC_vrm = true;
      json.extensions = json.extensions || {};
      json.extensions.VRMC_vrm = {
        specVersion: '1.0',
        meta: {
          name,
          version: '1.0',
          authors: [author],
          copyrightInformation: `© ${author}`,
          licenseUrl: 'https://vrm.dev/licenses/1.0/',
          avatarPermission: 'everyone',
          allowExcessivelyViolentUsage: false,
          allowExcessivelySexualUsage: false,
          commercialUsage: 'corporation',
          allowPoliticalOrReligiousUsage: false,
          allowAntisocialOrHateUsage: false,
          creditNotation: 'unnecessary',
          allowRedistribution: true,
          modification: 'allowModificationRedistribution',
        },
        humanoid: { humanBones },
        expressions,
      };
    },
  });
  return await runExport(root, [plugin]);
}
