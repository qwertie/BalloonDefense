import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

type CityShape = 'square' | 'rectangle' | 'octagon';
type InterceptionMode = 'closest' | 'random' | 'two' | 'smart';
type BalloonStatus = 'ready' | 'preparing' | 'ascending';

interface Configuration {
  cityShape: CityShape;
  cityRadius: number;
  spacing: number;
  range: number;
  altitude: number;
  attackRate: number;
  replenishmentMinutes: number;
  speed: number;
  mode: InterceptionMode;
}

interface BalloonNode {
  id: string;
  q: number;
  r: number;
  x: number;
  z: number;
  status: BalloonStatus;
  prepEndsAt: number;
  readyAt: number;
  group: THREE.Group;
  envelope: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  coverageDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
}

interface MovingObject {
  telemetryId: string;
  kind: 'ballistic' | 'interceptor';
  mesh: THREE.Mesh;
  trail: THREE.Line;
  trailPoints: THREE.Vector3[];
  lastPosition: THREE.Vector3;
  velocityKms: THREE.Vector3;
  speedKmh: number;
}

interface InterceptorVisual extends MovingObject {
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
}

interface Attack extends MovingObject {
  start: THREE.Vector3;
  target: THREE.Vector3;
  interceptPoint: THREE.Vector3;
  elapsed: number;
  duration: number;
  interceptAt: number;
  totalDistanceMeters: number;
  initialSpeedMps: number;
  pathAccelerationMps2: number;
  defended: boolean;
  detected: boolean;
  interceptors: InterceptorVisual[];
}

interface DescendingBalloon {
  group: THREE.Group;
  start: THREE.Vector3;
  startedAt: number;
  landsAt: number;
  driftAngle: number;
}

interface ExpiringTelemetry {
  telemetryId: string;
  kind: 'ballistic' | 'interceptor';
  speedKmh: number;
  altitude: number;
  status: 'Destroyed' | 'Impact' | 'Expended';
  life: number;
  maxLife: number;
}

interface VisualEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  velocityKms: THREE.Vector3;
  dragLengthKm: number;
  telemetry?: ExpiringTelemetry;
}

interface BomItem {
  key: string;
  label: string;
  cost: number;
  exponent: number;
}

const config: Configuration = {
  cityShape: 'rectangle',
  cityRadius: 30,
  spacing: 8,
  range: 10,
  altitude: 20,
  attackRate: 6,
  replenishmentMinutes: 30,
  speed: 20,
  mode: 'smart',
};

const defaultBom: BomItem[] = [
  { key: 'envelope', label: 'Envelope and tendons', cost: 3200, exponent: 0.55 },
  { key: 'helium', label: 'Lifting gas', cost: 2300, exponent: 0.45 },
  { key: 'rigging', label: 'Rigging and recovery', cost: 1400, exponent: 0.35 },
  { key: 'power', label: 'Solar power and storage', cost: 1800, exponent: 0 },
  { key: 'comms', label: 'Navigation and communications', cost: 1800, exponent: 0 },
  { key: 'airframe', label: 'Interceptor airframe', cost: 3500, exponent: 1.1 },
  { key: 'propulsion', label: 'Interceptor propulsion', cost: 7500, exponent: 1.7 },
  { key: 'guidance', label: 'Guidance and fuzing', cost: 12000, exponent: 0.35 },
  { key: 'integration', label: 'Production integration and acceptance', cost: 35000, exponent: 0.35 },
  { key: 'support', label: 'Allocated ground support and spares', cost: 45000, exponent: 0.1 },
  { key: 'engineering', label: 'Program engineering and software', cost: 60000, exponent: 0.3 },
  { key: 'contingency', label: 'Production contingency and resilience', cost: 20000, exponent: 0.5 },
  { key: 'labor', label: 'Labor', cost: 4000, exponent: 0 },
  { key: 'profit', label: 'Profit', cost: 4000, exponent: 0 },
];

let bom = defaultBom.map((item) => ({ ...item }));
let simulationTime = 0;
let paused = false;
let nextAttackAt = 0;
let hits = 0;
let misses = 0;
let lastFrameTime = performance.now();
let gridRevision = 0;
let ballisticSequence = 0;
let interceptorSequence = 0;

