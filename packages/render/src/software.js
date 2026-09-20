import { vec3, clamp } from '../../kernel/src/index.js';
import { sampleVolume } from '../../field/src/index.js';
const heat = t => { const stops = [[.025, .13, .45], [.03, .61, .58], [.88, .78, .12], [.93, .17, .055]], q = clamp(t, 0, 1) * 3, i = Math.min(2, Math.floor(q)), f = q - i; return stops[i].map((x, k) => x + (stops[i + 1][k] - x) * f); };
/** A genuine depth-buffered CPU triangle rasterizer for software-only browser sessions. */
export function rasterizeSurface(canvas, ctx, mesh, renderer) {
    const w = canvas.width, h = canvas.height, { eye, forward, right, up } = renderer.camera.frame(), tangent = Math.tan(21 * Math.PI / 180), scale = h / (2 * tangent), isOrtho = renderer.camera.orthographic;
    const project = (x, y, z) => { const d = [x - eye[0], y - eye[1], z - eye[2]], depth = vec3.dot(d, forward); return [w * .5 + vec3.dot(d, right) * scale / (isOrtho ? renderer.camera.distance : depth), h * .5 - vec3.dot(d, up) * scale / (isOrtho ? renderer.camera.distance : depth), depth]; };
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w * .46, h * .40, 0, w * .5, h * .5, w * .7);
    bg.addColorStop(0, '#28323f');
    bg.addColorStop(1, '#171d27');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (renderer.grid) {
        ctx.lineWidth = .6;
        const span = Math.max(...renderer.domain.max.map((v, i) => v - renderer.domain.min[i]));
        for (let i = -8; i <= 8; i++) {
            for (let axis = 0; axis < 2; axis++) {
                const p = axis === 0 ? project(i * 10, -span, renderer.domain.min[2]) : project(-span, i * 10, renderer.domain.min[2]);
                const q = axis === 0 ? project(i * 10, span, renderer.domain.min[2]) : project(span, i * 10, renderer.domain.min[2]);
                if (p[2] <= .1 || q[2] <= .1)
                    continue;
                ctx.strokeStyle = i === 0 ? (axis === 0 ? '#2b5261' : '#623e36') : '#36414e';
                ctx.beginPath();
                ctx.moveTo(p[0], p[1]);
                ctx.lineTo(q[0], q[1]);
                ctx.stroke();
            }
        }
    }
    if (!mesh?.indices.length)
        return;
    const p = mesh.positions, n = mesh.normals, t = mesh.indices, count = p.length / 3, screen = new Float32Array(count * 3), colors = new Float32Array(count * 3), key = vec3.normalize([-.35, -.6, .88]), fill = vec3.normalize([.75, .1, .32]), a = renderer.analysis, mode = renderer.mode;
    for (let i = 0; i < count; i++) {
        const k = i * 3, x = p[k], y = p[k + 1], z = p[k + 2];
        screen.set(project(x, y, z), k);
        const normal = [n[k], n[k + 1], n[k + 2]], eyeVector = vec3.normalize([eye[0] - x, eye[1] - y, eye[2] - z]), half = vec3.normalize(vec3.add(key, eyeVector));
        let base = renderer.material.slice(0, 3);
        if (mode === 1) {
            const v = renderer.program.colorSample(x, y, z);
            base = heat((v - renderer.fieldRange[0]) / Math.max(1e-6, renderer.fieldRange[1] - renderer.fieldRange[0]));
        }
        if (mode === 3 && a) {
            const v = sampleVolume(a.values, a.n, a.min, a.max, x, y, z);
            base = heat((v - a.minValue) / Math.max(1e-6, a.maxValue - a.minValue));
        }
        const diffuse = .21 + .74 * Math.max(vec3.dot(normal, key), 0) + .26 * Math.max(vec3.dot(normal, fill), 0) + .08 * Math.max(normal[2], 0), roughness = renderer.material[3], spec = Math.max(vec3.dot(normal, half), 0) ** (190 + (10 - 190) * roughness) * (.85 - .3 * roughness), rim = (1 - Math.max(vec3.dot(normal, eyeVector), 0)) ** 3 * .12;
        let ao = .86;
        if (renderer.program) {
            const sample = renderer.program.sample, d1 = sample(x + normal[0] * .6, y + normal[1] * .6, z + normal[2] * .6), d2 = sample(x + normal[0] * 1.8, y + normal[1] * 1.8, z + normal[2] * 1.8);
            ao = clamp(1 - .2 * Math.max(0, 1 - d1 / .6) - .16 * Math.max(0, 1 - d2 / 1.8), .5, 1);
        }
        for (let c = 0; c < 3; c++) {
            let value = (base[c] * diffuse + (base[c] * .44 + .56) * spec + rim) * ao;
            if (mode === 2)
                value = normal[c] * .5 + .5;
            if (renderer.clip && Math.abs(z - renderer.clipZ) < .06)
                value = base[c] * .7;
            colors[k + c] = (1 - Math.exp(-Math.max(0, value) * renderer.exposure)) ** (1 / 2.2) * 255;
        }
    }
    const image = ctx.createImageData(w, h), bytes = image.data, depthBuffer = new Float32Array(w * h);
    for (let i = 0; i < t.length; i += 3) {
        const ia = t[i] * 3, ib = t[i + 1] * 3, ic = t[i + 2] * 3, ax = screen[ia], ay = screen[ia + 1], az = screen[ia + 2], bx = screen[ib], by = screen[ib + 1], bz = screen[ib + 2], cx = screen[ic], cy = screen[ic + 1], cz = screen[ic + 2];
        if (az <= .01 || bz <= .01 || cz <= .01)
            continue;
        const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(denominator) < 1e-8)
            continue;
        const xmin = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - .5)), xmax = Math.min(w - 1, Math.floor(Math.max(ax, bx, cx) - .5)), ymin = Math.max(0, Math.ceil(Math.min(ay, by, cy) - .5)), ymax = Math.min(h - 1, Math.floor(Math.max(ay, by, cy) - .5));
        if (xmin > xmax || ymin > ymax)
            continue;
        const da = 1 / az, db = 1 / bz, dc = 1 / cz, inv = 1 / denominator, waX = (by - cy) * inv, waY = (cx - bx) * inv, wbX = (cy - ay) * inv, wbY = (ax - cx) * inv;
        for (let y = ymin; y <= ymax; y++) {
            let wa = waX * (xmin + .5 - cx) + waY * (y + .5 - cy), wb = wbX * (xmin + .5 - cx) + wbY * (y + .5 - cy);
            for (let x = xmin; x <= xmax; x++, wa += waX, wb += wbX) {
                const wc = 1 - wa - wb;
                if (wa < -.00001 || wb < -.00001 || wc < -.00001)
                    continue;
                const invDepth = wa * da + wb * db + wc * dc, index = x + w * y;
                if (invDepth <= depthBuffer[index])
                    continue;
                depthBuffer[index] = invDepth;
                const q = index * 4;
                for (let c = 0; c < 3; c++)
                    bytes[q + c] = (wa * colors[ia + c] * da + wb * colors[ib + c] * db + wc * colors[ic + c] * dc) / invDepth;
                bytes[q + 3] = 255;
            }
        }
    }
    renderer.softwareLayer ??= document.createElement('canvas');
    const layer = renderer.softwareLayer;
    if (layer.width !== w || layer.height !== h) {
        layer.width = w;
        layer.height = h;
    }
    layer.getContext('2d').putImageData(image, 0, 0);
    ctx.drawImage(layer, 0, 0);
}
