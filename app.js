import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { StereoEffect } from './vendor/StereoEffects.js'; //  直接用StereoEffect

const apertureInput = document.querySelector('#aperture');
const focusInput = document.querySelector('#focus');
const stInput = document.querySelector('#stplane');
const loadWrap = document.querySelector('#load-wrap');
const loadBtn = document.querySelector('#load');
const viewModeBtn = document.querySelector('#view-mode'); // 左右视点切换按钮

const scene = new THREE.Scene();
let width = window.innerWidth;
let height = window.innerHeight;
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
const renderer = new THREE.WebGLRenderer();
let fragmentShader, vertexShader;

renderer.setSize(width, height);
document.body.appendChild(renderer.domElement);

camera.position.z = 2; // 调整相机位置

const effect = new StereoEffect(renderer); // 使用StereoEffect

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target = new THREE.Vector3(0, 0, 1);
controls.panSpeed = 2;

let fieldTexture;
let plane, planeMat, planePts;
const filename = './framesnew.mp4';
const camsX = 17;
const camsY = 17;
const resX = 1024;
const resY = 1024;
const cameraGap = 0.08; // cm hardcoded for now
let aperture = Number(apertureInput.value);
let focus = Number(focusInput.value);

let isStereoView = true;

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  effect.setSize(width, height);
});

apertureInput.addEventListener('input', e => {
  aperture = Number(apertureInput.value);
  planeMat.uniforms.aperture.value = aperture;
});

focusInput.addEventListener('input', e => {
  focus = Number(focusInput.value);
  planeMat.uniforms.focus.value = focus;
});

stInput.addEventListener('input', () => {
  planePts.visible = stInput.checked;
});

loadBtn.addEventListener('click', async () => {
  loadBtn.setAttribute('disabled', true);
  await loadScene();
});

viewModeBtn.addEventListener('click', () => {
  toggleViewMode();
});

// 切换视点模式
function toggleViewMode() {
  isStereoView = !isStereoView;
  viewModeBtn.textContent = isStereoView ? 'Switch to Single View' : 'Switch to Left/Right View';
}

async function loadScene() {
  await loadShaders();
  await extractVideo();
  loadPlane();
  animate();
}

async function loadShaders() {
  vertexShader = await fetch('./vertex.glsl').then(res => res.text());
  fragmentShader = await fetch('./fragment.glsl').then(res => res.text());
  console.log('Loaded shaders');
}

async function extractVideo() {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = resX;
  canvas.height = resY;
  canvas.setAttribute('id', 'videosrc');
  video.src = filename;
  let seekResolve;
  let count = 0;
  let offset = 0;
  const allBuffer = new Uint8Array(resX * resY * 4 * camsX * camsY);

  console.log('starting extraction');

  const getBufferFromVideo = () => {
    ctx.drawImage(video, 0, 0, resX, resY);
    const imgData = ctx.getImageData(0, 0, resX, resY);
    allBuffer.set(imgData.data, offset);
    offset += imgData.data.byteLength;
    count++;
    loadBtn.textContent = `Loaded ${Math.round(100 * count / (camsX * camsY))}%`;
  };

  const fetchFrames = async () => {
    let currentTime = 0;

    while (count < camsX * camsY) {
      getBufferFromVideo();
      currentTime += 0.0333;
      video.currentTime = currentTime;
      await new Promise(res => (seekResolve = res));
    }

    loadWrap.style.display = 'none';

    fieldTexture = new THREE.DataTexture2DArray(allBuffer, resX, resY, camsX * camsY);
    console.log('Loaded field data');

    planeMat.uniforms.field.value = fieldTexture;
    fieldTexture.needsUpdate = true;
  };

  video.addEventListener('seeked', async function () {
    if (seekResolve) seekResolve();
  });

  video.addEventListener('loadeddata', async () => {
    await fetchFrames();
    console.log('loaded data');
  });
}

function loadPlane() {
  const planeGeo = new THREE.PlaneGeometry(camsX * cameraGap, camsY * cameraGap, camsX, camsY);
  planeMat = new THREE.ShaderMaterial({
    uniforms: {
      field: { value: fieldTexture },
      camArraySize: new THREE.Uniform(new THREE.Vector2(camsX, camsY)),
      aperture: { value: aperture },
      focus: { value: focus }
    },
    vertexShader,
    fragmentShader,
  });
  plane = new THREE.Mesh(planeGeo, planeMat);
  const ptsMat = new THREE.PointsMaterial({ size: 0.01, color: 0xeeccff });
  planePts = new THREE.Points(planeGeo, ptsMat);
 
  planePts.visible = stInput.checked;
  plane.add(planePts);
  scene.add(plane);
  console.log('Loaded plane');
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (isStereoView) {
    effect.setSize( window.innerWidth, window.innerHeight );
    effect.render(scene, camera); // 使用 StereoEffect 渲染场景
  } else {
    renderer.setSize(width, height);// 修正视图尺寸
    renderer.render(scene, camera); // 单视图渲染
    
  }
}