const canvas = requireElement<HTMLCanvasElement>('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071014);
scene.fog = new THREE.FogExp2(0x071014, 0.008);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
camera.position.set(54, 46, 58);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 7, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 15;
controls.maxDistance = 180;

scene.add(new THREE.HemisphereLight(0xbfe8ef, 0x243019, 1.55));
const sun = new THREE.DirectionalLight(0xfff1cc, 2.4);
sun.position.set(-40, 65, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const groundGroup = new THREE.Group();
const cityGroup = new THREE.Group();
const gridGroup = new THREE.Group();
const movingGroup = new THREE.Group();
const effectsGroup = new THREE.Group();
scene.add(groundGroup, cityGroup, gridGroup, movingGroup, effectsGroup);

const balloons: BalloonNode[] = [];
const balloonById = new Map<string, BalloonNode>();
const attacks: Attack[] = [];
const effects: VisualEffect[] = [];
const descendingBalloons: DescendingBalloon[] = [];
const expiringTelemetry: ExpiringTelemetry[] = [];

const readyMaterial = new THREE.MeshStandardMaterial({ color: 0x58e1d3, emissive: 0x0b5b57, roughness: 0.42, metalness: 0.08 });
const depletedMaterial = new THREE.MeshStandardMaterial({ color: 0x50666a, emissive: 0x111b1d, roughness: 0.75 });
const incomingMaterial = new THREE.MeshStandardMaterial({ color: 0xff6f73, emissive: 0xaa1820, emissiveIntensity: 2.2 });
const interceptorMaterial = new THREE.MeshStandardMaterial({ color: 0xf4bc5f, emissive: 0xc77616, emissiveIntensity: 2.1 });

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function readNumber(id: string): number {
  return Number(requireElement<HTMLInputElement>(id).value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value);
}

function formatSimulationTime(seconds: number): string {
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const clock = [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function cityVertices(): THREE.Vector2[] {
  const radius = config.cityRadius;
  if (config.cityShape === 'square') {
    const half = radius / Math.sqrt(2);
    return [new THREE.Vector2(-half, -half), new THREE.Vector2(half, -half), new THREE.Vector2(half, half), new THREE.Vector2(-half, half)];
  }
  if (config.cityShape === 'rectangle') {
    const halfWidth = radius * 3 / Math.sqrt(13);
    const halfHeight = radius * 2 / Math.sqrt(13);
    return [new THREE.Vector2(-halfWidth, -halfHeight), new THREE.Vector2(halfWidth, -halfHeight), new THREE.Vector2(halfWidth, halfHeight), new THREE.Vector2(-halfWidth, halfHeight)];
  }
  return Array.from({ length: 8 }, (_, index) => {
    const angle = Math.PI / 8 + index * Math.PI / 4;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function pointInsideCity(x: number, z: number): boolean {
  const vertices = cityVertices();
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const zi = vertices[i].y;
    const xj = vertices[j].x;
    const zj = vertices[j].y;
    const intersects = ((zi > z) !== (zj > z)) && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function randomCityPoint(): THREE.Vector3 {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const x = (Math.random() * 2 - 1) * config.cityRadius;
    const z = (Math.random() * 2 - 1) * config.cityRadius;
    if (pointInsideCity(x, z)) return new THREE.Vector3(x, 0.25, z);
  }
  return new THREE.Vector3();
}

function disposeGroup(group: THREE.Group): void {
  while (group.children.length) {
    const object = group.children.pop();
    if (!object) continue;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material?.dispose());
      }
    });
  }
}

function createCityTexture(): THREE.CanvasTexture {
  const size = 1024;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  const random = seededRandom(9152026 + Math.round(config.cityRadius));

  context.fillStyle = '#435247';
  context.fillRect(0, 0, size, size);

  for (let index = 0; index < 160; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const width = 20 + random() * 100;
    const height = 20 + random() * 85;
    context.fillStyle = random() > 0.35 ? '#4c5550' : '#355647';
    context.fillRect(x, y, width, height);
  }

  context.strokeStyle = '#89918a';
  context.lineCap = 'round';
  for (let index = -3; index < 16; index += 1) {
    const position = index * 78 + (random() - 0.5) * 18;
    context.lineWidth = index % 4 === 0 ? 8 : 3;
    context.beginPath(); context.moveTo(position, 0); context.lineTo(position + 165, size); context.stroke();
    context.beginPath(); context.moveTo(0, position); context.lineTo(size, position - 90); context.stroke();
  }

  context.strokeStyle = '#bcc0b8';
  context.lineWidth = 13;
  context.beginPath();
  context.moveTo(-40, size * 0.72);
  context.bezierCurveTo(size * 0.3, size * 0.48, size * 0.55, size * 0.91, size + 40, size * 0.36);
  context.stroke();
  context.strokeStyle = '#65787b';
  context.lineWidth = 7;
  context.stroke();

  for (let index = 0; index < 1300; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const width = 2 + random() * 9;
    const height = 2 + random() * 8;
    context.fillStyle = random() > 0.55 ? '#bec0b6' : '#6d756f';
    context.fillRect(x, y, width, height);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function rebuildCity(): void {
  disposeGroup(cityGroup);
  disposeGroup(groundGroup);
  const radius = config.cityRadius;

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 2.8, 96),
    new THREE.MeshStandardMaterial({ color: 0x17241e, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  groundGroup.add(ground);

  const vertices = cityVertices();
  const shape = new THREE.Shape(vertices);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const positions = geometry.attributes.position;
  const uv: number[] = [];
  for (let index = 0; index < positions.count; index += 1) {
    uv.push(
      (positions.getX(index) - bounds.min.x) / Math.max(0.001, bounds.max.x - bounds.min.x),
      (positions.getY(index) - bounds.min.y) / Math.max(0.001, bounds.max.y - bounds.min.y),
    );
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.rotateX(-Math.PI / 2);
  const city = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: createCityTexture(), roughness: 0.95 }));
  city.position.y = 0.035;
  city.receiveShadow = true;
  cityGroup.add(city);

  const outlinePoints = vertices.map((vertex) => new THREE.Vector3(vertex.x, 0.12, -vertex.y));
  outlinePoints.push(outlinePoints[0].clone());
  const outline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(outlinePoints),
    new THREE.LineBasicMaterial({ color: 0x77d8cf, transparent: true, opacity: 0.75 }),
  );
  cityGroup.add(outline);

  const random = seededRandom(4401 + Math.round(radius * 7));
  const buildingGeometry = new THREE.BoxGeometry(0.22, 1, 0.22);
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb9b2, roughness: 0.82, metalness: 0.05 });
  const buildingCount = Math.min(950, Math.round(radius * radius * 0.62));
  const buildings = new THREE.InstancedMesh(buildingGeometry, buildingMaterial, buildingCount);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let placed = 0;
  while (placed < buildingCount) {
    const x = (random() * 2 - 1) * radius;
    const z = (random() * 2 - 1) * radius;
    if (!pointInsideCity(x, z)) continue;
    const centreFactor = Math.max(0, 1 - Math.hypot(x, z) / radius);
    const height = 0.05 + random() * (0.1 + centreFactor * 0.45);
    scale.set(0.7 + random() * 1.9, height, 0.7 + random() * 1.9);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() > 0.5 ? 0 : Math.PI / 2);
    matrix.compose(new THREE.Vector3(x, height / 2 + 0.08, z), quaternion, scale);
    buildings.setMatrixAt(placed, matrix);
    placed += 1;
  }
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  cityGroup.add(buildings);
}

