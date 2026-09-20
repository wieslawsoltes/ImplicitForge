import { sampleGrid, extractMesh } from '../../mesh/src/index.js';
import { rasterizeSurface } from './software.js';
import { requestGPU, storageBuffer, checkedModule } from '../../compute/src/index.js';
import { wgslToGLSL } from '../../field/src/index.js';
import { vec3, clamp } from '../../kernel/src/index.js';
const VIEW_NAMES = ['eye', 'right', 'up', 'forward', 'viewport', 'lo', 'hi', 'style', 'material', 'analysisLo', 'analysisHi', 'analysisInfo'];
const VIEW_WGSL = `struct View {${VIEW_NAMES.map(n => `${n}:vec4f`).join(',')}}; @group(0) @binding(0) var<uniform> V:View; @group(0) @binding(3) var<storage,read> T:array<f32>; fn temperatureAt(i:i32)->f32{return T[i];}`;
const VIEW_GLSL = `struct View {${VIEW_NAMES.map(n => `vec4 ${n};`).join('')}}; uniform View V; uniform sampler2D uAnalysis; float temperatureAt(int i){return texelFetch(uAnalysis,ivec2(i%1024,i/1024),0).r;}`;
const SHADING = `
fn sampleAnalysis(p:vec3f)->f32 {
 let n:i32=i32(V.analysisInfo.x);if(n<2){return 0.0;}let q:vec3f=clamp((p-V.analysisLo.xyz)/(V.analysisHi.xyz-V.analysisLo.xyz)*f32(n-1),vec3f(0.0),vec3f(f32(n-1)));
 let c:vec3i=min(vec3i(floor(q)),vec3i(n-2));let f:vec3f=q-vec3f(c);let i:i32=c.x+n*(c.y+n*c.z);
 let a:f32=mix(mix(temperatureAt(i),temperatureAt(i+1),f.x),mix(temperatureAt(i+n),temperatureAt(i+n+1),f.x),f.y);
 let b:f32=mix(mix(temperatureAt(i+n*n),temperatureAt(i+n*n+1),f.x),mix(temperatureAt(i+n*n+n),temperatureAt(i+n*n+n+1),f.x),f.y);return mix(a,b,f.z);
}
fn model(p:vec3f)->f32 {let d:f32=scene(p);if(V.lo.w>0.5){return max(d,p.z-V.hi.w);}return d;}
fn palette(t0:f32)->vec3f {
 let t:f32=clamp(t0,0.0,1.0);let a:vec3f=vec3f(0.025,0.13,0.45);let b:vec3f=vec3f(0.03,0.61,0.58);let c:vec3f=vec3f(0.88,0.78,0.12);let d:vec3f=vec3f(0.93,0.17,0.055);
 if(t<0.33333){return mix(a,b,t*3.0);}if(t<0.66667){return mix(b,c,(t-0.33333)*3.0);}return mix(c,d,(t-0.66667)*3.0);
}
fn fieldNormal(p:vec3f,e:f32)->vec3f {
 let a:vec3f=vec3f(1.0,-1.0,-1.0);let b:vec3f=vec3f(-1.0,-1.0,1.0);let c:vec3f=vec3f(-1.0,1.0,-1.0);let d:vec3f=vec3f(1.0,1.0,1.0);
 return normalize(a*model(p+a*e)+b*model(p+b*e)+c*model(p+c*e)+d*model(p+d*e));
}
fn shadePixel(pixel:vec2f)->vec4f {
 let uv:vec2f=(pixel*2.0-V.viewport.xy)/V.viewport.y;let q:vec2f=vec2f(uv.x,-uv.y);
 var ro:vec3f=V.eye.xyz;var rd:vec3f=normalize(V.forward.xyz+V.right.xyz*q.x*V.viewport.z+V.up.xyz*q.y*V.viewport.z);
 if(V.viewport.w>0.5){ro+=V.right.xyz*q.x*V.eye.w*V.viewport.z+V.up.xyz*q.y*V.eye.w*V.viewport.z;rd=V.forward.xyz;}
 let span:f32=length(V.hi.xyz-V.lo.xyz);let eps:f32=max(0.002,span*0.000045);let inv:vec3f=vec3f(1.0)/(rd+vec3f(0.00000001));let aa:vec3f=(V.lo.xyz-ro)*inv;let bb:vec3f=(V.hi.xyz-ro)*inv;
 let tn:vec3f=min(aa,bb);let tf:vec3f=max(aa,bb);let near:f32=max(tn.x,max(tn.y,tn.z));let far:f32=min(tf.x,min(tf.y,tf.z));
 var t:f32=max(near,0.0);var hit:f32=0.0;var previous:f32=t;
 if(far>=t){for(var i:i32=0;i<720;i++){if(f32(i)>=V.analysisInfo.w||t>far){break;}let dist:f32=model(ro+rd*t);if(dist<eps){hit=1.0;if(dist<0.0&&t>previous){var l:f32=previous;var r:f32=t;for(var j:i32=0;j<5;j++){let m:f32=(l+r)*0.5;if(model(ro+rd*m)>0.0){l=m;}else{r=m;}}t=(l+r)*0.5;}break;}previous=t;t+=clamp(dist*0.72,eps*0.65,span*0.009);}}
 let vignette:f32=exp(-0.27*dot(q,q));var color:vec3f=mix(vec3f(0.008,0.011,0.017),vec3f(0.022,0.029,0.040),vignette)*mix(0.92,1.12,clamp(q.y*0.25+0.5,0.0,1.0));
 if(hit<0.5){
  if(V.style.z>0.5&&rd.z< -0.0001){let g:f32=(V.lo.z-ro.z)/rd.z;if(g>0.0){let p:vec3f=ro+rd*g;let line:vec2f=abs(fract(p.xy/10.0+vec2f(0.5))-vec2f(0.5))*10.0;let width:f32=clamp(g/V.viewport.y*1.2,0.015,0.5);let opacity:f32=(1.0-smoothstep(width,width*1.9,min(line.x,line.y)))*exp(-length(p.xy)/span*1.7)*0.16;color=mix(color,vec3f(0.19,0.24,0.31),opacity);let ax:f32=1.0-smoothstep(width,width*1.7,abs(p.y));let ay:f32=1.0-smoothstep(width,width*1.7,abs(p.x));color=mix(color,vec3f(0.28,0.055,0.035),ax*0.15);color=mix(color,vec3f(0.035,0.14,0.20),ay*0.15);}}
 }else{
  let p:vec3f=ro+rd*t;let n:vec3f=fieldNormal(p,eps*1.5);let eye:vec3f=-rd;let key:vec3f=normalize(vec3f(-0.35,-0.6,0.88));let fill:vec3f=normalize(vec3f(0.75,0.1,0.32));let halfVector:vec3f=normalize(key+eye);
  var base:vec3f=V.material.rgb;let mode:f32=V.style.x;
  if(mode>0.5&&mode<1.5){base=palette((colorField(p)-V.analysisInfo.y)/max(0.00001,V.analysisInfo.z-V.analysisInfo.y));}
  if(mode>2.5){base=palette((sampleAnalysis(p)-V.analysisLo.w)/max(0.00001,V.analysisHi.w-V.analysisLo.w));}
  let ao1:f32=max(0.0,1.0-model(p+n*0.6)/0.6);let ao2:f32=max(0.0,1.0-model(p+n*1.8)/1.8);let ao:f32=clamp(1.0-0.2*ao1-0.16*ao2,0.5,1.0);
  let diffuse:f32=0.21+0.74*max(dot(n,key),0.0)+0.26*max(dot(n,fill),0.0)+0.08*max(n.z,0.0);
  let spec:f32=pow(max(dot(n,halfVector),0.0),mix(190.0,10.0,V.material.a))*(0.85-0.3*V.material.a);
  let rim:f32=pow(1.0-max(dot(n,eye),0.0),3.0)*0.12;color=(base*diffuse+mix(base,vec3f(1.0),0.56)*spec+vec3f(rim))*ao;
  if(mode>1.5&&mode<2.5){color=n*0.5+vec3f(0.5);}
  if(V.lo.w>0.5&&abs(p.z-V.hi.w)<eps*3.0){let hatch:f32=0.8+0.2*smoothstep(0.25,0.4,abs(fract((p.x+p.y)*0.45)-0.5));color=base*hatch*0.78;}
 }
 color=vec3f(1.0)-exp(-color*V.style.w);return vec4f(pow(max(color,vec3f(0.0)),vec3f(0.45454545)),1.0);
}
`;
export class OrbitCamera {
    constructor() { this.target = [0, 0, 0]; this.distance = 110; this.aspect = 1; this.yaw = -.90; this.pitch = .48; this.orthographic = false; }
    fit(domain) { this.target = domain.min.map((v, i) => (v + domain.max[i]) * .5); this.distance = Math.max(...domain.max.map((v, i) => v - domain.min[i])) * 1.8 * Math.max(1, 1 / this.aspect); }
    frame() { const eye = vec3.add(this.target, [Math.cos(this.pitch) * Math.cos(this.yaw) * this.distance, Math.cos(this.pitch) * Math.sin(this.yaw) * this.distance, Math.sin(this.pitch) * this.distance]); const forward = vec3.normalize(vec3.sub(this.target, eye)), right = vec3.normalize(vec3.cross(forward, [0, 0, 1])), up = vec3.cross(right, forward); return { eye, forward, right, up }; }
    pan(dx, dy, height) { const { right, up } = this.frame(), scale = this.distance * .72 / Math.max(height, 1); this.target = vec3.add(this.target, vec3.add(vec3.mul(right, -dx * scale), vec3.mul(up, dy * scale))); }
    orient(axis) { if (axis === 'top') {
        this.pitch = 1.565;
        this.yaw = -Math.PI / 2;
    }
    else if (axis === 'front') {
        this.pitch = 0;
        this.yaw = -Math.PI / 2;
    }
    else if (axis === 'right') {
        this.pitch = 0;
        this.yaw = 0;
    }
    else {
        this.pitch = .48;
        this.yaw = -.9;
    } }
}
export class ImplicitRenderer {
    constructor(canvas, { onStatus = () => { }, onError = () => { } } = {}) {
        this.canvas = canvas;
        this.onStatus = onStatus;
        this.onError = onError;
        this.camera = new OrbitCamera();
        this.domain = { min: [-35, -35, -35], max: [35, 35, 35] };
        this.mode = 0;
        this.quality = 1;
        this.grid = true;
        this.clip = false;
        this.clipZ = 0;
        this.exposure = 1.15;
        this.material = [.91, .40, .20, .32];
        this.fieldRange = [0, 1];
        this.autoRotate = false;
        this.dirty = true;
        this.destroyed = false;
        this.generation = 0;
        this.resources = [];
        this.program = null;
        this.analysis = null;
        this.interacting = false;
        this.cache = new Map();
    }
    async init({ forceWebGL = false } = {}) {
        let gpu = null;
        if (!forceWebGL)
            try {
                gpu = await requestGPU();
            }
            catch (e) {
                this.onStatus({ notice: e.message });
            }
        if (gpu) {
            this.device = gpu.device;
            this.context = this.canvas.getContext('webgpu');
            if (!this.context)
                throw new Error('WebGPU canvas context unavailable.');
            this.format = navigator.gpu.getPreferredCanvasFormat();
            this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
            this.backend = 'WebGPU';
            this.adapter = gpu.info;
            this.device.addEventListener('uncapturederror', e => this.onError(new Error(e.error.message)));
            this.device.lost.then(info => { if (!this.destroyed)
                this.onError(new Error(`GPU device lost: ${info.message || info.reason}. Reload the page to recreate the device.`)); });
            this.bindLayout = this.device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }] });
            this.uniform = this.device.createBuffer({ size: 192, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            this.analysisBuffer = storageBuffer(this.device, new Float32Array([0]), 'Analysis');
        }
        else {
            this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
            if (!this.gl) {
                this.cpuContext = this.canvas.getContext('2d');
                this.backend = 'CPU raster';
            }
            else {
                this.backend = 'WebGL 2';
                this.gl.getExtension('EXT_color_buffer_float');
                this.analysisTexture = this.createTexture(new Float32Array([0]));
                this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.onError(new Error('WebGL context lost. Reload the page to recover.')); });
            }
        }
        this.attachControls();
        this.camera.aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
        this.resizeObserver = new ResizeObserver(() => { const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight); this.camera.distance *= Math.max(1, 1 / aspect) / Math.max(1, 1 / this.camera.aspect); this.camera.aspect = aspect; this.invalidate(); });
        this.resizeObserver.observe(this.canvas);
        this.lastFrame = performance.now();
        this.loop();
        return this;
    }
    createTexture(data) { const gl = this.gl, width = 1024, height = Math.max(1, Math.ceil(data.length / width)); if (height > gl.getParameter(gl.MAX_TEXTURE_SIZE))
        throw new Error('Imported field exceeds the WebGL texture limit.'); const padded = new Float32Array(width * height); padded.set(data); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, padded); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
    async setProgram(program) {
        const generation = ++this.generation;
        if (this.backend === 'CPU raster') {
            this.program = program;
            this.pipeline = true;
            await this.rebuildSoftware(generation);
            return;
        }
        let pipeline = this.cache.get(program.key);
        if (this.backend === 'WebGPU') {
            const d = this.device;
            if (!pipeline) {
                const code = program.wgsl + VIEW_WGSL + SHADING + `\n@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {let p=vec2f(f32((i<<1u)&2u),f32(i&2u));return vec4f(p*2.0-vec2f(1.0),0.0,1.0);}\n@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{return shadePixel(p.xy);}`;
                const module = await checkedModule(d, code, 'Implicit surface renderer');
                pipeline = await d.createRenderPipelineAsync({ label: 'Implicit surface renderer', layout: d.createPipelineLayout({ bindGroupLayouts: [this.bindLayout] }), vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
                this.cache.set(program.key, pipeline);
                if (this.cache.size > 12)
                    this.cache.delete(this.cache.keys().next().value);
            }
            if (generation !== this.generation)
                return;
            const params = storageBuffer(d, program.parameters, 'Graph parameters'), assets = storageBuffer(d, program.assets, 'Imported fields');
            for (const b of this.resources)
                b.destroy();
            this.resources = [params, assets];
            this.parameterBuffer = params;
            this.assetBuffer = assets;
            this.pipeline = pipeline;
            this.rebind();
        }
        else {
            const gl = this.gl;
            if (!pipeline) {
                const compile = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                    const message = gl.getShaderInfoLog(s);
                    gl.deleteShader(s);
                    throw new Error(message);
                } return s; };
                const vs = compile(gl.VERTEX_SHADER, '#version 300 es\nprecision highp float;void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}');
                const fs = compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;precision highp int;out vec4 fragColor;\n' + program.glsl + VIEW_GLSL + wgslToGLSL(SHADING) + '\nvoid main(){fragColor=shadePixel(vec2(gl_FragCoord.x,V.viewport.y-gl_FragCoord.y));}');
                pipeline = gl.createProgram();
                gl.attachShader(pipeline, vs);
                gl.attachShader(pipeline, fs);
                gl.linkProgram(pipeline);
                gl.deleteShader(vs);
                gl.deleteShader(fs);
                if (!gl.getProgramParameter(pipeline, gl.LINK_STATUS))
                    throw new Error(gl.getProgramInfoLog(pipeline));
                this.cache.set(program.key, pipeline);
                if (this.cache.size > 12) {
                    const [key, old] = this.cache.entries().next().value;
                    gl.deleteProgram(old);
                    this.cache.delete(key);
                }
            }
            if (generation !== this.generation)
                return;
            this.pipeline = pipeline;
            gl.useProgram(pipeline);
            gl.uniform1fv(gl.getUniformLocation(pipeline, 'P[0]'), program.parameters);
            if (this.assetTexture)
                gl.deleteTexture(this.assetTexture);
            this.assetTexture = this.createTexture(program.assets);
        }
        this.program = program;
        this.invalidate();
    }
    async rebuildSoftware(generation) {
        this.softwareAbort?.abort();
        this.softwareAbort = new AbortController();
        const signal = this.softwareAbort.signal;
        this.softwareMeshKey = `${this.clip}:${this.clipZ}:${this.quality}`;
        const program = this.program, clip = this.clip, z = this.clipZ;
        const sample = clip ? (x, y, w) => Math.max(program.sample(x, y, w), w - z) : program.sample;
        const resolution = this.quality === 2 ? 104 : this.quality === 0 ? 44 : 76;
        const grid = await sampleGrid(sample, this.domain, resolution, { signal });
        const mesh = await extractMesh(grid, { signal });
        if (generation !== this.generation)
            return;
        this.softwareMesh = mesh;
        this.invalidate();
    }
    rebind() { if (!this.pipeline || !this.parameterBuffer)
        return; this.bindGroup = this.device.createBindGroup({ layout: this.bindLayout, entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer: this.parameterBuffer } }, { binding: 2, resource: { buffer: this.assetBuffer } }, { binding: 3, resource: { buffer: this.analysisBuffer } }] }); }
    setAnalysis(result) { this.analysis = result; if (this.backend === 'CPU raster') {
        this.invalidate();
        return;
    } if (this.backend === 'WebGPU') {
        this.analysisBuffer.destroy();
        this.analysisBuffer = storageBuffer(this.device, result?.values ?? new Float32Array([0]), 'Numerical analysis');
        this.rebind();
    }
    else {
        this.gl.deleteTexture(this.analysisTexture);
        this.analysisTexture = this.createTexture(result?.values ?? new Float32Array([0]));
    } this.invalidate(); }
    invalidate() { this.dirty = true; }
    setDomain(domain, { fit = false } = {}) { this.domain = domain; if (fit)
        this.camera.fit(domain); this.invalidate(); }
    loop() { if (this.destroyed)
        return; this.animationFrame = requestAnimationFrame(() => this.loop()); const now = performance.now(); if (this.autoRotate) {
        this.camera.yaw += (now - this.lastFrame) * .00012;
        this.dirty = true;
    } this.lastFrame = now; if (!this.dirty || !this.pipeline)
        return; try {
        this.draw();
    }
    catch (e) {
        this.dirty = false;
        this.onError(e);
    } }
    uniforms() { const frame = this.camera.frame(), analysis = this.analysis; const data = new Float32Array(48); data.set([...frame.eye, this.camera.distance], 0); data.set(frame.right, 4); data.set(frame.up, 8); data.set(frame.forward, 12); data.set([this.canvas.width, this.canvas.height, Math.tan(21 * Math.PI / 180), this.camera.orthographic ? 1 : 0], 16); data.set([...this.domain.min, this.clip ? 1 : 0], 20); data.set([...this.domain.max, this.clipZ], 24); data.set([this.mode, this.quality, this.grid ? 1 : 0, this.exposure], 28); data.set(this.material, 32); data.set([...(analysis?.min ?? [-1, -1, -1]), analysis?.minValue ?? 0], 36); data.set([...(analysis?.max ?? [1, 1, 1]), analysis?.maxValue ?? 1], 40); data.set([analysis?.n ?? 0, ...this.fieldRange, this.quality === 2 ? 700 : this.quality === 0 ? 240 : 460], 44); return data; }
    draw() {
        const start = performance.now(), rect = this.canvas.getBoundingClientRect(), ratio = Math.min(globalThis.devicePixelRatio || 1, this.quality === 2 ? 2 : 1.5) * (this.interacting ? .65 : 1), w = Math.max(2, Math.floor(rect.width * ratio)), h = Math.max(2, Math.floor(rect.height * ratio));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
        const data = this.uniforms();
        if (this.backend === 'CPU raster') {
            const key = `${this.clip}:${this.clipZ}:${this.quality}`;
            if (this.softwareMeshKey !== key) {
                this.softwareMeshKey = key;
                this.rebuildSoftware(++this.generation).catch(e => { if (e.name !== 'AbortError')
                    this.onError(e); });
            }
            rasterizeSurface(this.canvas, this.cpuContext, this.softwareMesh, this);
        }
        else if (this.backend === 'WebGPU') {
            const d = this.device;
            d.queue.writeBuffer(this.uniform, 0, data);
            const enc = d.createCommandEncoder(), pass = enc.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: .03, g: .035, b: .045, a: 1 } }] });
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.bindGroup);
            pass.draw(3);
            pass.end();
            d.queue.submit([enc.finish()]);
        }
        else {
            const gl = this.gl;
            gl.viewport(0, 0, w, h);
            gl.useProgram(this.pipeline);
            for (let i = 0; i < VIEW_NAMES.length; i++)
                gl.uniform4fv(gl.getUniformLocation(this.pipeline, `V.${VIEW_NAMES[i]}`), data.subarray(i * 4, i * 4 + 4));
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.assetTexture);
            gl.uniform1i(gl.getUniformLocation(this.pipeline, 'uAssets'), 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.analysisTexture);
            gl.uniform1i(gl.getUniformLocation(this.pipeline, 'uAnalysis'), 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        this.dirty = false;
        this.onStatus({ backend: this.backend, cpuMs: performance.now() - start, width: w, height: h });
    }
    attachControls() {
        const c = this.canvas, points = new Map();
        let prior = null;
        const state = () => { const a = [...points.values()]; return a.length > 1 ? { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) } : a[0]; };
        this.controlAbort = new AbortController();
        const options = { signal: this.controlAbort.signal };
        c.addEventListener('contextmenu', e => e.preventDefault(), options);
        c.addEventListener('pointerdown', e => { c.focus({ preventScroll: true }); c.setPointerCapture(e.pointerId); points.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button !== 0 }); prior = state(); this.interacting = true; this.invalidate(); }, options);
        c.addEventListener('pointermove', e => { if (!points.has(e.pointerId))
            return; const p = points.get(e.pointerId); points.set(e.pointerId, { ...p, x: e.clientX, y: e.clientY }); const s = state(); if (prior) {
            const dx = s.x - prior.x, dy = s.y - prior.y;
            if (points.size > 1) {
                this.camera.pan(dx, dy, c.clientHeight);
                if (prior.d && s.d)
                    this.camera.distance = clamp(this.camera.distance * prior.d / s.d, .1, 1e6);
            }
            else if (p.pan || e.shiftKey)
                this.camera.pan(dx, dy, c.clientHeight);
            else {
                this.camera.yaw -= dx * .007;
                this.camera.pitch = clamp(this.camera.pitch + dy * .006, -1.56, 1.56);
            }
        } prior = s; this.invalidate(); }, options);
        const end = e => { points.delete(e.pointerId); prior = state(); this.interacting = points.size > 0; this.invalidate(); };
        c.addEventListener('pointerup', end, options);
        c.addEventListener('pointercancel', end, options);
        c.addEventListener('lostpointercapture', end, options);
        c.addEventListener('wheel', e => { e.preventDefault(); this.camera.distance = clamp(this.camera.distance * Math.exp(e.deltaY * .0011), .1, 1e6); this.invalidate(); }, { ...options, passive: false });
        c.addEventListener('dblclick', () => { this.camera.fit(this.domain); this.invalidate(); }, options);
    }
    async snapshot() { this.draw(); if (this.device)
        await this.device.queue.onSubmittedWorkDone(); return new Promise((resolve, reject) => this.canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas image export failed.')), 'image/png')); }
    destroy() { this.destroyed = true; cancelAnimationFrame(this.animationFrame); this.resizeObserver?.disconnect(); this.controlAbort?.abort(); this.softwareAbort?.abort(); if (this.device) {
        for (const b of this.resources)
            b.destroy();
        this.uniform?.destroy();
        this.analysisBuffer?.destroy();
        this.device.destroy();
    } if (this.gl) {
        for (const p of this.cache.values())
            this.gl.deleteProgram(p);
        this.gl.deleteTexture(this.assetTexture);
        this.gl.deleteTexture(this.analysisTexture);
    } this.cache.clear(); }
}
