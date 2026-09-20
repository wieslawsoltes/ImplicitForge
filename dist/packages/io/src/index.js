import { vec3, escapeHTML } from '../../kernel/src/index.js';
export function exportSTL(mesh) {
    const { positions: p, indices: t } = mesh, count = t.length / 3, buffer = new ArrayBuffer(84 + count * 50), v = new DataView(buffer);
    new Uint8Array(buffer).set(new TextEncoder().encode('ImplicitForge | indexed isosurface | millimetres'));
    v.setUint32(80, count, true);
    let offset = 84;
    for (let i = 0; i < t.length; i += 3) {
        const a = Array.from(p.slice(t[i] * 3, t[i] * 3 + 3)), b = Array.from(p.slice(t[i + 1] * 3, t[i + 1] * 3 + 3)), c = Array.from(p.slice(t[i + 2] * 3, t[i + 2] * 3 + 3)), normal = vec3.normalize(vec3.cross(vec3.sub(b, a), vec3.sub(c, a)));
        for (const f of [...normal, ...a, ...b, ...c]) {
            v.setFloat32(offset, f, true);
            offset += 4;
        }
        v.setUint16(offset, 0, true);
        offset += 2;
    }
    return buffer;
}
export function exportOBJ(mesh) { const lines = ['# ImplicitForge | units: millimetres', 'o ImplicitBody']; for (let i = 0; i < mesh.positions.length; i += 3)
    lines.push(`v ${mesh.positions[i]} ${mesh.positions[i + 1]} ${mesh.positions[i + 2]}`); if (mesh.normals)
    for (let i = 0; i < mesh.normals.length; i += 3)
        lines.push(`vn ${mesh.normals[i]} ${mesh.normals[i + 1]} ${mesh.normals[i + 2]}`); for (let i = 0; i < mesh.indices.length; i += 3)
    lines.push(`f ${Array.from(mesh.indices.slice(i, i + 3), v => mesh.normals ? `${v + 1}//${v + 1}` : v + 1).join(' ')}`); return lines.join('\n'); }
export function exportPLY(mesh) { const p = mesh.positions, t = mesh.indices; const header = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\ncomment ImplicitForge millimetres\nelement vertex ${p.length / 3}\nproperty float x\nproperty float y\nproperty float z\nelement face ${t.length / 3}\nproperty list uchar uint vertex_indices\nend_header\n`); const buffer = new ArrayBuffer(header.length + p.byteLength + (t.length / 3) * 13), bytes = new Uint8Array(buffer); bytes.set(header); const v = new DataView(buffer); let offset = header.length; for (const x of p) {
    v.setFloat32(offset, x, true);
    offset += 4;
} for (let i = 0; i < t.length; i += 3) {
    v.setUint8(offset++, 3);
    for (let k = 0; k < 3; k++) {
        v.setUint32(offset, t[i + k], true);
        offset += 4;
    }
} return buffer; }
export function parseSTL(buffer) {
    if (buffer.byteLength > 80 * 1024 * 1024)
        throw new Error('STL import is limited to 80 MB.');
    const v = new DataView(buffer);
    let count = buffer.byteLength >= 84 ? v.getUint32(80, true) : 0;
    if (count > 0 && 84 + count * 50 === buffer.byteLength) {
        if (count > 500000)
            throw new Error('Import is limited to 500,000 triangles.');
        const positions = new Float32Array(count * 9);
        let j = 0;
        for (let i = 0; i < count; i++) {
            const o = 84 + i * 50 + 12;
            for (let k = 0; k < 9; k++)
                positions[j++] = v.getFloat32(o + k * 4, true);
        }
        return { positions };
    }
    const text = new TextDecoder().decode(buffer), matches = [...text.matchAll(/\bvertex\s+([+\-\d.eE]+)\s+([+\-\d.eE]+)\s+([+\-\d.eE]+)/g)];
    if (!matches.length || matches.length % 3)
        throw new Error('Invalid or empty STL file.');
    if (matches.length > 1500000)
        throw new Error('Import is limited to 500,000 triangles.');
    return { positions: Float32Array.from(matches.flatMap(m => [+m[1], +m[2], +m[3]])) };
}
function triangulateFace(face, p) {
    if (face.length === 3)
        return face;
    const points = face.map(i => p.slice(i * 3, i * 3 + 3)), normal = [0, 0, 0];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
        normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
        normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))), axes = [0, 1, 2].filter(i => i !== drop), q = points.map(v => axes.map(k => v[k]));
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let area = 0;
    for (let i = 0; i < q.length; i++)
        area += q[i][0] * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * q[i][1];
    const sign = Math.sign(area) || 1, remaining = face.map((_, i) => i), out = [];
    while (remaining.length > 3) {
        let found = false;
        for (let j = 0; j < remaining.length; j++) {
            const a = remaining[(j + remaining.length - 1) % remaining.length], b = remaining[j], c = remaining[(j + 1) % remaining.length];
            if (cross(q[a], q[b], q[c]) * sign < 1e-12)
                continue;
            const contains = remaining.some(k => k !== a && k !== b && k !== c && cross(q[a], q[b], q[k]) * sign >= -1e-10 && cross(q[b], q[c], q[k]) * sign >= -1e-10 && cross(q[c], q[a], q[k]) * sign >= -1e-10);
            if (contains)
                continue;
            out.push(face[a], face[b], face[c]);
            remaining.splice(j, 1);
            found = true;
            break;
        }
        if (!found)
            throw new Error('OBJ contains a degenerate, non-planar, or self-intersecting polygon.');
    }
    out.push(...remaining.map(i => face[i]));
    return out;
}
export function parseOBJ(text) { if (text.length > 80 * 1024 * 1024)
    throw new Error('OBJ import is limited to 80 MB.'); const p = [], t = []; for (const line of text.split(/\r?\n/)) {
    const words = line.split('#')[0].trim().split(/\s+/);
    if (words[0] === 'v') {
        if (words.length < 4)
            throw new Error('Invalid OBJ vertex.');
        p.push(+words[1], +words[2], +words[3]);
    }
    else if (words[0] === 'f') {
        const face = words.slice(1).filter(x => !x.startsWith('#')).map(x => { const v = parseInt(x.split('/')[0], 10), i = v < 0 ? p.length / 3 + v : v - 1; if (!Number.isInteger(i) || i < 0 || i >= p.length / 3)
            throw new Error('OBJ face index is out of bounds.'); return i; });
        if (face.length < 3 || face.length > 1024)
            throw new Error('Invalid OBJ polygon.');
        t.push(...triangulateFace(face, p));
        if (t.length > 1500000)
            throw new Error('Import is limited to 500,000 triangles.');
    }
} if (!t.length)
    throw new Error('OBJ contains no faces.'); return { positions: new Float32Array(p), indices: new Uint32Array(t) }; }
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let i = 0; i < 8; i++)
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes)
    c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** Minimal ZIP/OPC writer: UTF-8 paths, uncompressed entries, no external dependencies. */
export function zipStore(entries) {
    const encoder = new TextEncoder(), files = Object.entries(entries).map(([path, value]) => { const name = encoder.encode(path), data = typeof value === 'string' ? encoder.encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value); return { name, data, crc: crc32(data) }; });
    let size = 22;
    for (const f of files)
        size += 30 + f.name.length + f.data.length + 46 + f.name.length;
    const out = new Uint8Array(size), v = new DataView(out.buffer);
    let offset = 0;
    const u16 = (o, n) => v.setUint16(o, n, true), u32 = (o, n) => v.setUint32(o, n, true);
    for (const f of files) {
        f.offset = offset;
        u32(offset, 0x04034b50);
        u16(offset + 4, 20);
        u16(offset + 6, 0x800);
        u32(offset + 14, f.crc);
        u32(offset + 18, f.data.length);
        u32(offset + 22, f.data.length);
        u16(offset + 26, f.name.length);
        out.set(f.name, offset + 30);
        out.set(f.data, offset + 30 + f.name.length);
        offset += 30 + f.name.length + f.data.length;
    }
    const central = offset;
    for (const f of files) {
        u32(offset, 0x02014b50);
        u16(offset + 4, 20);
        u16(offset + 6, 20);
        u16(offset + 8, 0x800);
        u32(offset + 16, f.crc);
        u32(offset + 20, f.data.length);
        u32(offset + 24, f.data.length);
        u16(offset + 28, f.name.length);
        u32(offset + 42, f.offset);
        out.set(f.name, offset + 46);
        offset += 46 + f.name.length;
    }
    u32(offset, 0x06054b50);
    u16(offset + 8, files.length);
    u16(offset + 10, files.length);
    u32(offset + 12, offset - central);
    u32(offset + 16, central);
    return out;
}
export function export3MF(mesh, name = 'ImplicitForge body') {
    const p = mesh.positions, t = mesh.indices, vertices = [], triangles = [];
    for (let i = 0; i < p.length; i += 3)
        vertices.push(`<vertex x="${p[i]}" y="${p[i + 1]}" z="${p[i + 2]}"/>`);
    for (let i = 0; i < t.length; i += 3)
        triangles.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`);
    return zipStore({ '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>', '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>', '3D/3dmodel.model': `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">${escapeHTML(name)}</metadata><resources><object id="1" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>` });
}
export function sliceContours(sample, domain, z, resolution = 192) {
    const n = resolution, lo = domain.min, hi = domain.max, sx = (hi[0] - lo[0]) / (n - 1), sy = (hi[1] - lo[1]) / (n - 1), data = new Float32Array(n * n), segments = [];
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
            data[x + n * y] = sample(lo[0] + x * sx, lo[1] + y * sy, z);
    for (let y = 0; y < n - 1; y++)
        for (let x = 0; x < n - 1; x++) {
            const ids = [x + n * y, x + 1 + n * y, x + 1 + n * (y + 1), x + n * (y + 1)], points = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], v = ids.map(i => data[i]);
            let mask = 0;
            v.forEach((s, i) => { if (s < 0)
                mask |= 1 << i; });
            if (mask === 0 || mask === 15)
                continue;
            const intersections = [];
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4;
                if ((v[i] < 0) !== (v[j] < 0)) {
                    const t = v[i] / (v[i] - v[j]);
                    intersections.push({ edge: i, p: [lo[0] + (points[i][0] + t * (points[j][0] - points[i][0])) * sx, lo[1] + (points[i][1] + t * (points[j][1] - points[i][1])) * sy] });
                }
            }
            if (intersections.length === 2)
                segments.push(intersections.map(v => v.p));
            else if (intersections.length === 4) {
                const inside = sample(lo[0] + (x + .5) * sx, lo[1] + (y + .5) * sy, z) < 0;
                const pairs = ((mask === 5 && inside) || (mask === 10 && !inside)) ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
                for (const [a, b] of pairs)
                    segments.push([intersections[a].p, intersections[b].p]);
            }
        }
    return segments;
}
export function exportSliceSVG(sample, domain, z, resolution = 192) { const segments = sliceContours(sample, domain, z, resolution), width = domain.max[0] - domain.min[0], height = domain.max[1] - domain.min[1]; return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${domain.min[0]} ${-domain.max[1]} ${width} ${height}"><title>ImplicitForge section Z = ${z} mm</title><g fill="none" stroke="#111" stroke-width="0.12">${segments.map(([a, b]) => `<path d="M${a[0]} ${-a[1]}L${b[0]} ${-b[1]}"/>`).join('')}</g></svg>`; }
