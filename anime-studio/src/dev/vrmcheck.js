import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { exportVRM, exportGLB } from '../export.js';
export async function check() {
  const app = window.app;
  const out = {};
  const glb = await exportGLB(app.view, app.params, { name: 'Test' });
  out.glbBytes = glb.byteLength;
  const vrm = await exportVRM(app.view, app.params, { name: 'Test', author: 'Tester' });
  out.vrmBytes = vrm.byteLength;
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(vrm, '');
  const v = gltf.userData.vrm;
  // inspect raw JSON
  const dv = new DataView(vrm);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(vrm, 20, jsonLen)));
  out.extUsed = json.extensionsUsed;
  out.hasVrmExt = !!(json.extensions && json.extensions.VRMC_vrm);
  out.nBones = json.extensions && json.extensions.VRMC_vrm ? Object.keys(json.extensions.VRMC_vrm.humanoid.humanBones).length : 0;
  out.userDataKeys = Object.keys(gltf.userData);
  if (!v) return out;
  out.meta = v.meta && v.meta.name;
  out.metaVersion = v.meta && v.meta.metaVersion;
  out.humanBones = Object.keys(v.humanoid.humanBones).length;
  out.hasHead = !!v.humanoid.getRawBoneNode('head');
  out.expressions = v.expressionManager ? v.expressionManager.expressions.map((e) => e.expressionName) : [];
  out.materials = [];
  gltf.scene.traverse((o) => { if (o.isMesh) out.materials.push(o.name + ':' + (Array.isArray(o.material) ? o.material.map(m=>m.type).join('/') : o.material.type)); });
  const g2 = await loader.parseAsync(glb, '');
  let skinned = 0; g2.scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
  out.glbSkinned = skinned;
  return out;
}
import * as THREE from 'three';
export async function render(blink = 0) {
  const app = window.app;
  const vrmBuf = await exportVRM(app.view, app.params, { name: 'Test', author: 'Tester' });
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.parseAsync(vrmBuf, '');
  const vrm = gltf.userData.vrm;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(700, 800);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#e9e0f0');
  sc.add(new THREE.DirectionalLight('#ffffff', 2.5).translateX(1).translateY(2).translateZ(3));
  sc.add(new THREE.AmbientLight('#ffffff', 0.6));
  sc.add(vrm.scene);
  vrm.expressionManager.setValue('blink', blink);
  // A pose
  vrm.humanoid.getNormalizedBoneNode('leftUpperArm').rotation.z = -1.1;
  vrm.humanoid.getNormalizedBoneNode('rightUpperArm').rotation.z = 1.1;
  vrm.update(0.016);
  const cam = new THREE.PerspectiveCamera(26, 700 / 800, 0.05, 20);
  cam.position.set(0.6, 1.25, 2.4);
  cam.lookAt(0, 1.15, 0);
  r.render(sc, cam);
  return r.domElement.toDataURL('image/png');
}