function createBalloonVisual(x: number, y: number, z: number, material: THREE.MeshStandardMaterial): {
  group: THREE.Group;
  envelope: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
} {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), material.clone());
  envelope.scale.set(1, 1.28, 1);
  envelope.castShadow = true;
  group.add(envelope);

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.38, 0), new THREE.Vector3(0, -0.76, 0)]);
  group.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x9fc0be })));
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: 0xd6a753, metalness: 0.35, roughness: 0.4 }));
  gondola.position.y = -0.81;
  gondola.castShadow = true;
  group.add(gondola);

  return { group, envelope };
}

function makeBalloon(node: Omit<BalloonNode, 'group' | 'envelope' | 'coverageDisc'>): BalloonNode {
  const { group, envelope } = createBalloonVisual(node.x, config.altitude, node.z, readyMaterial);

  const discMaterial = new THREE.MeshBasicMaterial({ color: 0x58e1d3, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide });
  const coverageDisc = new THREE.Mesh(new THREE.CircleGeometry(config.range, 48), discMaterial);
  coverageDisc.rotation.x = -Math.PI / 2;
  coverageDisc.position.set(node.x, 0.16, node.z);
  gridGroup.add(group, coverageDisc);
  return { ...node, group, envelope, coverageDisc };
}

function rebuildGrid(reason = 'Defense grid initialized.'): void {
  gridRevision += 1;
  clearMovingObjects();
  disposeGroup(effectsGroup);
  effects.length = 0;
  disposeGroup(gridGroup);
  descendingBalloons.length = 0;
  balloons.length = 0;
  balloonById.clear();
  const extent = config.cityRadius + config.spacing;
  const limit = Math.ceil((extent * 2) / config.spacing) + 2;

  for (let r = -limit; r <= limit; r += 1) {
    for (let q = -limit; q <= limit; q += 1) {
      const x = config.spacing * (q + r / 2);
      const z = config.spacing * (Math.sqrt(3) / 2) * r;
      if (!pointInsideCity(x, z)) continue;
      const id = `${q}:${r}`;
      const balloon = makeBalloon({ id, q, r, x, z, status: 'ready', prepEndsAt: 0, readyAt: 0 });
      balloons.push(balloon);
      balloonById.set(id, balloon);
    }
  }

  const connectionPoints: THREE.Vector3[] = [];
  for (const balloon of balloons) {
    for (const [dq, dr] of [[1, 0], [0, 1], [1, -1]]) {
      const neighbor = balloonById.get(`${balloon.q + dq}:${balloon.r + dr}`);
      if (!neighbor) continue;
      connectionPoints.push(
        new THREE.Vector3(balloon.x, config.altitude, balloon.z),
        new THREE.Vector3(neighbor.x, config.altitude, neighbor.z),
      );
    }
  }
  const connectionGeometry = new THREE.BufferGeometry().setFromPoints(connectionPoints);
  const connections = new THREE.LineSegments(connectionGeometry, new THREE.LineBasicMaterial({ color: 0x4a8f8b, transparent: true, opacity: 0.2 }));
  gridGroup.add(connections);

  updateCoverage();
  updateFleetStatus();
  updateCost();
  logEvent(reason);
}

function neighborCount(balloon: BalloonNode): number {
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  return offsets.reduce((count, [dq, dr]) => {
    const neighbor = balloonById.get(`${balloon.q + dq}:${balloon.r + dr}`);
    return count + (neighbor?.status === 'ready' ? 1 : 0);
  }, 0);
}

function selectBalloons(point: THREE.Vector3): BalloonNode[] {
  const candidates = balloons
    .filter((balloon) => balloon.status === 'ready')
    .map((balloon) => ({ balloon, distance: Math.hypot(balloon.x - point.x, balloon.z - point.z) }))
    .filter(({ distance }) => distance <= config.range)
    .sort((a, b) => a.distance - b.distance);

  if (!candidates.length) return [];
  if (config.mode === 'closest') return [candidates[0].balloon];
  if (config.mode === 'random') return [candidates[Math.floor(Math.random() * candidates.length)].balloon];
  if (config.mode === 'two') return candidates.slice(0, 2).map(({ balloon }) => balloon);

  const nearestTwo = candidates.slice(0, 2);
  if (nearestTwo.length === 2 && nearestTwo.every(({ balloon }) => neighborCount(balloon) === 6)) {
    return nearestTwo.map(({ balloon }) => balloon);
  }
  return [candidates
    .map((entry) => ({ ...entry, neighbors: neighborCount(entry.balloon) }))
    .sort((a, b) => b.neighbors - a.neighbors || a.distance - b.distance)[0].balloon];
}

