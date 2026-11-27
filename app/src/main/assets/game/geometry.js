// Small static mesh batches keep the streets and vehicle details inexpensive to draw.
import * as THREE from './vendor/three.module.js';

const colors = new Map();
function rgb(value) {
  if (value && value.isColor) return value;
  if (!colors.has(value)) colors.set(value, new THREE.Color(value));
  return colors.get(value);
}

export class Geometry {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.uvs = [];
    this.indices = [];
  }

  quad(a, b, c, d, color, repeatX = 1, repeatY = 1) {
    const first = this.positions.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const scale = Math.hypot(nx, ny, nz) || 1;
    nx /= scale; ny /= scale; nz /= scale;
    const tint = rgb(color);
    const triangle = d === a;
    for (const p of triangle ? [a, b, c] : [a, b, c, d]) {
      this.positions.push(...p);
      this.normals.push(nx, ny, nz);
      this.colors.push(tint.r, tint.g, tint.b);
    }
    this.uvs.push(0, 0, repeatX, 0, repeatX, repeatY);
    this.indices.push(first, first + 1, first + 2);
    if (!triangle) {
      this.uvs.push(0, repeatY);
      this.indices.push(first, first + 2, first + 3);
    }
  }

  box(x, y, z, w, h, d, color, yaw = 0) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const corner = (i, j, k) => [x + (i*w*cs + k*d*sn)*0.5, y+j*h*0.5, z + (k*d*cs-i*w*sn)*0.5];
    const a=corner(-1,-1,1), b=corner(1,-1,1), c=corner(1,1,1), e=corner(-1,1,1);
    const f=corner(1,-1,-1), g=corner(-1,-1,-1), i=corner(-1,1,-1), j=corner(1,1,-1);
    this.quad(a,b,c,e,color); this.quad(b,f,j,c,color); this.quad(f,g,i,j,color);
    this.quad(g,a,e,i,color); this.quad(e,c,j,i,color); this.quad(g,f,b,a,color);
  }

  floor(x, z, w, d, color, y = 0.025, repeatX = 1, repeatY = 1) {
    this.quad([x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2],[x-w/2,y,z-d/2],color,repeatX,repeatY);
  }

  // Rings use clockwise order viewed from below, beginning at front-left on a box.
  rings(lower, upper, color) {
    for (let i=0; i<lower.length; i++) {
      const next=(i+1)%lower.length;
      this.quad(lower[i],lower[next],upper[next],upper[i],color);
    }
  }

  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

export function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function canvasTexture(canvas, tile = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (tile) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
