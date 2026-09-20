import { AmbientLight, Box3, Color, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function renderStl(target: HTMLElement, source: string) {
  if (!/^\s*solid\b/.test(source)) throw new Error('Use an ASCII STL solid.');
  const geometry = new STLLoader().parse(source);
  const positions = geometry.getAttribute('position');
  if (!positions?.count || !Array.from(positions.array).every(Number.isFinite)) { geometry.dispose(); throw new Error('The STL has no valid triangles.'); }
  geometry.center();
  const material = new MeshStandardMaterial({ color: '#df7759', roughness: 0.8, metalness: 0 });
  const model = new Mesh(geometry, material);
  const scene = new Scene();
  scene.background = new Color('#161616');
  scene.add(model, new AmbientLight(0xffffff, 2));
  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const radius = new Box3().setFromObject(model).getSize(new Vector3()).length() || 1;
  const camera = new PerspectiveCamera(45, 2, radius / 100, radius * 100);
  camera.position.set(radius, radius * 0.7, radius);
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({ antialias: true }); }
  catch (cause) { geometry.dispose(); material.dispose(); throw cause; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', '3D STL model. Drag to rotate; use the controls to zoom.');
  renderer.domElement.tabIndex = 0;
  target.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enableZoom = false;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
  controls.update();
  const zoom = (event: Event) => { camera.position.set(radius, radius * 0.7, radius).multiplyScalar(1 / (event as CustomEvent<number>).detail); controls.update(); render(); };
  target.addEventListener('diagram-zoom', zoom);
  const resize = new ResizeObserver(() => {
    const width = target.clientWidth || 600;
    camera.aspect = width / 360;
    camera.updateProjectionMatrix();
    renderer.setSize(width, 360);
    render();
  });
  resize.observe(target);
  const keydown = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') model.rotation.y += event.key === 'ArrowLeft' ? -0.15 : 0.15;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') model.rotation.x += event.key === 'ArrowUp' ? -0.15 : 0.15;
    else if (event.key === 'Home') { model.rotation.set(0, 0, 0); camera.position.set(radius, radius * 0.7, radius); }
    else camera.position.multiplyScalar(event.key === '+' ? 0.9 : 1.1);
    render();
  };
  renderer.domElement.addEventListener('keydown', keydown);
  return () => { target.removeEventListener('diagram-zoom', zoom); resize.disconnect(); controls.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
}