function consumeBalloon(balloon: BalloonNode): void {
  const spent = createBalloonVisual(balloon.x, config.altitude, balloon.z, depletedMaterial);
  gridGroup.add(spent.group);
  descendingBalloons.push({
    group: spent.group,
    start: spent.group.position.clone(),
    startedAt: simulationTime,
    landsAt: simulationTime + computedDescentMinutes() * 60,
    driftAngle: Math.random() * Math.PI * 2,
  });

  const ascentMinutes = computedAscentMinutes();
  balloon.status = 'preparing';
  balloon.prepEndsAt = simulationTime + config.replenishmentMinutes * 60;
  balloon.readyAt = balloon.prepEndsAt + ascentMinutes * 60;
  balloon.group.visible = false;
  balloon.group.position.set(balloon.x, 0.8, balloon.z);
  balloon.coverageDisc.visible = false;
}

function makeTrail(color: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
  const line = new THREE.Line(geometry, material);
  movingGroup.add(line);
  return line;
}

function updateTrail(object: MovingObject, position: THREE.Vector3): void {
  object.trailPoints.push(position.clone());
  if (object.trailPoints.length > 70) object.trailPoints.shift();
  object.trail.geometry.dispose();
  object.trail.geometry = new THREE.BufferGeometry().setFromPoints(object.trailPoints);
}

function quadraticPoint(start: THREE.Vector3, control: THREE.Vector3, end: THREE.Vector3, t: number): THREE.Vector3 {
  const inverse = 1 - t;
  return new THREE.Vector3(
    inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
  );
}

function spawnAttack(): void {
  const target = randomCityPoint();
  const angle = Math.random() * Math.PI * 2;
  const lateralDistance = config.cityRadius * (1.15 + Math.random() * 0.5);
  const start = new THREE.Vector3(
    target.x + Math.cos(angle) * lateralDistance,
    Math.max(58, config.altitude + 34),
    target.z + Math.sin(angle) * lateralDistance,
  );
  const duration = 30 + Math.random() * 8;
  const interceptAltitude = Math.max(7, config.altitude - 4);
  const interceptProgress = (start.y - interceptAltitude) / start.y;
  const interceptPoint = start.clone().lerp(target, interceptProgress);
  const totalDistanceMeters = start.distanceTo(target) * 1000;
  const verticalShare = Math.abs(start.y - target.y) / Math.max(0.001, start.distanceTo(target));
  const pathAccelerationMps2 = 9.81 * verticalShare;
  const initialSpeedMps = Math.max(250, (totalDistanceMeters - 0.5 * pathAccelerationMps2 * duration * duration) / duration);
  const interceptDistanceMeters = totalDistanceMeters * interceptProgress;
  const interceptAt = pathAccelerationMps2 > 0.001
    ? (-initialSpeedMps + Math.sqrt(initialSpeedMps * initialSpeedMps + 2 * pathAccelerationMps2 * interceptDistanceMeters)) / pathAccelerationMps2
    : interceptDistanceMeters / initialSpeedMps;
  const selected = selectBalloons(interceptPoint);

  ballisticSequence += 1;
  const ballisticId = `B-${String(ballisticSequence).padStart(3, '0')}`;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8), incomingMaterial.clone());
  mesh.position.copy(start);
  movingGroup.add(mesh);
  const trail = makeTrail(0xff5a62);
  const attack: Attack = {
    telemetryId: ballisticId, kind: 'ballistic', mesh, trail, trailPoints: [start.clone()],
    lastPosition: start.clone(),
    velocityKms: target.clone().sub(start).normalize().multiplyScalar(initialSpeedMps / 1000),
    speedKmh: initialSpeedMps * 3.6,
    start, target, interceptPoint, elapsed: 0, duration, interceptAt,
    totalDistanceMeters, initialSpeedMps, pathAccelerationMps2,
    defended: selected.length > 0, detected: true, interceptors: [],
  };

  for (const balloon of selected) {
    interceptorSequence += 1;
    const interceptorId = `I-${String(interceptorSequence).padStart(3, '0')}`;
    const interceptorMesh = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 10), interceptorMaterial.clone());
    const interceptorStart = new THREE.Vector3(balloon.x, config.altitude - 0.7, balloon.z);
    interceptorMesh.position.copy(interceptorStart);
    movingGroup.add(interceptorMesh);
    const interceptorTrail = makeTrail(0xf4bc5f);
    const direction = interceptPoint.clone().sub(interceptorStart);
    const control = interceptorStart.clone().addScaledVector(direction, 0.42);
    control.y -= Math.max(1.2, Math.abs(direction.y) * 0.28);
    attack.interceptors.push({
      telemetryId: interceptorId,
      kind: 'interceptor',
      mesh: interceptorMesh,
      trail: interceptorTrail,
      trailPoints: [interceptorStart.clone()],
      lastPosition: interceptorStart.clone(),
      velocityKms: new THREE.Vector3(),
      speedKmh: 0,
      start: interceptorStart,
      control,
      end: interceptPoint.clone(),
    });
    consumeBalloon(balloon);
  }

  attacks.push(attack);
  updateCoverage();
  updateFleetStatus();
  logEvent(selected.length ? `Incoming track — ${selected.length} interceptor${selected.length > 1 ? 's' : ''} committed.` : 'Incoming track — no ready interceptor in range.');
}

