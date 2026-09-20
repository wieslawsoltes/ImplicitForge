import { TAU } from '../../kernel/src/index.js';
import { segmentDistance } from '../../field/src/index.js';
/** Lipschitz-normalized nodal functions. Wall isobands are not exact TPMS offsets. */
export function tpms(type, x, y, z, cell, thickness) {
    const k = TAU / cell;
    x *= k;
    y *= k;
    z *= k;
    const sx = Math.sin(x), sy = Math.sin(y), sz = Math.sin(z), cx = Math.cos(x), cy = Math.cos(y), cz = Math.cos(z);
    let f, L;
    if (type === 'gyroid') {
        f = sx * cy + sy * cz + sz * cx;
        L = Math.sqrt(12);
    }
    else if (type === 'schwarz') {
        f = cx + cy + cz;
        L = Math.sqrt(3);
    }
    else if (type === 'diamond') {
        f = sx * sy * sz + sx * cy * cz + cx * sy * cz + cx * cy * sz;
        L = 4;
    }
    else {
        f = 3 * (cx + cy + cz) + 4 * cx * cy * cz;
        L = 7 * Math.sqrt(3);
    }
    return Math.abs(f) / (k * L) - Math.max(.001, thickness) * .5;
}
export function cubicLattice(x, y, z, cell, r) { x -= cell * Math.round(x / cell); y -= cell * Math.round(y / cell); z -= cell * Math.round(z / cell); return Math.min(Math.hypot(x, y), Math.hypot(y, z), Math.hypot(z, x)) - Math.max(.001, r); }
export function octetLattice(x, y, z, cell, r) {
    x -= cell * Math.round(x / cell);
    y -= cell * Math.round(y / cell);
    z -= cell * Math.round(z / cell);
    const h = cell * .5;
    return Math.min(segmentDistance(x, y, z, -h, -h, 0, h, h, 0), segmentDistance(x, y, z, -h, h, 0, h, -h, 0), segmentDistance(x, y, z, -h, 0, -h, h, 0, h), segmentDistance(x, y, z, -h, 0, h, h, 0, -h), segmentDistance(x, y, z, 0, -h, -h, 0, h, h), segmentDistance(x, y, z, 0, -h, h, 0, h, -h)) - Math.max(.001, r);
}
export const LATTICE_WGSL = `
fn gyroid(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let q:vec3f=p*k;let s:vec3f=sin(q);let c:vec3f=cos(q);return abs(s.x*c.y+s.y*c.z+s.z*c.x)/(k*3.46410161514)-max(t,0.001)*0.5;}
fn schwarz(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let c:vec3f=cos(p*k);return abs(c.x+c.y+c.z)/(k*1.73205080757)-max(t,0.001)*0.5;}
fn diamond(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let s:vec3f=sin(p*k);let c:vec3f=cos(p*k);return abs(s.x*s.y*s.z+s.x*c.y*c.z+c.x*s.y*c.z+c.x*c.y*s.z)/(k*4.0)-max(t,0.001)*0.5;}
fn neovius(p:vec3f,cell:f32,t:f32)->f32 {let k:f32=6.28318530718/cell;let c:vec3f=cos(p*k);return abs(3.0*(c.x+c.y+c.z)+4.0*c.x*c.y*c.z)/(k*12.124355653)-max(t,0.001)*0.5;}
fn cubic(p:vec3f,cell:f32,r:f32)->f32 {let q:vec3f=p-cell*floor(p/cell+vec3f(0.5));return min(length(q.xy),min(length(q.yz),length(q.xz)))-max(r,0.001);}
fn octet(p:vec3f,cell:f32,r:f32)->f32 {
 let q:vec3f=p-cell*floor(p/cell+vec3f(0.5));let h:f32=cell*0.5;
 let a:f32=min(sdSegment(q,vec3f(-h,-h,0.0),vec3f(h,h,0.0)),sdSegment(q,vec3f(-h,h,0.0),vec3f(h,-h,0.0)));
 let b:f32=min(sdSegment(q,vec3f(-h,0.0,-h),vec3f(h,0.0,h)),sdSegment(q,vec3f(-h,0.0,h),vec3f(h,0.0,-h)));
 let c:f32=min(sdSegment(q,vec3f(0.0,-h,-h),vec3f(0.0,h,h)),sdSegment(q,vec3f(0.0,-h,h),vec3f(0.0,h,-h)));
 return min(a,min(b,c))-max(r,0.001);
}
`;
