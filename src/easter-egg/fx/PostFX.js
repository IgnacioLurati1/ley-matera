import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

// Postproceso con la estética de BO1: mundo + mate en primera persona,
// brillo en luces, corrección de color desaturada y contrastada, viñeta,
// grano de película, pantalla roja al recibir daño y gris al caer.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHurt: { value: 0 },
    uDown: { value: 0 },
    uFlash: { value: 0 },
    uCrit: { value: 0 },
    uPulse: { value: 0 },
    uGrain: { value: 0.06 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uHurt, uDown, uFlash, uGrain, uCrit, uPulse; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // aberración cromática sutil en los bordes
      float beat = uCrit * uPulse;
      float ca = 0.0018 + uHurt * 0.004 + beat * 0.007;
      // el latido "empuja" la imagen hacia afuera
      uv = 0.5 + c * (1.0 - beat * 0.012);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // desaturar y contrastar (look BO1)
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.78);
      col = (col - 0.5) * 1.08 + 0.5;
      // sombras frías, luces cálidas
      col += vec3(-0.01, 0.0, 0.02) * (1.0 - l) + vec3(0.02, 0.008, -0.012) * l;
      // caído: gris y oscuro
      float lg = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lg) * vec3(0.9, 0.9, 1.0), uDown * 0.85);
      // daño: bordes rojos pulsando
      float edge = smoothstep(0.08, 0.45, r2);
      col = mix(col, vec3(0.45, 0.0, 0.0), edge * uHurt * (0.75 + 0.25 * sin(uTime * 8.0)));
      // a un golpe de caer: casi sin color y con los bordes latiendo en rojo oscuro
      col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), uCrit * 0.5);
      col = mix(col, vec3(0.28, 0.0, 0.01), smoothstep(0.04, 0.5, r2) * uCrit * (0.45 + 0.55 * uPulse));
      col *= 1.0 - smoothstep(0.02, 0.6, r2) * uCrit * (0.25 + 0.35 * uPulse);
      // viñeta
      col *= 1.0 - smoothstep(0.18, 0.75, r2) * 0.55;
      // grano
      float n = hash(uv * uRes + fract(uTime * 13.0) * 100.0) - 0.5;
      col += n * uGrain;
      // destello blanco (kaboom / easter egg)
      col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export default class PostFX {
  constructor(renderer, scene, camera, vmScene, vmCamera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.world = new RenderPass(scene, camera);
    this.vm = new RenderPass(vmScene, vmCamera);
    this.vm.clear = false;
    this.vm.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.85);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.fxaa = new FXAAPass();
    this.composer.addPass(this.world);
    this.composer.addPass(this.vm);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.fxaa);
    this.flashV = 0;
  }

  setScenes(scene, camera) {
    this.world.scene = scene;
    this.world.camera = camera;
  }

  setQuality(q) {
    this.bloom.enabled = q !== 'low';
    this.fxaa.enabled = q === 'high' || q === 'ultra';
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.floor((w * pr) / 2), Math.floor((h * pr) / 2));
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }

  flash(v) {
    this.flashV = Math.max(this.flashV, v);
  }

  render(dt, t, { hurt = 0, down = 0, crit = 0, pulse = 0 } = {}) {
    const u = this.grade.uniforms;
    u.uCrit.value = crit;
    u.uPulse.value = pulse;
    u.uTime.value = t;
    u.uHurt.value += (hurt - u.uHurt.value) * Math.min(1, dt * 6);
    u.uDown.value += (down - u.uDown.value) * Math.min(1, dt * 3);
    this.flashV = Math.max(0, this.flashV - dt * 1.2);
    u.uFlash.value = Math.min(1, this.flashV);
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}