function spawnEffect(point: THREE.Vector3, color: number, scale = 1, initialVelocity = new THREE.Vector3()): VisualEffect {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.78,
    wireframe: true,
  });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * scale, 2), material);
  mesh.position.copy(point);
  effectsGroup.add(mesh);
  const effect: VisualEffect = {
    mesh,
    life: 0,
    maxLife: scale > 1 ? 1.35 : 1.0,
    velocityKms: initialVelocity.clone(),
    // Quadratic drag expressed as a characteristic stopping distance.
    // Thinner air at greater altitude allows the debris cloud to coast farther.
    dragLengthKm: Math.max(0.6, 0.65 + point.y * 0.09),
  };
  effects.push(effect);
  return effect;
}

function removeMovingObject(object: MovingObject): void {
  movingGroup.remove(object.mesh, object.trail);
  object.mesh.geometry.dispose();
  (object.mesh.material as THREE.Material).dispose();
  object.trail.geometry.dispose();
  (object.trail.material as THREE.Material).dispose();
}

function clearMovingObjects(): void {
  for (const attack of attacks) {
    removeMovingObject(attack);
    attack.interceptors.forEach(removeMovingObject);
  }
  attacks.length = 0;
  expiringTelemetry.length = 0;
}

function resolveAttack(index: number, defended: boolean): void {
  const attack = attacks[index];
  if (defended) {
    hits += 1;
    const ballisticEffect = spawnEffect(attack.interceptPoint, 0xff6f45, 1.35, attack.velocityKms);
    const ballisticTelemetry: ExpiringTelemetry = {
      telemetryId: attack.telemetryId,
      kind: 'ballistic',
      speedKmh: attack.speedKmh,
      altitude: attack.interceptPoint.y,
      status: 'Destroyed',
      life: 0,
      maxLife: ballisticEffect.maxLife,
    };
    ballisticEffect.telemetry = ballisticTelemetry;
    expiringTelemetry.push(ballisticTelemetry);
    attack.interceptors.forEach((interceptor, interceptorIndex) => {
      const offset = new THREE.Vector3((interceptorIndex - 0.5) * 0.55, -0.15, (interceptorIndex - 0.5) * -0.35);
      const interceptorEffect = spawnEffect(
        attack.interceptPoint.clone().add(offset),
        0xf4bc5f,
        0.78,
        interceptor.velocityKms,
      );
      const interceptorTelemetry: ExpiringTelemetry = {
        telemetryId: interceptor.telemetryId,
        kind: 'interceptor',
        speedKmh: interceptor.speedKmh,
        altitude: attack.interceptPoint.y,
        status: 'Expended',
        life: 0,
        maxLife: interceptorEffect.maxLife,
      };
      interceptorEffect.telemetry = interceptorTelemetry;
      expiringTelemetry.push(interceptorTelemetry);
    });
    logEvent('Ballistic intercepted below the fleet layer.');
  } else {
    misses += 1;
    const impactEffect = spawnEffect(attack.target, 0xff4e57, 1.65, attack.velocityKms);
    const impactTelemetry: ExpiringTelemetry = {
      telemetryId: attack.telemetryId,
      kind: 'ballistic',
      speedKmh: attack.speedKmh,
      altitude: 0,
      status: 'Impact',
      life: 0,
      maxLife: impactEffect.maxLife,
    };
    impactEffect.telemetry = impactTelemetry;
    expiringTelemetry.push(impactTelemetry);
    logEvent('Impact inside the protected area. Coverage hole exposed.');
  }
  removeMovingObject(attack);
  attack.interceptors.forEach(removeMovingObject);
  attacks.splice(index, 1);
  updateScore();
}

function updateAttacks(delta: number): void {
  for (let index = attacks.length - 1; index >= 0; index -= 1) {
    const attack = attacks[index];
    attack.elapsed += delta;
    const elapsed = Math.min(attack.duration, attack.elapsed);
    const traveledMeters = attack.initialSpeedMps * elapsed + 0.5 * attack.pathAccelerationMps2 * elapsed * elapsed;
    const progress = Math.min(1, traveledMeters / attack.totalDistanceMeters);
    const attackPosition = attack.start.clone().lerp(attack.target, progress);
    attack.mesh.position.copy(attackPosition);
    attack.speedKmh = (attack.initialSpeedMps + attack.pathAccelerationMps2 * elapsed) * 3.6;
    attack.velocityKms.copy(attack.target).sub(attack.start).normalize().multiplyScalar(attack.speedKmh / 3600);
    attack.lastPosition.copy(attackPosition);
    updateTrail(attack, attackPosition);

    const interceptorTimeProgress = Math.min(1, attack.elapsed / attack.interceptAt);
    const interceptorProgress = interceptorTimeProgress * interceptorTimeProgress;
    for (const interceptor of attack.interceptors) {
      const position = quadraticPoint(interceptor.start, interceptor.control, interceptor.end, interceptorProgress);
      if (delta > 0) {
        interceptor.velocityKms.copy(position).sub(interceptor.lastPosition).divideScalar(delta);
        interceptor.speedKmh = interceptor.velocityKms.length() * 3600;
      }
      interceptor.mesh.position.copy(position);
      const tangent = quadraticPoint(interceptor.start, interceptor.control, interceptor.end, Math.min(1, interceptorProgress + 0.015)).sub(position).normalize();
      interceptor.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      updateTrail(interceptor, position);
      interceptor.lastPosition.copy(position);
    }

    if (attack.defended && attack.elapsed >= attack.interceptAt) resolveAttack(index, true);
    else if (!attack.defended && attack.elapsed >= attack.duration) resolveAttack(index, false);
  }
}

