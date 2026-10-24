import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  AlertTriangle,
  Flame,
  Activity,
  Car,
  Compass,
  CheckCircle2,
  Navigation,
  Box,
  Layers,
  Eye,
  Camera,
} from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { subscribeToRealtimeEvent } from '../lib/socket';

interface Simulation3DViewProps {
  onTraceCase?: (caseId: string) => void;
  activeCaseId?: string;
}

// Coordinate projection from 2D coordinates (x, y) [0, 500] to Three.js scene coordinates (X, Y, Z)
function mapTo3D(x: number, y: number): [number, number, number] {
  // Center at NITK Incident Scene (x: 120, y: 150) -> Scene (0, 0, 0)
  const scale = 0.35;
  const sceneX = (x - 200) * scale;
  const sceneZ = (y - 200) * scale;
  return [sceneX, 0, sceneZ];
}

export const Simulation3DView: React.FC<Simulation3DViewProps> = ({ activeCaseId }) => {
  const [simState, setSimState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [is3DMode, setIs3DMode] = useState<boolean>(true);
  const [cameraView, setCameraView] = useState<'follow' | 'isometric' | 'top'>('isometric');

  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simStateRef = useRef<any>(simState);
  useEffect(() => {
    simStateRef.current = simState;
  }, [simState]);

  const cameraViewRef = useRef<'follow' | 'isometric' | 'top'>(cameraView);
  useEffect(() => {
    cameraViewRef.current = cameraView;
  }, [cameraView]);

  const threeStateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    ambulanceMesh?: THREE.Group;
    beaconLight?: THREE.PointLight;
    haloMesh?: THREE.Mesh;
    animFrameId?: number;
    controlsTarget?: THREE.Vector3;
  }>({});

  // Check WebGL availability
  const webGLSupported = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch {
      return false;
    }
  }, []);

  // Fetch initial simulation state
  const fetchState = async () => {
    try {
      const data = await apiClient.getSimulationState();
      setSimState(data);
    } catch (err: any) {
      console.warn('Failed to load simulation state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  // Subscribe to real-time simulation updates
  useEffect(() => {
    const unsubSim = subscribeToRealtimeEvent('simulation.updated', (event: any) => {
      setSimState(event.payload || event);
    });
    const unsubTelemetry = subscribeToRealtimeEvent('ambulance.telemetry', (event: any) => {
      setSimState((prev: any) =>
        prev
          ? {
              ...prev,
              ambulancePosition: event.payload || event,
            }
          : prev
      );
    });

    return () => {
      unsubSim();
      unsubTelemetry();
    };
  }, []);

  // -------------------------------------------------------------
  // Genuine Three.js 3D Scene Initialization & Loop
  // -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasElement || canvasRef.current;
    if (!is3DMode || !webGLSupported || !canvas) return;

    const width = canvas.parentElement?.clientWidth || 800;
    const height = 480;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900 sky / fog
    scene.fog = new THREE.FogExp2(0x0f172a, 0.008);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 1200);
    camera.position.set(0, 75, 110);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Lighting (Golden Hour sun & coastal skylight)
    const sunLight = new THREE.DirectionalLight(0xffedd5, 1.4);
    sunLight.position.set(60, 90, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x0284c7, 0x064e3b, 0.7);
    scene.add(hemiLight);

    // 3. Terrain & Water Mesh (NITK Coastline)
    // Arabian Sea (west / negative X)
    const seaGeometry = new THREE.PlaneGeometry(160, 360);
    const seaMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.88,
    });
    const seaMesh = new THREE.Mesh(seaGeometry, seaMaterial);
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.set(-110, -0.4, 0);
    scene.add(seaMesh);

    // Beach Sand Strip
    const beachGeometry = new THREE.PlaneGeometry(24, 360);
    const beachMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.9,
    });
    const beachMesh = new THREE.Mesh(beachGeometry, beachMaterial);
    beachMesh.rotation.x = -Math.PI / 2;
    beachMesh.position.set(-20, -0.2, 0);
    scene.add(beachMesh);

    // Green Campus Land Plane (NITK Surathkal)
    const landGeometry = new THREE.PlaneGeometry(260, 360);
    const landMaterial = new THREE.MeshStandardMaterial({
      color: 0x064e3b, // Lush deep green
      roughness: 0.85,
    });
    const landMesh = new THREE.Mesh(landGeometry, landMaterial);
    landMesh.rotation.x = -Math.PI / 2;
    landMesh.position.set(115, -0.3, 0);
    landMesh.receiveShadow = true;
    scene.add(landMesh);

    // 4. Roads (NH 66 Corridor & Campus Links)
    const roadGraph = simState.roadGraph || { nodes: [], edges: [] };
    const nodeMap = new Map<string, { x: number; y: number; label: string }>();
    roadGraph.nodes.forEach((n: any) => nodeMap.set(n.id, n));

    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark asphalt
      roughness: 0.7,
    });

    roadGraph.edges.forEach((edge: any) => {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) return;

      const [x1, , z1] = mapTo3D(fromNode.x, fromNode.y);
      const [x2, , z2] = mapTo3D(toNode.x, toNode.y);

      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);

      const roadRibbon = new THREE.Mesh(new THREE.PlaneGeometry(length, 4.2), roadMaterial);
      roadRibbon.rotation.x = -Math.PI / 2;
      roadRibbon.rotation.z = -angle;
      roadRibbon.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
      scene.add(roadRibbon);
    });

    // 5. Buildings (NITK Main Heritage Building, Library, Departments & Hospitals)
    const buildingGroup = new THREE.Group();

    // NITK Administrative Heritage Building
    const heritageGeom = new THREE.BoxGeometry(18, 9, 14);
    const heritageMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 }); // Terracotta
    const heritageMesh = new THREE.Mesh(heritageGeom, heritageMat);
    heritageMesh.position.set(-5, 4.5, -15);
    heritageMesh.castShadow = true;
    buildingGroup.add(heritageMesh);

    // NITK Clock Tower
    const towerGeom = new THREE.BoxGeometry(4.5, 18, 4.5);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c });
    const towerMesh = new THREE.Mesh(towerGeom, towerMat);
    towerMesh.position.set(-5, 9, -15);
    buildingGroup.add(towerMesh);

    // NITK Central Library & Computer Center
    const libGeom = new THREE.BoxGeometry(16, 7, 12);
    const libMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
    const libMesh = new THREE.Mesh(libGeom, libMat);
    libMesh.position.set(16, 3.5, -28);
    buildingGroup.add(libMesh);

    // Campus Academic Blocks (Mechanical / Chemical)
    const deptGeom = new THREE.BoxGeometry(14, 6, 10);
    const deptMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const dept1 = new THREE.Mesh(deptGeom, deptMat);
    dept1.position.set(38, 3, 5);
    buildingGroup.add(dept1);

    const dept2 = new THREE.Mesh(deptGeom, deptMat);
    dept2.position.set(-2, 3, 30);
    buildingGroup.add(dept2);

    scene.add(buildingGroup);

    // 6. Hospital Landmarks (3D Medical Pins & Helipads)
    const hospitalPinGroup = new THREE.Group();
    const hospitalNodes = [
      { id: 'node-hosp-a', label: 'A.J. Hospital (Metro Trauma A)', x: 380, y: 390, color: 0x059669 },
      { id: 'node-hosp-b', label: 'Padmavathi Hospital (Surathkal B)', x: 160, y: 220, color: 0xd97706 },
      { id: 'node-hosp-c', label: 'Srinivas Hospital (Mukka C)', x: 140, y: 80, color: 0x7c3aed },
      { id: 'node-hosp-d', label: 'KMC Heart Institute (Mangaluru D)', x: 430, y: 460, color: 0x2563eb },
      { id: 'node-hosp-e', label: 'NITK Health Care Centre (Campus E)', x: 130, y: 170, color: 0x10b981 },
    ];

    hospitalNodes.forEach((hosp) => {
      const [hx, , hz] = mapTo3D(hosp.x, hosp.y);

      // Hospital Building block
      const hGeom = new THREE.BoxGeometry(14, 10, 14);
      const hMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      const hMesh = new THREE.Mesh(hGeom, hMat);
      hMesh.position.set(hx, 5, hz);
      hMesh.castShadow = true;
      scene.add(hMesh);

      // Rooftop Cross
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 2), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
      crossH.position.set(hx, 10.6, hz);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
      crossV.position.set(hx, 10.6, hz);
      scene.add(crossH);
      scene.add(crossV);

      // Vertical beacon column
      const beaconGeom = new THREE.CylinderGeometry(0.3, 0.3, 40, 8);
      const beaconMat = new THREE.MeshBasicMaterial({
        color: hosp.color,
        transparent: true,
        opacity: 0.6,
      });
      const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
      beaconMesh.position.set(hx, 20, hz);
      scene.add(beaconMesh);
    });

    scene.add(hospitalPinGroup);

    // 7. Vegetation (Trees distributed across campus verges)
    const treeGroup = new THREE.Group();
    const treeTrunkGeom = new THREE.CylinderGeometry(0.4, 0.6, 3, 6);
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const foliageGeom = new THREE.ConeGeometry(2.4, 5, 7);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });

    const treePositions = [
      [8, 5], [12, -8], [24, -12], [-14, 8], [-22, -18],
      [32, 22], [42, -5], [18, 40], [5, -45], [-12, -38],
      [55, 30], [60, -20], [-25, 45], [28, -50], [45, 60]
    ];

    treePositions.forEach(([tx, tz]) => {
      const trunk = new THREE.Mesh(treeTrunkGeom, treeTrunkMat);
      trunk.position.set(tx, 1.5, tz);
      const leaves = new THREE.Mesh(foliageGeom, foliageMat);
      leaves.position.set(tx, 4.8, tz);
      leaves.castShadow = true;
      treeGroup.add(trunk);
      treeGroup.add(leaves);
    });
    scene.add(treeGroup);

    // 8. 3D Emergency Ambulance Vehicle
    const ambulanceGroup = new THREE.Group();

    // Body
    const ambBodyGeom = new THREE.BoxGeometry(3.6, 2.2, 6.4);
    const ambBodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const ambBody = new THREE.Mesh(ambBodyGeom, ambBodyMat);
    ambBody.position.y = 1.4;
    ambBody.castShadow = true;
    ambulanceGroup.add(ambBody);

    // Windshield
    const cabGeom = new THREE.BoxGeometry(3.4, 1.4, 2.2);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
    const cab = new THREE.Mesh(cabGeom, cabMat);
    cab.position.set(0, 1.9, 1.8);
    ambulanceGroup.add(cab);

    // Orange reflective side stripes
    const stripeGeom = new THREE.BoxGeometry(3.64, 0.45, 6.2);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf97316 });
    const stripe = new THREE.Mesh(stripeGeom, stripeMat);
    stripe.position.y = 1.2;
    ambulanceGroup.add(stripe);

    // Flashing Beacon Light
    const beaconLight = new THREE.PointLight(0xef4444, 3, 20);
    beaconLight.position.set(0, 3.2, 0);
    ambulanceGroup.add(beaconLight);

    const lightbar = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.3, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    lightbar.position.set(0, 2.6, 0.2);
    ambulanceGroup.add(lightbar);

    // 8b. Screen-space glowing beacon halo ring (Stage 10)
    const haloGeom = new THREE.TorusGeometry(3.2, 0.35, 8, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const haloMesh = new THREE.Mesh(haloGeom, haloMat);
    haloMesh.rotation.x = Math.PI / 2;
    haloMesh.position.set(0, 4.5, 0);
    ambulanceGroup.add(haloMesh);

    // Initial positioning: snap immediately to current telemetry without easing from world origin
    const initialPos = simStateRef.current?.ambulancePosition;
    if (initialPos) {
      const [ix, , iz] = mapTo3D(initialPos.x, initialPos.y);
      ambulanceGroup.position.set(ix, 0, iz);
      if (typeof initialPos.heading === 'number') {
        ambulanceGroup.rotation.y = ((90 - initialPos.heading) * Math.PI) / 180;
      }
    }

    scene.add(ambulanceGroup);

    // Store references
    threeStateRef.current = {
      renderer,
      scene,
      camera,
      ambulanceMesh: ambulanceGroup,
      beaconLight,
      haloMesh,
    };

    // Animation Loop
    let clock = new THREE.Clock();
    const animate = () => {
      threeStateRef.current.animFrameId = requestAnimationFrame(animate);

      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Flashing beacon & pulsing halo
      if (beaconLight) {
        beaconLight.color.setHex(Math.sin(elapsed * 12) > 0 ? 0xef4444 : 0x3b82f6);
      }
      haloMat.opacity = 0.5 + 0.4 * Math.sin(elapsed * 6);

      // Read dynamic state from refs to prevent scene disposal
      const currentPos = simStateRef.current?.ambulancePosition;
      const currentCameraView = cameraViewRef.current;

      if (currentPos && ambulanceGroup) {
        const [targetX, , targetZ] = mapTo3D(currentPos.x, currentPos.y);

        // Frame-rate independent exponential smoothing (Stage 10.12)
        const alpha = 1 - Math.exp(-6.0 * delta);
        ambulanceGroup.position.x += (targetX - ambulanceGroup.position.x) * alpha;
        ambulanceGroup.position.z += (targetZ - ambulanceGroup.position.z) * alpha;

        // Rotation from heading with shortest angle smoothing (Stage 10.13)
        if (typeof currentPos.heading === 'number') {
          const targetRad = ((90 - currentPos.heading) * Math.PI) / 180;
          let diff = ((targetRad - ambulanceGroup.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
          ambulanceGroup.rotation.y += diff * (1 - Math.exp(-8.0 * delta));
        }

        // Camera follow modes
        if (currentCameraView === 'follow') {
          const camAlpha = 1 - Math.exp(-4.5 * delta);
          camera.position.x += (ambulanceGroup.position.x - camera.position.x) * camAlpha;
          camera.position.z += (ambulanceGroup.position.z + 52 - camera.position.z) * camAlpha;
          camera.position.y = 38;
          camera.lookAt(ambulanceGroup.position.x, 2, ambulanceGroup.position.z);
        } else if (currentCameraView === 'top') {
          camera.position.set(ambulanceGroup.position.x, 140, ambulanceGroup.position.z);
          camera.lookAt(ambulanceGroup.position.x, 0, ambulanceGroup.position.z);
        } else {
          // Isometric view
          camera.position.set(0, 85, 115);
          camera.lookAt(15, 0, 10);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!canvas.parentElement) return;
      const w = canvas.parentElement.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (threeStateRef.current.animFrameId) {
        cancelAnimationFrame(threeStateRef.current.animFrameId);
      }
      renderer.dispose();
      scene.clear();
    };
  }, [is3DMode, webGLSupported, canvasElement]);

  // Simulation Controls
  const handlePlay = async () => {
    try {
      const res = await apiClient.playSimulation(speedMultiplier);
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Simulation started');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handlePause = async () => {
    try {
      const res = await apiClient.pauseSimulation();
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Simulation paused');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleStep = async () => {
    try {
      const res = await apiClient.stepSimulation(5);
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Stepped forward +5s');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleSpeedChange = async (speed: number) => {
    setSpeedMultiplier(speed);
    try {
      const res = await apiClient.setSimulationSpeed(speed);
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast(`Speed set to ${speed}x`);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleReset = async () => {
    try {
      const res = await apiClient.resetSimulation();
      setSimState((prev: any) => (prev ? { ...prev, simulationRun: res.simulationRun } : prev));
      showToast('Simulation reset to origin');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleInjectTraffic = async () => {
    try {
      await apiClient.injectTrafficScenario('edge-1', 3.5);
      fetchState();
      showToast('Traffic congestion (+350%) injected on NH 66 corridor (3.5x multiplier)');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleInjectSurge = async () => {
    try {
      await apiClient.injectHospitalSurgeScenario('hosp-001');
      fetchState();
      showToast('Hospital intake surge (+15m delay) injected at St. Jude / A.J. Hospital');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleInjectDecomp = async () => {
    if (!activeCaseId) {
      showToast('No active case selected for decompensation scenario');
      return;
    }
    try {
      await apiClient.injectDecompensationScenario(activeCaseId);
      fetchState();
      showToast('Patient acute decompensation (SpO2 82%) injected!');
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  if (loading || !simState) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
        <Compass className="w-8 h-8 animate-spin mx-auto text-[#176B68] mb-2" />
        Loading Connected 3D Simulation Engine...
      </div>
    );
  }

  const ambulancePosition = simState?.ambulancePosition || {
    x: 120,
    y: 150,
    lat: 13.0110,
    lng: 74.7943,
    heading: 85,
    speed: 0,
    serverSequence: 1,
  };
  const simulationRun = simState?.simulationRun || {
    running: false,
    speedMultiplier: 1.0,
    simulatedSeconds: 0,
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg space-y-4 p-5">
      {/* Header and Control Strip */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-400" />
              Connected 3D Digital Twin & Live Network Simulation (NITK Surathkal 3D Environment)
            </h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                simulationRun?.running
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {simulationRun?.running ? 'ACTIVE RUN' : 'PAUSED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real spatial context: NH 66 Corridor, Arabian Sea coastline, campus heritage blocks, and regional medical centers.
          </p>
        </div>

        {/* View Mode & Camera Selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 3D vs 2D Fallback Toggle */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setIs3DMode(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                is3DMode && webGLSupported
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              Genuine 3D
            </button>
            <button
              onClick={() => setIs3DMode(false)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition ${
                !is3DMode || !webGLSupported
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              2D Schematic
            </button>
          </div>

          {/* Camera Angles (in 3D Mode) */}
          {is3DMode && webGLSupported && (
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                onClick={() => setCameraView('follow')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition ${
                  cameraView === 'follow' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Follow ambulance vehicle"
              >
                <Camera className="w-3.5 h-3.5" />
                Follow
              </button>
              <button
                onClick={() => setCameraView('isometric')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition ${
                  cameraView === 'isometric' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Isometric view"
              >
                <Eye className="w-3.5 h-3.5" />
                Isometric
              </button>
              <button
                onClick={() => setCameraView('top')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition ${
                  cameraView === 'top' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Top-down overview"
              >
                Top-Down
              </button>
              <button
                onClick={() => {
                  setCameraView('follow');
                  const pos = simState?.ambulancePosition;
                  if (pos && threeStateRef.current.camera && threeStateRef.current.ambulanceMesh) {
                    const [ax, , az] = mapTo3D(pos.x, pos.y);
                    threeStateRef.current.camera.position.set(ax, 38, az + 52);
                    threeStateRef.current.camera.lookAt(ax, 2, az);
                  }
                  showToast('Camera locked onto ambulance');
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium text-cyan-400 hover:text-cyan-300 hover:bg-slate-700 transition"
                title="Locate ambulance vehicle in 3D scene"
              >
                <Navigation className="w-3.5 h-3.5" />
                Locate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Simulation Viewport (Genuine Three.js 3D Canvas or 2D SVG Fallback) */}
      <div className="relative w-full h-[480px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
        {is3DMode && webGLSupported ? (
          <canvas
            ref={(el) => {
              canvasRef.current = el;
              setCanvasElement(el);
            }}
            className="w-full h-full block cursor-grab active:cursor-grabbing"
          />
        ) : (
          /* 2D Fallback SVG Rendering */
          <div className="w-full h-full p-4 relative flex items-center justify-center bg-slate-900">
            <svg viewBox="0 0 500 500" className="w-full h-full max-w-[480px] max-h-[480px]">
              {/* Arabian Sea to West */}
              <rect x="0" y="0" width="100" height="500" fill="#0284C7" opacity="0.3" />
              <text x="25" y="250" fill="#38BDF8" fontSize="10" fontWeight="bold" transform="rotate(-90 25,250)">
                Arabian Sea Coastline
              </text>

              {/* Land */}
              <rect x="100" y="0" width="400" height="500" fill="#064E3B" opacity="0.2" />

              {/* Roads */}
              {simState.roadGraph?.edges?.map((edge: any) => {
                const from = simState.roadGraph.nodes.find((n: any) => n.id === edge.from);
                const to = simState.roadGraph.nodes.find((n: any) => n.id === edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={edge.id}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#475569"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Hospital Nodes */}
              {simState.roadGraph?.nodes?.map((node: any) => {
                const isHosp = node.id.includes('hosp');
                const label =
                  node.id === 'node-hosp-a'
                    ? 'A: St. Jude'
                    : node.id === 'node-hosp-b'
                    ? 'B: Bayview'
                    : node.id === 'node-hosp-c'
                    ? 'C: Northpoint'
                    : node.label;
                return (
                  <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                    <circle r={isHosp ? 7 : 4} fill={isHosp ? '#10B981' : '#94A3B8'} />
                    <text y="-9" fontSize="8" fill="#F8FAFC" textAnchor="middle" fontWeight="bold">
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Ambulance Vehicle in 2D */}
              <g transform={`translate(${ambulancePosition.x}, ${ambulancePosition.y})`}>
                <circle r="9" fill="#EF4444" className="animate-ping opacity-75" />
                <circle r="6" fill="#DC2626" />
                <text y="14" fontSize="9" fill="#FCA5A5" textAnchor="middle" fontWeight="bold">
                  Medic 104
                </text>
              </g>
            </svg>
          </div>
        )}

        {/* Telemetry HUD Overlay */}
        <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white space-y-1 shadow-lg pointer-events-none">
          <div className="flex items-center gap-2">
            <Car className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-bold tracking-wider">AMBULANCE TELEMETRY</span>
          </div>
          <div className="text-[11px] text-slate-300 font-mono">
            Coord: ({Math.round(ambulancePosition.x)}, {Math.round(ambulancePosition.y)}) • [{ambulancePosition.lat?.toFixed(4)}° N, {ambulancePosition.lng?.toFixed(4)}° E]
          </div>
          <div className="text-[10px] text-slate-400">
            Speed: {Math.round(ambulancePosition.speed || 0)} km/h • Heading: {ambulancePosition.heading}° • {simulationRun.simulatedSeconds || 0}s elapsed
          </div>
        </div>

        {/* Toast Status Notice */}
        {statusMessage && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 border border-emerald-500/40 text-emerald-400 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {statusMessage}
          </div>
        )}
      </div>

      {/* Simulator Control Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-xl border border-slate-700">
          <button
            onClick={simulationRun.running ? handlePause : handlePlay}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${
              simulationRun.running
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {simulationRun.running ? (
              <>
                <Pause className="w-3.5 h-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> Play
              </>
            )}
          </button>
          <button
            onClick={handleStep}
            title="Step +5s"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold"
          >
            <FastForward className="w-3.5 h-3.5" />
            +5s Step
          </button>
          <button
            onClick={handleReset}
            title="Reset to Origin"
            className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Speed Multiplier */}
        <div className="flex items-center justify-between bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700 text-xs">
          <span className="text-slate-400 font-medium">Speed:</span>
          <div className="flex gap-1">
            {[1, 2, 5].map((spd) => (
              <button
                key={spd}
                onClick={() => handleSpeedChange(spd)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  speedMultiplier === spd
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Scenario Injections */}
        <button
          onClick={handleInjectTraffic}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition"
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          Inject Highway Congestion (+350%)
        </button>

        <button
          onClick={handleInjectSurge}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-purple-400" />
          Inject St. Jude ED Surge (+15m)
        </button>

        <button
          onClick={handleInjectDecomp}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition sm:col-span-2 lg:col-span-4"
        >
          <Activity className="w-3.5 h-3.5 text-red-400" />
          Inject Patient Decompensation
        </button>
      </div>
    </div>
  );
};
