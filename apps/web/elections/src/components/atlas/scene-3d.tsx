"use client";

import { useEffect, useRef } from "react";
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Shape,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Rgb } from "@/data/atlas-encode";
import type { Ring } from "@/data/types";

export interface SceneRegion {
  height: number;
  key: string;
  rgb: Rgb;
  rings: Ring[];
  selected?: boolean;
}

interface Props {
  bbox: { x0: number; x1: number; y0: number; y1: number };
  /** Colour of land, sea and edges, from the palette. */
  colours: { edge: Rgb; land: Rgb; sea: Rgb };
  inset: { x0: number; x1: number; y0: number; y1: number };
  land: Ring[];
  onPick: (key: string | null) => void;
  regions: SceneRegion[];
}

interface Built {
  group: Group;
  height: number;
  material: MeshStandardMaterial;
  meshes: Mesh[];
}

/** Prisms still tweening; the render loop keeps running while any are. */
let animating = 0;

const shape = (ring: Ring) =>
  new Shape(ring.map(([x, y]) => new Vector2(x, y)));

/**
 * The 3D atlas: each region is an extruded prism whose colour and height
 * come from the map mode. It renders only while something is moving, and
 * honours reduced-motion by skipping the tween.
 */
export function Scene3D({
  regions,
  land,
  inset,
  bbox,
  colours,
  onPick,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    built: Map<string, Built>;
    camera: PerspectiveCamera;
    controls: OrbitControls;
    kick: () => void;
    renderer: WebGLRenderer;
    scene: Scene;
  } | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  // Set up once: land, colours and the inset are fixed for the page's life.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately runs once
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true });
    } catch {
      el.textContent =
        "This browser couldn’t start the 3D map. Use the Flat view or the list.";
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new Scene();
    scene.background = new Color(...colours.sea);
    scene.add(new HemisphereLight(0xff_ff_ff, 0x7d_88_94, 0.9));
    const sun = new DirectionalLight(0xff_ff_ff, 1.4);
    sun.position.set(-30, 60, 26);
    scene.add(sun);
    const landMat = new MeshStandardMaterial({
      color: new Color(...colours.land),
      roughness: 1,
    });
    for (const ring of land) {
      const m = new Mesh(
        new ExtrudeGeometry(shape(ring), {
          depth: 0.1,
          bevelEnabled: false,
        }),
        landMat
      );
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
    }
    const insetLine = new Line(
      new BufferGeometry().setFromPoints(
        [
          [inset.x0, inset.y0],
          [inset.x1, inset.y0],
          [inset.x1, inset.y1],
          [inset.x0, inset.y1],
          [inset.x0, inset.y0],
        ].map(([x = 0, y = 0]) => new Vector3(x, 0.02, -y))
      ),
      new LineBasicMaterial({ color: new Color(...colours.edge) })
    );
    scene.add(insetLine);
    const camera = new PerspectiveCamera(30, 1, 0.5, 600);
    const controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, {
      enableDamping: true,
      dampingFactor: 0.09,
      maxPolarAngle: 1.15,
      minDistance: 6,
      maxDistance: 160,
      screenSpacePanning: false,
    });

    let looping = false;
    const tick = () => {
      const moved = controls.update();
      renderer.render(scene, camera);
      if (moved || animating > 0) requestAnimationFrame(tick);
      else looping = false;
    };
    const kick = () => {
      if (!looping) {
        looping = true;
        requestAnimationFrame(tick);
      }
    };
    controls.addEventListener("change", kick);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!(w && h)) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      kick();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    const ray = new Raycaster();
    const pointer = new Vector2();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6)
        return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1
      );
      ray.setFromCamera(pointer, camera);
      const meshes = [...(api.current?.built.values() ?? [])].flatMap((b) =>
        b.group.visible ? b.meshes : []
      );
      const hit = ray.intersectObjects(meshes, false)[0];
      pickRef.current((hit?.object.userData.key as string | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    api.current = { renderer, scene, camera, controls, built: new Map(), kick };
    resize();
    return () => {
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);

  // Regions: create missing prisms, then tween every prism to its new colour and height.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const wanted = new Set(regions.map((r) => r.key));
    for (const [key, b] of a.built) b.group.visible = wanted.has(key);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    for (const r of regions) {
      let b = a.built.get(r.key);
      if (!b) {
        const material = new MeshStandardMaterial({
          color: new Color(...r.rgb),
          roughness: 0.78,
        });
        const group = new Group();
        group.position.y = 0.1;
        const edge = new LineBasicMaterial({
          color: 0xff_ff_ff,
          transparent: true,
          opacity: 0.85,
        });
        const meshes = r.rings.map((ring) => {
          const g = new ExtrudeGeometry(shape(ring), {
            depth: 1,
            bevelEnabled: false,
          });
          const m = new Mesh(g, material);
          m.rotation.x = -Math.PI / 2;
          m.scale.z = 0.01;
          m.userData.key = r.key;
          m.add(new LineSegments(new EdgesGeometry(g, 40), edge));
          group.add(m);
          return m;
        });
        a.scene.add(group);
        b = { group, material, meshes, height: 0.01 };
        a.built.set(r.key, b);
      }
      const built = b;
      built.group.visible = true;
      const from = built.material.color.clone();
      const to = new Color(...r.rgb);
      const h0 = built.height;
      const h1 = Math.max(0.01, r.height + (r.selected ? 0.35 : 0));
      built.material.emissive.setHex(r.selected ? 0x22_22_22 : 0);
      const apply = (t: number) => {
        built.material.color.copy(from).lerp(to, t);
        built.height = h0 + (h1 - h0) * t;
        for (const m of built.meshes) m.scale.z = built.height;
      };
      if (reduce) {
        apply(1);
        continue;
      }
      animating++;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 700);
        apply(1 - (1 - t) ** 3);
        if (t < 1) requestAnimationFrame(step);
        else animating--;
      };
      requestAnimationFrame(step);
    }
    a.kick();
  }, [regions]);

  // Camera: frame the bounding box.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    const cx = (bbox.x0 + bbox.x1) / 2;
    const cy = (bbox.y0 + bbox.y1) / 2;
    const w = (bbox.x1 - bbox.x0) * 1.15 + 2;
    const h = (bbox.y1 - bbox.y0) * 1.15 + 2;
    const f = MathUtils.degToRad(a.camera.fov);
    const dist = Math.max(
      (h / (2 * Math.tan(f / 2))) * 0.92,
      w / (2 * Math.tan(f / 2) * (a.camera.aspect || 1))
    );
    a.controls.target.set(cx, 0, -cy + h * 0.04);
    a.camera.position.set(
      cx,
      Math.cos(0.72) * dist,
      -cy + Math.sin(0.72) * dist
    );
    a.camera.lookAt(a.controls.target);
    a.kick();
  }, [bbox]);

  return <div className="absolute inset-0" ref={host} />;
}