function updateBalloons(): void {
  let changed = false;
  for (const balloon of balloons) {
    if (balloon.status === 'preparing' && simulationTime >= balloon.prepEndsAt) {
      balloon.status = 'ascending';
      balloon.group.visible = true;
      balloon.envelope.material.dispose();
      balloon.envelope.material = depletedMaterial.clone();
      changed = true;
    }
    if (balloon.status === 'ascending') {
      const duration = Math.max(1, balloon.readyAt - balloon.prepEndsAt);
      const progress = THREE.MathUtils.clamp((simulationTime - balloon.prepEndsAt) / duration, 0, 1);
      balloon.group.position.y = THREE.MathUtils.lerp(0.8, config.altitude, progress);
      if (progress >= 1) {
        balloon.status = 'ready';
        balloon.envelope.material.dispose();
        balloon.envelope.material = readyMaterial.clone();
        balloon.coverageDisc.visible = true;
        changed = true;
      }
    }
  }
  if (changed) {
    updateCoverage();
    updateFleetStatus();
  }
}

function updateDescendingBalloons(): void {
  let landed = false;
  for (let index = descendingBalloons.length - 1; index >= 0; index -= 1) {
    const descending = descendingBalloons[index];
    const duration = Math.max(1, descending.landsAt - descending.startedAt);
    const progress = THREE.MathUtils.clamp((simulationTime - descending.startedAt) / duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const drift = Math.sin(progress * Math.PI) * 0.85;
    descending.group.position.set(
      descending.start.x + Math.cos(descending.driftAngle) * drift,
      THREE.MathUtils.lerp(descending.start.y, 0.55, eased),
      descending.start.z + Math.sin(descending.driftAngle) * drift,
    );
    descending.group.rotation.z = Math.sin(progress * Math.PI * 4) * 0.04;
    if (progress >= 1) {
      gridGroup.remove(descending.group);
      disposeGroup(descending.group);
      descendingBalloons.splice(index, 1);
      landed = true;
    }
  }
  if (landed) updateFleetStatus();
}

function advanceSimulation(delta: number): void {
  simulationTime += delta;
  if (config.attackRate > 0 && simulationTime >= nextAttackAt) {
    spawnAttack();
    scheduleNextAttack();
  }
  updateAttacks(delta);
  updateBalloons();
  updateDescendingBalloons();
}

function scheduleNextAttack(): void {
  if (config.attackRate <= 0) {
    nextAttackAt = Number.POSITIVE_INFINITY;
    return;
  }
  const meanSeconds = 3600 / config.attackRate;
  const interval = -Math.log(Math.max(1e-8, 1 - Math.random())) * meanSeconds;
  nextAttackAt = simulationTime + interval;
}

function updateEffects(animationDelta: number, physicsDelta: number): void {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    effect.life += animationDelta;
    const speedKms = effect.velocityKms.length();
    if (speedKms > 0.0001 && physicsDelta > 0) {
      const dragRatio = speedKms * physicsDelta / effect.dragLengthKm;
      const distanceKm = effect.dragLengthKm * Math.log1p(dragRatio);
      effect.mesh.position.addScaledVector(effect.velocityKms, distanceKm / speedKms);
      effect.velocityKms.multiplyScalar(1 / (1 + dragRatio));
    }
    if (effect.telemetry) {
      effect.telemetry.speedKmh = effect.velocityKms.length() * 3600;
      effect.telemetry.altitude = effect.mesh.position.y;
    }
    const progress = effect.life / effect.maxLife;
    effect.mesh.scale.setScalar(1 + progress * 2.2);
    (effect.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - progress));
    if (progress >= 1) {
      effectsGroup.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      (effect.mesh.material as THREE.Material).dispose();
      effects.splice(index, 1);
    }
  }
  for (let index = expiringTelemetry.length - 1; index >= 0; index -= 1) {
    expiringTelemetry[index].life += animationDelta;
    if (expiringTelemetry[index].life >= expiringTelemetry[index].maxLife) {
      expiringTelemetry.splice(index, 1);
    }
  }
}

function computedAscentMinutes(): number {
  return config.altitude * 1000 / 5 / 60;
}

function computedDescentMinutes(): number {
  return config.altitude * 1000 / 3 / 60;
}

function updateCoverage(): void {
  const samples: THREE.Vector2[] = [];
  const divisions = 62;
  for (let xi = 0; xi <= divisions; xi += 1) {
    for (let zi = 0; zi <= divisions; zi += 1) {
      const x = -config.cityRadius + (2 * config.cityRadius * xi) / divisions;
      const z = -config.cityRadius + (2 * config.cityRadius * zi) / divisions;
      if (pointInsideCity(x, z)) samples.push(new THREE.Vector2(x, z));
    }
  }
  let protectedPoints = 0;
  let totalDepth = 0;
  for (const sample of samples) {
    let depth = 0;
    for (const balloon of balloons) {
      if (balloon.status !== 'ready') continue;
      if (Math.hypot(sample.x - balloon.x, sample.y - balloon.z) <= config.range) depth += 1;
    }
    if (depth > 0) protectedPoints += 1;
    totalDepth += depth;
  }
  const coverage = samples.length ? protectedPoints / samples.length * 100 : 0;
  const averageDepth = samples.length ? totalDepth / samples.length : 0;
  requireElement('coverage-output').textContent = `${coverage.toFixed(1)}%`;
  requireElement('coverage-caption').textContent = `${(100 - coverage).toFixed(1)}% unprotected`;
  requireElement('depth-output').textContent = averageDepth.toFixed(2);
}

function updateFleetStatus(): void {
  const ready = balloons.filter((balloon) => balloon.status === 'ready').length;
  const ascending = balloons.filter((balloon) => balloon.status === 'ascending').length;
  requireElement('ready-output').textContent = String(ready);
  requireElement('ready-caption').textContent = `of ${balloons.length} · ${ascending} rising · ${descendingBalloons.length} recovering`;
  requireElement('fleet-status').textContent = ready === balloons.length ? 'Ready' : `${balloons.length - ready} replenishing`;
}

function updateScore(): void {
  requireElement('hits-output').textContent = String(hits);
  requireElement('misses-output').textContent = String(misses);
}

function calculateCost(): number {
  const factor = config.range / 10;
  return bom.reduce((sum, item) => sum + item.cost * Math.pow(factor, item.exponent), 0);
}

function updateCost(): void {
  const cost = calculateCost();
  requireElement('cost-output').textContent = formatCurrency(cost);
  requireElement('fleet-cost-output').textContent = formatCurrency(cost * balloons.length);
  requireElement('fleet-cost-caption').textContent = `${balloons.length} balloon space${balloons.length === 1 ? '' : 's'}`;
  requireElement('bom-total-output').textContent = formatCurrency(cost);
}

function appendTelemetryCard(
  container: HTMLElement,
  track: Pick<MovingObject, 'telemetryId' | 'kind' | 'speedKmh'> & { altitude: number; status: string; destroyed?: boolean },
): void {
  const card = document.createElement('div');
  card.className = `projectile-card ${track.kind}${track.destroyed ? ' destroyed' : ''}`;

  const identity = document.createElement('div');
  identity.className = 'projectile-identity';
  const name = document.createElement('strong');
  name.textContent = track.telemetryId;
  const status = document.createElement('em');
  status.textContent = track.status;
  identity.append(name, status);

  const speed = document.createElement('div');
  speed.className = 'projectile-speed';
  const speedValue = document.createElement('b');
  speedValue.textContent = `${Math.round(Math.max(0, track.speedKmh)).toLocaleString()} km/h`;
  const speedLabel = document.createElement('label');
  speedLabel.textContent = 'Speed';
  speed.append(speedValue, speedLabel);

  const altitude = document.createElement('div');
  altitude.className = 'projectile-altitude';
  const altitudeValue = document.createElement('b');
  altitudeValue.textContent = `${Math.max(0, track.altitude).toFixed(1)} km`;
  const altitudeLabel = document.createElement('label');
  altitudeLabel.textContent = 'Altitude';
  altitude.append(altitudeValue, altitudeLabel);
  card.append(identity, speed, altitude);
  container.append(card);
}

function updateProjectileTelemetry(): void {
  const container = requireElement('projectile-list');
  container.replaceChildren();
  let count = 0;
  for (const attack of attacks) {
    appendTelemetryCard(container, {
      telemetryId: attack.telemetryId,
      kind: attack.kind,
      speedKmh: attack.speedKmh,
      altitude: attack.mesh.position.y,
      status: attack.detected ? 'Tracked' : 'Undetected',
    });
    count += 1;
    for (const interceptor of attack.interceptors) {
      appendTelemetryCard(container, {
        telemetryId: interceptor.telemetryId,
        kind: interceptor.kind,
        speedKmh: interceptor.speedKmh,
        altitude: interceptor.mesh.position.y,
        status: 'Active',
      });
      count += 1;
    }
  }
  for (const telemetry of expiringTelemetry) {
    appendTelemetryCard(container, { ...telemetry, destroyed: true });
    count += 1;
  }
  if (count === 0) {
    const empty = document.createElement('div');
    empty.className = 'projectile-empty';
    empty.textContent = 'No active tracks';
    container.append(empty);
  }
}

function logEvent(message: string): void {
  requireElement('event-log').textContent = `${formatSimulationTime(simulationTime)} — ${message}`;
}

function resizeRenderer(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
  }
  camera.aspect = Math.max(0.1, width / Math.max(1, height));
  camera.updateProjectionMatrix();
}

function animate(now: number): void {
  const realDelta = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  const simulatedDelta = paused ? 0 : realDelta * config.speed;
  if (!paused) {
    let remaining = simulatedDelta;
    while (remaining > 0) {
      const step = Math.min(1, remaining);
      advanceSimulation(step);
      remaining -= step;
    }
  }
  updateEffects(realDelta, simulatedDelta);
  updateProjectileTelemetry();
  requireElement('sim-time').textContent = formatSimulationTime(simulationTime);
  resizeRenderer();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateControlOutputs(): void {
  requireElement('city-radius-output').textContent = `${config.cityRadius} km`;
  requireElement('spacing-output').textContent = `${config.spacing} km`;
  requireElement('range-output').textContent = `${config.range} km`;
  requireElement('altitude-output').textContent = `${config.altitude} km`;
  requireElement('attack-output').textContent = `${config.attackRate} / hr`;
  requireElement('replenishment-output').textContent = `${config.replenishmentMinutes} min`;
  requireElement('speed-output').textContent = `${config.speed}×`;
  requireElement('ascent-output').textContent = `${Math.round(computedAscentMinutes())} min`;
  requireElement('replacement-output').textContent = `${Math.round(config.replenishmentMinutes + computedAscentMinutes())} min`;
  requireElement('descent-output').textContent = `${Math.round(computedDescentMinutes())} min`;
}

function bindRange(id: string, key: keyof Configuration, resetGeometry: boolean): void {
  requireElement<HTMLInputElement>(id).addEventListener('input', () => {
    (config[key] as number) = readNumber(id);
    updateControlOutputs();
    if (resetGeometry) {
      if (key === 'cityRadius') rebuildCity();
      if (key === 'range') updateCost();
      rebuildGrid('Geometry changed — fleet reset.');
      const distance = Math.max(36, config.cityRadius * 2.25);
      camera.position.set(distance * 0.7, Math.max(35, config.altitude * 2), distance);
      controls.target.set(0, config.altitude * 0.32, 0);
    } else if (key === 'attackRate') {
      scheduleNextAttack();
    }
  });
}

function buildBomFields(): void {
  const container = requireElement('bom-fields');
  container.replaceChildren();
  for (const item of bom) {
    const wrapper = document.createElement('div');
    wrapper.className = 'bom-field';
    const label = document.createElement('label');
    label.htmlFor = `bom-${item.key}`;
    label.innerHTML = `<span>${item.label}</span>${item.exponent > 0 ? '<small>range-scaled</small>' : ''}`;
    const input = document.createElement('input');
    input.id = `bom-${item.key}`;
    input.name = item.key;
    input.type = 'number';
    input.min = '0';
    input.step = '100';
    input.value = String(item.cost);
    input.addEventListener('input', () => {
      const draft = bom.map((entry) => entry.key === item.key ? { ...entry, cost: Math.max(0, Number(input.value) || 0) } : entry);
      const factor = config.range / 10;
      const total = draft.reduce((sum, entry) => sum + entry.cost * Math.pow(factor, entry.exponent), 0);
      requireElement('bom-total-output').textContent = formatCurrency(total);
    });
    wrapper.append(label, input);
    container.append(wrapper);
  }
}

bindRange('city-radius', 'cityRadius', true);
bindRange('spacing', 'spacing', true);
bindRange('range', 'range', true);
bindRange('altitude', 'altitude', true);
bindRange('attack-rate', 'attackRate', false);
bindRange('replenishment', 'replenishmentMinutes', false);
bindRange('speed', 'speed', false);

document.querySelectorAll<HTMLInputElement>('input[name="shape"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    config.cityShape = input.value as CityShape;
    rebuildCity();
    rebuildGrid('City shape changed — fleet reset.');
  });
});

document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    config.mode = input.value as InterceptionMode;
    logEvent(`Interception policy changed to ${input.value}.`);
  });
});

requireElement<HTMLButtonElement>('pause-button').addEventListener('click', () => {
  paused = !paused;
  const button = requireElement<HTMLButtonElement>('pause-button');
  button.textContent = paused ? 'Resume' : 'Pause';
  button.setAttribute('aria-pressed', String(paused));
  logEvent(paused ? 'Simulation paused.' : 'Simulation resumed.');
});

requireElement<HTMLButtonElement>('reset-score').addEventListener('click', () => {
  hits = 0;
  misses = 0;
  updateScore();
  logEvent('Hit and impact counters reset.');
});

const bomDialog = requireElement<HTMLDialogElement>('bom-dialog');
requireElement<HTMLButtonElement>('edit-bom').addEventListener('click', () => {
  buildBomFields();
  updateCost();
  bomDialog.showModal();
});

requireElement<HTMLButtonElement>('restore-bom').addEventListener('click', () => {
  bom = defaultBom.map((item) => ({ ...item }));
  buildBomFields();
  updateCost();
});

requireElement<HTMLFormElement>('bom-form').addEventListener('submit', (event) => {
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
  if (submitter?.value === 'cancel') return;
  bom = bom.map((item) => ({
    ...item,
    cost: Math.max(0, Number(requireElement<HTMLInputElement>(`bom-${item.key}`).value) || 0),
  }));
  updateCost();
  logEvent('Bill of materials updated.');
});

window.addEventListener('resize', resizeRenderer);

updateControlOutputs();
rebuildCity();
rebuildGrid();
scheduleNextAttack();
updateScore();
requestAnimationFrame(animate);
