// Standalone @forge package. Generated from workspace source; no external runtime dependencies.
const __entry=(function(){'use strict';const __cache={};const __modules={0:(__exports,__require)=>{
const { sampleGrid, extractMesh }=__require(1);
const { rasterizeSurface }=__require(3);
const { requestGPU, storageBuffer, checkedModule }=__require(5);
const { wgslToGLSL }=__require(4);
const { vec3, clamp }=__require(2);
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
class OrbitCamera {
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
class ImplicitRenderer {
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

Object.assign(__exports,{OrbitCamera:OrbitCamera,ImplicitRenderer:ImplicitRenderer});
},
1:(__exports,__require)=>{
const { gridInfo, clamp, throwIfAborted, vec3 }=__require(2);
const pause = () => new Promise(r => setTimeout(r, 0));
/** Inclusive nodal sampling. x is the fastest-changing coordinate. */
async function sampleGrid(sample, domain, resolution, { signal, onProgress } = {}) {
    const g = gridInfo(domain, resolution), { n, count, min, step } = g;
    const values = new Float32Array(count);
    for (let z = 0; z < n; z++) {
        throwIfAborted(signal);
        const pz = min[2] + z * step[2];
        for (let y = 0; y < n; y++) {
            const py = min[1] + y * step[1];
            let i = n * (y + n * z);
            for (let x = 0; x < n; x++) {
                const v = sample(min[0] + x * step[0], py, pz);
                if (!Number.isFinite(v))
                    throw new Error(`Non-finite field value at grid index ${i}.`);
                values[i++] = v;
            }
        }
        if (z % 4 === 0) {
            onProgress?.(z / (n - 1));
            await pause();
        }
    }
    onProgress?.(1);
    return { ...g, values };
}
const TETS = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];
const EDGES = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
/** Consistent Freudenthal tetrahedra, shared-edge welding, outward-oriented indexed triangles. */
async function extractMesh(grid, { signal, onProgress, iso = 0, maxTriangles = 2500000 } = {}) {
    const { n, values, min, step } = grid, count = n ** 3;
    const positions = [], normals = [], indices = [], cache = new Map();
    const coords = id => { const x = id % n, y = Math.floor(id / n) % n, z = Math.floor(id / (n * n)); return [min[0] + x * step[0], min[1] + y * step[1], min[2] + z * step[2]]; };
    const normal = id => { const x = id % n, y = Math.floor(id / n) % n, z = Math.floor(id / n / n); return [(values[id + (x < n - 1 ? 1 : 0)] - values[id - (x > 0 ? 1 : 0)]) / ((x === 0 || x === n - 1 ? 1 : 2) * step[0]), (values[id + (y < n - 1 ? n : 0)] - values[id - (y > 0 ? n : 0)]) / ((y === 0 || y === n - 1 ? 1 : 2) * step[1]), (values[id + (z < n - 1 ? n * n : 0)] - values[id - (z > 0 ? n * n : 0)]) / ((z === 0 || z === n - 1 ? 1 : 2) * step[2])]; };
    const vertex = (ia, ib) => {
        const va = values[ia] - iso, vb = values[ib] - iso, t = clamp(va / (va - vb), 0, 1);
        const key = t < 1e-10 ? -(ia + 1) : t > 1 - 1e-10 ? -(ib + 1) : Math.min(ia, ib) * count + Math.max(ia, ib);
        if (cache.has(key))
            return cache.get(key);
        const a = coords(ia), b = coords(ib), na = normal(ia), nb = normal(ib), nn = vec3.normalize(na.map((v, k) => v + (nb[k] - v) * t)), id = positions.length / 3;
        positions.push(...a.map((v, k) => v + (b[k] - v) * t));
        normals.push(...nn);
        cache.set(key, id);
        return id;
    };
    const point = i => positions.slice(i * 3, i * 3 + 3);
    const triangle = (a, b, c, direction) => { if (a === b || b === c || c === a)
        return; const p = point(a), q = point(b), r = point(c), cross = vec3.cross(vec3.sub(q, p), vec3.sub(r, p)); if (vec3.dot(cross, cross) < 1e-20)
        return; if (vec3.dot(cross, direction) < 0)
        indices.push(a, c, b);
    else
        indices.push(a, b, c); };
    for (let z = 0; z < n - 1; z++) {
        throwIfAborted(signal);
        for (let y = 0; y < n - 1; y++)
            for (let x = 0; x < n - 1; x++) {
                const a = x + n * (y + n * z), cube = [a, a + 1, a + n + 1, a + n, a + n * n, a + n * n + 1, a + n * n + n + 1, a + n * n + n];
                let bits = 0;
                for (let k = 0; k < 8; k++)
                    if (values[cube[k]] < iso)
                        bits |= 1 << k;
                if (bits === 0 || bits === 255)
                    continue;
                for (const tet of TETS) {
                    const ids = tet.map(i => cube[i]), inside = ids.map(i => values[i] < iso), num = inside.filter(Boolean).length;
                    if (num === 0 || num === 4)
                        continue;
                    const polygon = [];
                    for (const [a, b] of EDGES)
                        if (inside[a] !== inside[b]) {
                            const v = vertex(ids[a], ids[b]);
                            if (!polygon.includes(v))
                                polygon.push(v);
                        }
                    if (polygon.length < 3)
                        continue;
                    const ci = [0, 0, 0], co = [0, 0, 0];
                    for (let k = 0; k < 4; k++) {
                        const p = coords(ids[k]);
                        const sum = inside[k] ? ci : co;
                        for (let c = 0; c < 3; c++)
                            sum[c] += p[c] / (inside[k] ? num : 4 - num);
                    }
                    const dir = vec3.sub(co, ci);
                    if (polygon.length === 4) {
                        const center = [0, 0, 0];
                        for (const i of polygon) {
                            const p = point(i);
                            for (let k = 0; k < 3; k++)
                                center[k] += p[k] * .25;
                        }
                        const u = vec3.normalize(vec3.sub(point(polygon[0]), center)), v = vec3.normalize(vec3.cross(dir, u));
                        polygon.sort((ia, ib) => { const a = vec3.sub(point(ia), center), b = vec3.sub(point(ib), center); return Math.atan2(vec3.dot(a, v), vec3.dot(a, u)) - Math.atan2(vec3.dot(b, v), vec3.dot(b, u)); });
                    }
                    triangle(polygon[0], polygon[1], polygon[2], dir);
                    if (polygon.length === 4)
                        triangle(polygon[0], polygon[2], polygon[3], dir);
                }
            }
        if (indices.length / 3 > maxTriangles)
            throw new Error(`Mesh exceeds ${maxTriangles.toLocaleString()} triangles. Reduce the export resolution.`);
        if (z % 2 === 0) {
            onProgress?.(z / (n - 2));
            await pause();
        }
    }
    onProgress?.(1);
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), resolution: n, domain: { min: grid.min, max: grid.max } };
}
function meshMetrics(mesh, { topology = true } = {}) {
    const { positions: p, indices: t } = mesh;
    let signedVolume = 0, area = 0;
    const edges = topology ? new Map() : null, centroid = [0, 0, 0];
    for (let i = 0; i < t.length; i += 3) {
        const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
        const ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[b], by = p[b + 1], bz = p[b + 2], cx = p[c], cy = p[c + 1], cz = p[c + 2];
        const vx = (by * cz - bz * cy), vy = (bz * cx - bx * cz), vz = (bx * cy - by * cx), v = (ax * vx + ay * vy + az * vz) / 6;
        signedVolume += v;
        for (let k = 0; k < 3; k++)
            centroid[k] += v * (p[a + k] + p[b + k] + p[c + k]) * .25;
        area += Math.hypot((by - ay) * (cz - az) - (bz - az) * (cy - ay), (bz - az) * (cx - ax) - (bx - ax) * (cz - az), (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * .5;
        if (edges)
            for (const [u, v] of [[t[i], t[i + 1]], [t[i + 1], t[i + 2]], [t[i + 2], t[i]]]) {
                const key = Math.min(u, v) * (p.length / 3) + Math.max(u, v);
                edges.set(key, (edges.get(key) || 0) + 1);
            }
    }
    let boundaryEdges = 0, nonManifoldEdges = 0;
    if (edges)
        for (const n of edges.values()) {
            if (n === 1)
                boundaryEdges++;
            if (n > 2)
                nonManifoldEdges++;
        }
    return { vertices: p.length / 3, triangles: t.length / 3, volume: Math.abs(signedVolume), signedVolume, area, centroid: centroid.map(v => Math.abs(signedVolume) > 1e-12 ? v / signedVolume : 0), boundaryEdges, nonManifoldEdges, watertight: topology ? boundaryEdges === 0 && nonManifoldEdges === 0 && t.length > 0 : null };
}
/** Weld triangle soup, rejecting non-finite positions and degenerate triangles. */
function weldMesh(positions, indices = null, tolerance = 1e-5) {
    if (positions.length % 3)
        throw new Error('Mesh coordinates must be XYZ triples.');
    const map = new Map(), out = [], remap = new Uint32Array(positions.length / 3);
    for (let i = 0; i < positions.length; i += 3) {
        if (!Number.isFinite(positions[i]) || !Number.isFinite(positions[i + 1]) || !Number.isFinite(positions[i + 2]))
            throw new Error('Mesh has non-finite coordinates.');
        const key = `${Math.round(positions[i] / tolerance)},${Math.round(positions[i + 1] / tolerance)},${Math.round(positions[i + 2] / tolerance)}`;
        let id = map.get(key);
        if (id === undefined) {
            id = out.length / 3;
            map.set(key, id);
            out.push(positions[i], positions[i + 1], positions[i + 2]);
        }
        remap[i / 3] = id;
    }
    const src = indices ?? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    if (src.length % 3)
        throw new Error('Mesh index count is not a multiple of three.');
    const tris = [];
    for (let i = 0; i < src.length; i += 3) {
        if (src[i] >= remap.length || src[i + 1] >= remap.length || src[i + 2] >= remap.length)
            throw new Error('Mesh index is out of bounds.');
        const a = remap[src[i]], b = remap[src[i + 1]], c = remap[src[i + 2]];
        if (a !== b && b !== c && c !== a)
            tris.push(a, b, c);
    }
    return { positions: new Float32Array(out), indices: new Uint32Array(tris) };
}
function pointTriangleSq(p, a, b, c) {
    const ab = vec3.sub(b, a), ac = vec3.sub(c, a), ap = vec3.sub(p, a), d1 = vec3.dot(ab, ap), d2 = vec3.dot(ac, ap);
    if (d1 <= 0 && d2 <= 0)
        return vec3.dot(ap, ap);
    const bp = vec3.sub(p, b), d3 = vec3.dot(ab, bp), d4 = vec3.dot(ac, bp);
    if (d3 >= 0 && d4 <= d3)
        return vec3.dot(bp, bp);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3), q = vec3.sub(ap, vec3.mul(ab, v));
        return vec3.dot(q, q);
    }
    const cp = vec3.sub(p, c), d5 = vec3.dot(ab, cp), d6 = vec3.dot(ac, cp);
    if (d6 >= 0 && d5 <= d6)
        return vec3.dot(cp, cp);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6), q = vec3.sub(ap, vec3.mul(ac, w));
        return vec3.dot(q, q);
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const q = vec3.sub(bp, vec3.mul(vec3.sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
        return vec3.dot(q, q);
    }
    const denom = va + vb + vc;
    if (Math.abs(denom) < 1e-24)
        return Math.min(vec3.dot(ap, ap), vec3.dot(bp, bp), vec3.dot(cp, cp));
    const v = vb / denom, w = vc / denom, q = vec3.sub(ap, vec3.add(vec3.mul(ab, v), vec3.mul(ac, w)));
    return vec3.dot(q, q);
}
function boxDistanceSq(p, lo, hi) { let d = 0; for (let k = 0; k < 3; k++) {
    const q = Math.max(lo[k] - p[k], 0, p[k] - hi[k]);
    d += q * q;
} return d; }
function rayBox(p, dir, lo, hi) { let tmin = 0, tmax = Infinity; for (let k = 0; k < 3; k++) {
    const a = (lo[k] - p[k]) / dir[k], b = (hi[k] - p[k]) / dir[k];
    tmin = Math.max(tmin, Math.min(a, b));
    tmax = Math.min(tmax, Math.max(a, b));
} return tmax >= tmin; }
function rayTriangle(p, dir, a, b, c) { const e1 = vec3.sub(b, a), e2 = vec3.sub(c, a), h = vec3.cross(dir, e2), det = vec3.dot(e1, h); if (Math.abs(det) < 1e-12)
    return false; const s = vec3.sub(p, a), u = vec3.dot(s, h) / det; if (u < 0 || u > 1)
    return false; const q = vec3.cross(s, e1), v = vec3.dot(dir, q) / det; if (v < 0 || u + v > 1)
    return false; return vec3.dot(e2, q) / det > 1e-9; }
/** Median-split BVH with nearest-triangle distance and parity classification. */
class MeshBVH {
    constructor(mesh) {
        this.mesh = mesh;
        const p = mesh.positions;
        this.triangles = [];
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const v = [0, 1, 2].map(k => Array.from(p.slice(mesh.indices[i + k] * 3, mesh.indices[i + k] * 3 + 3)));
            this.triangles.push({ v, min: [0, 1, 2].map(k => Math.min(...v.map(a => a[k]))), max: [0, 1, 2].map(k => Math.max(...v.map(a => a[k]))) });
        }
        if (!this.triangles.length)
            throw new Error('Mesh has no valid triangles.');
        const build = ids => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const i of ids)
            for (let k = 0; k < 3; k++) {
                lo[k] = Math.min(lo[k], this.triangles[i].min[k]);
                hi[k] = Math.max(hi[k], this.triangles[i].max[k]);
            } if (ids.length <= 10)
            return { lo, hi, ids }; const lengths = hi.map((v, k) => v - lo[k]), axis = lengths.indexOf(Math.max(...lengths)); ids.sort((a, b) => (this.triangles[a].min[axis] + this.triangles[a].max[axis]) - (this.triangles[b].min[axis] + this.triangles[b].max[axis])); const mid = ids.length >> 1; return { lo, hi, left: build(ids.slice(0, mid)), right: build(ids.slice(mid)) }; };
        this.root = build(this.triangles.map((_, i) => i));
        this.bounds = { min: this.root.lo, max: this.root.hi };
    }
    distance(x, y, z) {
        const p = [x, y, z], dir = [1, .371390676354, .529117403], stack = [this.root];
        let best = Infinity, hits = 0;
        while (stack.length) {
            const n = stack.pop();
            if (boxDistanceSq(p, n.lo, n.hi) > best)
                continue;
            if (n.ids) {
                for (const i of n.ids)
                    best = Math.min(best, pointTriangleSq(p, ...this.triangles[i].v));
            }
            else {
                const dl = boxDistanceSq(p, n.left.lo, n.left.hi), dr = boxDistanceSq(p, n.right.lo, n.right.hi);
                if (dl < dr) {
                    stack.push(n.right, n.left);
                }
                else
                    stack.push(n.left, n.right);
            }
        }
        stack.push(this.root);
        while (stack.length) {
            const n = stack.pop();
            if (!rayBox(p, dir, n.lo, n.hi))
                continue;
            if (n.ids) {
                for (const i of n.ids)
                    if (rayTriangle(p, dir, ...this.triangles[i].v))
                        hits++;
            }
            else
                stack.push(n.left, n.right);
        }
        return Math.sqrt(best) * (hits % 2 ? -1 : 1);
    }
}
async function meshToVolume(mesh, resolution = 48, options = {}) {
    const welded = weldMesh(mesh.positions, mesh.indices), metrics = meshMetrics(welded);
    if (!metrics.watertight)
        throw new Error(`Solid import requires a closed manifold mesh (${metrics.boundaryEdges} boundary edges, ${metrics.nonManifoldEdges} non-manifold edges).`);
    const bvh = new MeshBVH(welded), size = Math.max(...bvh.bounds.max.map((v, i) => v - bvh.bounds.min[i])), pad = Math.max(size * .06, .1), domain = { min: bvh.bounds.min.map(v => v - pad), max: bvh.bounds.max.map(v => v + pad) };
    const grid = await sampleGrid((x, y, z) => bvh.distance(x, y, z), domain, resolution, options);
    return { n: grid.n, min: grid.min, max: grid.max, data: grid.values, sourceMetrics: metrics };
}

Object.assign(__exports,{sampleGrid:sampleGrid,extractMesh:extractMesh,meshMetrics:meshMetrics,weldMesh:weldMesh,MeshBVH:MeshBVH,meshToVolume:meshToVolume});
},
2:(__exports,__require)=>{
/** Numeric and application primitives. Distances are millimetres; angles are degrees. */
const EPSILON = 1e-8;
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const vec3 = {
    add: (a, b) => a.map((v, i) => v + b[i]), sub: (a, b) => a.map((v, i) => v - b[i]),
    mul: (a, s) => a.map(v => v * s), dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    length: a => Math.hypot(...a), normalize: a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); }
};
function uid(prefix = 'n') { return `${prefix}_${globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12) ?? Math.random().toString(36).slice(2, 14)}`; }
function clone(value) { return structuredClone(value); }
function assertFinite(value, name = 'value') { if (!Number.isFinite(value))
    throw new TypeError(`${name} must be finite`); return value; }
function hashString(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0).toString(16); }
function validateDomain(d) {
    if (!d || !Array.isArray(d.min) || !Array.isArray(d.max) || d.min.length !== 3 || d.max.length !== 3)
        throw new Error('Domain requires min/max XYZ coordinates.');
    for (let i = 0; i < 3; i++)
        if (!Number.isFinite(d.min[i]) || !Number.isFinite(d.max[i]) || d.max[i] <= d.min[i] || d.max[i] - d.min[i] > 1e6)
            throw new Error('Domain extent must be positive, finite, and at most 1,000,000 mm.');
    return d;
}
function gridInfo(domain, resolution) {
    validateDomain(domain);
    const n = Number(resolution);
    if (!Number.isInteger(n) || n < 4 || n > 192)
        throw new RangeError('Grid resolution must be an integer in [4, 192].');
    return { n, count: n * n * n, min: [...domain.min], max: [...domain.max], step: domain.max.map((x, i) => (x - domain.min[i]) / (n - 1)) };
}
class Emitter {
    #listeners = new Set();
    subscribe(f) { this.#listeners.add(f); return () => this.#listeners.delete(f); }
    emit(value) { for (const f of [...this.#listeners])
        f(value); }
    clear() { this.#listeners.clear(); }
}
class CancelledError extends Error {
    constructor() { super('Operation cancelled'); this.name = 'AbortError'; }
}
function throwIfAborted(signal) { if (signal?.aborted)
    throw new CancelledError(); }
function formatNumber(n, digits = 2) { return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'; }
function downloadFile(data, filename, mime = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function debounce(fn, ms = 100) { let t; const f = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; f.cancel = () => clearTimeout(t); return f; }

Object.assign(__exports,{EPSILON:EPSILON,TAU:TAU,clamp:clamp,lerp:lerp,vec3:vec3,uid:uid,clone:clone,assertFinite:assertFinite,hashString:hashString,validateDomain:validateDomain,gridInfo:gridInfo,Emitter:Emitter,CancelledError:CancelledError,throwIfAborted:throwIfAborted,formatNumber:formatNumber,downloadFile:downloadFile,escapeHTML:escapeHTML,debounce:debounce});
},
3:(__exports,__require)=>{
const { vec3, clamp }=__require(2);
const { sampleVolume }=__require(4);
const heat = t => { const stops = [[.025, .13, .45], [.03, .61, .58], [.88, .78, .12], [.93, .17, .055]], q = clamp(t, 0, 1) * 3, i = Math.min(2, Math.floor(q)), f = q - i; return stops[i].map((x, k) => x + (stops[i + 1][k] - x) * f); };
/** A genuine depth-buffered CPU triangle rasterizer for software-only browser sessions. */
function rasterizeSurface(canvas, ctx, mesh, renderer) {
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

Object.assign(__exports,{rasterizeSurface:rasterizeSurface});
},
4:(__exports,__require)=>{
const { clamp, lerp }=__require(2);
function sdBox(x, y, z, bx, by, bz, r = 0) { r = Math.min(r, bx, by, bz); const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; }
function sdCylinder(x, y, z, r, h) { const a = Math.hypot(x, y) - r, b = Math.abs(z) - h; return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)); }
function sdEllipsoid(x, y, z, a, b, c) { const k0 = Math.hypot(x / a, y / b, z / c), k1 = Math.hypot(x / (a * a), y / (b * b), z / (c * c)); return k1 < 1e-12 ? -Math.min(a, b, c) : k0 * (k0 - 1) / k1; }
function smoothUnion(a, b, k) { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); }
function segmentDistance(x, y, z, ax, ay, az, bx, by, bz) { const vx = bx - ax, vy = by - ay, vz = bz - az; const h = clamp(((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / (vx * vx + vy * vy + vz * vz || 1), 0, 1); return Math.hypot(x - ax - h * vx, y - ay - h * vy, z - az - h * vz); }
function sampleVolume(data, n, min, max, x, y, z) {
    const xx = clamp((x - min[0]) / (max[0] - min[0]) * (n - 1), 0, n - 1), yy = clamp((y - min[1]) / (max[1] - min[1]) * (n - 1), 0, n - 1), zz = clamp((z - min[2]) / (max[2] - min[2]) * (n - 1), 0, n - 1);
    const i = Math.min(n - 2, Math.floor(xx)), j = Math.min(n - 2, Math.floor(yy)), k = Math.min(n - 2, Math.floor(zz)), a = xx - i, b = yy - j, c = zz - k;
    const at = (dx, dy, dz) => data[i + dx + n * (j + dy + n * (k + dz))];
    return lerp(lerp(lerp(at(0, 0, 0), at(1, 0, 0), a), lerp(at(0, 1, 0), at(1, 1, 0), a), b), lerp(lerp(at(0, 0, 1), at(1, 0, 1), a), lerp(at(0, 1, 1), at(1, 1, 1), a), b), c);
}
function gradient(sample, x, y, z, e = .02) { const dx = sample(x + e, y, z) - sample(x - e, y, z), dy = sample(x, y + e, z) - sample(x, y - e, z), dz = sample(x, y, z + e) - sample(x, y, z - e), l = Math.hypot(dx, dy, dz) || 1; return [dx / l, dy / l, dz / l]; }
/** The same primitive definitions used by both the GPU renderer and compute kernels. */
const FIELD_WGSL = `
fn sdBox(p:vec3f,b:vec3f,r0:f32)->f32 {
 let r:f32=min(r0,min(b.x,min(b.y,b.z))); let q:vec3f=abs(p)-(b-vec3f(r));
 return length(max(q,vec3f(0.0)))+min(max(q.x,max(q.y,q.z)),0.0)-r;
}
fn sdCylinder(p:vec3f,r:f32,h:f32)->f32 {
 let d:vec2f=vec2f(length(p.xy)-r,abs(p.z)-h);return min(max(d.x,d.y),0.0)+length(max(d,vec2f(0.0)));
}
fn sdEllipsoid(p:vec3f,r:vec3f)->f32 {
 let k0:f32=length(p/r);let k1:f32=length(p/(r*r));if(k1<0.0000001){return -min(r.x,min(r.y,r.z));}return k0*(k0-1.0)/k1;
}
fn smin(a:f32,b:f32,k:f32)->f32 {let h:f32=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
fn rotX(p:vec3f,a:f32)->vec3f {let c:f32=cos(a);let s:f32=sin(a);return vec3f(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
fn rotY(p:vec3f,a:f32)->vec3f {let c:f32=cos(a);let s:f32=sin(a);return vec3f(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
fn rotZ(p:vec3f,a:f32)->vec3f {let c:f32=cos(a);let s:f32=sin(a);return vec3f(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
fn sdSegment(p:vec3f,a:vec3f,b:vec3f)->f32 {let v:vec3f=b-a;let t:f32=clamp(dot(p-a,v)/max(dot(v,v),0.0000001),0.0,1.0);return length(p-a-v*t);}
fn volumeAt(p:vec3f,base:i32,n:i32,lo:vec3f,hi:vec3f)->f32 {
 let q:vec3f=clamp((p-lo)/(hi-lo)*f32(n-1),vec3f(0.0),vec3f(f32(n-1)));
 let c:vec3i=min(vec3i(floor(q)),vec3i(n-2));let f:vec3f=q-vec3f(c);
 let i:i32=base+c.x+n*(c.y+n*c.z);
 let a:f32=mix(mix(assetAt(i),assetAt(i+1),f.x),mix(assetAt(i+n),assetAt(i+n+1),f.x),f.y);
 let b:f32=mix(mix(assetAt(i+n*n),assetAt(i+n*n+1),f.x),mix(assetAt(i+n*n+n),assetAt(i+n*n+n+1),f.x),f.y);
 let v:f32=mix(a,b,f.z);let d:f32=length(p-clamp(p,lo,hi));if(d>0.0){return d+max(v,0.0);}return v;
}
`;
/** Restricted, internal WGSL-to-GLSL conversion. Not a general purpose shader transpiler. */
function wgslToGLSL(source) {
    const type = t => t.trim().replaceAll('vec3f', 'vec3').replaceAll('vec2f', 'vec2').replaceAll('vec4f', 'vec4').replaceAll('vec3i', 'ivec3').replaceAll('vec2i', 'ivec2').replaceAll('f32', 'float').replaceAll('i32', 'int').replaceAll('u32', 'uint');
    return source.replace(/fn\s+(\w+)\s*\(([^)]*)\)\s*->\s*(\w+)\s*\{/g, (_, name, args, result) => `${type(result)} ${name}(${args.split(',').filter(Boolean).map(arg => { const [n, t] = arg.split(':'); return `${type(t)} ${n.trim()}`; }).join(',')}){`)
        .replace(/\b(?:let|var)\s+(\w+)\s*:\s*(\w+)\s*=/g, (_, name, t) => `${type(t)} ${name}=`)
        .replace(/\b(vec[234]f|vec[23]i|f32|i32|u32)\b/g, t => type(t));
}

Object.assign(__exports,{sdBox:sdBox,sdCylinder:sdCylinder,sdEllipsoid:sdEllipsoid,smoothUnion:smoothUnion,segmentDistance:segmentDistance,sampleVolume:sampleVolume,gradient:gradient,FIELD_WGSL:FIELD_WGSL,wgslToGLSL:wgslToGLSL});
},
5:(__exports,__require)=>{
const { gridInfo, throwIfAborted }=__require(2);
const { thermalSetup, thermalDiagnostics }=__require(6);
async function requestGPU() { if (!globalThis.navigator?.gpu)
    return null; const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); if (!adapter)
    return null; const device = await adapter.requestDevice(); return { adapter, device, info: adapter.info ?? {} }; }
function storageBuffer(device, data, label = 'field buffer', extraUsage = 0) { if (data.byteLength > device.limits.maxStorageBufferBindingSize)
    throw new Error(`${label} exceeds this device's storage-buffer limit.`); const b = device.createBuffer({ label, size: Math.max(4, (data.byteLength + 3) & ~3), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extraUsage }); device.queue.writeBuffer(b, 0, data); return b; }
async function checkedModule(device, code, label) { const module = device.createShaderModule({ code, label }); const info = await module.getCompilationInfo(); const errors = info.messages.filter(x => x.type === 'error'); if (errors.length)
    throw new Error(errors.map(x => `${label}:${x.lineNum}:${x.linePos}: ${x.message}`).join('\n')); return module; }
class GPUCompute {
    constructor(device) { this.device = device; this.cache = new Map(); this.destroyed = false; }
    static async create() { const gpu = await requestGPU(); return gpu ? new GPUCompute(gpu.device) : null; }
    async sample(program, domain, resolution, { signal, onProgress } = {}) {
        throwIfAborted(signal);
        const d = this.device, g = gridInfo(domain, resolution), bytes = g.count * 4, resources = [];
        if (bytes > d.limits.maxStorageBufferBindingSize)
            throw new Error('Requested grid exceeds GPU storage limits.');
        const track = b => (resources.push(b), b);
        let pipeline = this.cache.get(program.key);
        if (!pipeline) {
            const code = program.wgsl + `\nstruct Grid {lo:vec4f, hi:vec4f, size:vec4u}; @group(0) @binding(0) var<uniform> grid:Grid; @group(0) @binding(3) var<storage,read_write> samples:array<f32>;
 @compute @workgroup_size(4,4,4) fn main(@builtin(global_invocation_id) id:vec3u){let n=grid.size.x;if(any(id>=vec3u(n))){return;}let p=mix(grid.lo.xyz,grid.hi.xyz,vec3f(id)/f32(n-1u));samples[id.x+n*(id.y+n*id.z)]=scene(p);}`;
            const module = await checkedModule(d, code, 'Implicit field sampling');
            const bindLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }] });
            pipeline = await d.createComputePipelineAsync({ label: 'Implicit field sampling', layout: d.createPipelineLayout({ bindGroupLayouts: [bindLayout] }), compute: { module, entryPoint: 'main' } });
            this.cache.set(program.key, pipeline);
            if (this.cache.size > 12)
                this.cache.delete(this.cache.keys().next().value);
        }
        try {
            const raw = new ArrayBuffer(48), f = new Float32Array(raw), u = new Uint32Array(raw);
            f.set(g.min, 0);
            f.set(g.max, 4);
            u.set([g.n, g.n, g.n, g.count], 8);
            const uniform = track(d.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
            d.queue.writeBuffer(uniform, 0, raw);
            const p = track(storageBuffer(d, program.parameters, 'Graph parameters')), a = track(storageBuffer(d, program.assets, 'Imported fields'));
            const output = track(d.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })), read = track(d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
            const group = d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: p } }, { binding: 2, resource: { buffer: a } }, { binding: 3, resource: { buffer: output } }] });
            const encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, group);
            const c = Math.ceil(g.n / 4);
            pass.dispatchWorkgroups(c, c, c);
            pass.end();
            encoder.copyBufferToBuffer(output, 0, read, 0, bytes);
            d.queue.submit([encoder.finish()]);
            onProgress?.(.5);
            await read.mapAsync(GPUMapMode.READ);
            throwIfAborted(signal);
            const values = new Float32Array(read.getMappedRange().slice(0));
            read.unmap();
            onProgress?.(1);
            return { ...g, values, backend: 'WebGPU compute' };
        }
        finally {
            for (const b of resources)
                b.destroy();
        }
    }
    async thermal(grid, options = {}, { signal, onProgress } = {}) {
        const s = thermalSetup(grid, options), d = this.device, count = grid.n ** 3, bytes = count * 4, resources = [];
        const track = b => (resources.push(b), b);
        const code = `struct Settings {dim:vec4u,g:vec4f,conv:vec4f,bc:vec4f};
 @group(0) @binding(0) var<storage,read> S:array<f32>;@group(0) @binding(1) var<storage,read> X:array<f32>;@group(0) @binding(2) var<storage,read_write> Y:array<f32>;@group(0) @binding(3) var<uniform> u:Settings;
 @compute @workgroup_size(128) fn main(@builtin(global_invocation_id) gid:vec3u){let i=gid.x;let n=u.dim.x;if(i>=n*n*n){return;}let x=i%n;let y=(i/n)%n;let z=i/(n*n);if(S[i]>=0.0){Y[i]=u.conv.w;return;}if(x==u.dim.y){Y[i]=u.bc.x;return;}if(x==u.dim.z){Y[i]=u.bc.y;return;}
 var rhs=u.bc.z;var diag=0.0;let ids=array<i32,6>(i32(i)-1,i32(i)+1,i32(i)-i32(n),i32(i)+i32(n),i32(i)-i32(n*n),i32(i)+i32(n*n));let valid=array<bool,6>(x>0u,x<n-1u,y>0u,y<n-1u,z>0u,z<n-1u);
 for(var k=0u;k<6u;k++){let axis=k/2u;if(valid[k]){if(S[ids[k]]<0.0){rhs+=u.g[axis]*X[ids[k]];diag+=u.g[axis];continue;}}rhs+=u.conv[axis]*u.conv.w;diag+=u.conv[axis];}Y[i]=X[i];if(diag>0.0){Y[i]=rhs/diag;}}
 `;
        const module = await checkedModule(d, code, 'Finite-volume heat conduction'), pipeline = await d.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
        try {
            const solid = track(storageBuffer(d, grid.values, 'Solid occupancy')), a = track(storageBuffer(d, s.initial, 'Temperature A', GPUBufferUsage.COPY_SRC)), b = track(storageBuffer(d, s.initial, 'Temperature B', GPUBufferUsage.COPY_SRC));
            const raw = new ArrayBuffer(64), f = new Float32Array(raw), u = new Uint32Array(raw);
            u.set([s.n, s.minX, s.maxX, 0]);
            f.set([...s.g, 0], 4);
            f.set([...s.conv, s.ambient], 8);
            f.set([s.hot, s.cold, s.source, 0], 12);
            const uniform = track(d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
            d.queue.writeBuffer(uniform, 0, raw);
            const read = track(d.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }));
            const groups = [[a, b], [b, a]].map(([x, y]) => d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: solid } }, { binding: 1, resource: { buffer: x } }, { binding: 2, resource: { buffer: y } }, { binding: 3, resource: { buffer: uniform } }] }));
            let iterations = 0, current = 0, values = s.initial, stats;
            while (iterations < s.maxIterations) {
                throwIfAborted(signal);
                const batch = Math.min(32, s.maxIterations - iterations), encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
                pass.setPipeline(pipeline);
                for (let k = 0; k < batch; k++) {
                    pass.setBindGroup(0, groups[current]);
                    pass.dispatchWorkgroups(Math.ceil(count / 128));
                    current = 1 - current;
                }
                pass.end();
                encoder.copyBufferToBuffer(current === 0 ? a : b, 0, read, 0, bytes);
                d.queue.submit([encoder.finish()]);
                await read.mapAsync(GPUMapMode.READ);
                values = new Float32Array(read.getMappedRange().slice(0));
                read.unmap();
                iterations += batch;
                stats = thermalDiagnostics(grid, s, values);
                onProgress?.({ fraction: iterations / s.maxIterations, iterations, residual: stats.residual });
                if (stats.converged)
                    break;
            }
            return { kind: 'thermal', values, n: grid.n, min: grid.min, max: grid.max, step: grid.step, iterations, ...stats, settings: options, backend: 'WebGPU finite volume', unit: '°C', label: 'Temperature' };
        }
        finally {
            for (const b of resources)
                b.destroy();
        }
    }
    destroy() { this.destroyed = true; this.cache.clear(); this.device.destroy(); }
}
/** One cancellable worker job at a time; termination also prevents stale result commits. */
class WorkerClient {
    constructor(url, { type = 'module' } = {}) { this.url = url; this.workerType = type; this.worker = null; this.counter = 0; this.pending = null; }
    run(type, payload, onProgress) { this.cancel(); const id = ++this.counter; return new Promise((resolve, reject) => { const worker = new Worker(this.url, { type: this.workerType }); this.worker = worker; this.pending = { id, reject }; worker.onmessage = e => { const m = e.data; if (m.id !== id)
        return; if (m.progress !== undefined) {
        onProgress?.(m.progress);
        return;
    } this.pending = null; this.worker = null; worker.terminate(); if (m.error)
        reject(new Error(m.error));
    else
        resolve(m.result); }; worker.onerror = e => { this.pending = null; this.worker = null; worker.terminate(); reject(new Error(e.message || 'Worker failed.')); }; worker.postMessage({ id, type, payload }); }); }
    cancel() { if (this.worker) {
        this.worker.terminate();
        this.worker = null;
    } if (this.pending) {
        const e = new Error('Operation cancelled');
        e.name = 'AbortError';
        this.pending.reject(e);
        this.pending = null;
    } }
}

Object.assign(__exports,{requestGPU:requestGPU,storageBuffer:storageBuffer,checkedModule:checkedModule,GPUCompute:GPUCompute,WorkerClient:WorkerClient});
},
6:(__exports,__require)=>{
const { clamp, throwIfAborted }=__require(2);
/** Nodal trapezoid integration of the indicator field; intentionally reports its resolution. */
function analyzeGrid(grid, density = 2.7) {
    if (!Number.isFinite(density) || density < 0)
        throw new Error('Density must be a nonnegative finite value.');
    const { n, values, min, step } = grid;
    let weight = 0, insideNodes = 0, boundary = false;
    const moment = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = x + n * (y + n * z);
                if (values[i] >= 0)
                    continue;
                insideNodes++;
                const p = [min[0] + x * step[0], min[1] + y * step[1], min[2] + z * step[2]], w = (x === 0 || x === n - 1 ? .5 : 1) * (y === 0 || y === n - 1 ? .5 : 1) * (z === 0 || z === n - 1 ? .5 : 1);
                weight += w;
                for (let k = 0; k < 3; k++) {
                    moment[k] += p[k] * w;
                    lo[k] = Math.min(lo[k], p[k]);
                    hi[k] = Math.max(hi[k], p[k]);
                }
                if (x === 0 || y === 0 || z === 0 || x === n - 1 || y === n - 1 || z === n - 1)
                    boundary = true;
            }
    const voxelVolume = step[0] * step[1] * step[2], volume = weight * voxelVolume, domainVolume = grid.max.reduce((v, x, i) => v * (x - grid.min[i]), 1);
    return { volume, mass: volume * density / 1000, density, relativeDensity: volume / domainVolume, insideNodes, samples: n ** 3, centroid: moment.map(v => weight ? v / weight : 0), occupiedBounds: insideNodes ? { min: lo, max: hi } : null, domainClipped: boundary, spacing: step, resolution: n, method: 'Trapezoidal occupancy integration' };
}
function thermalSetup(grid, { hot = 120, cold = 20, ambient = 20, conductivity = 167, convection = 8, heatSource = 0, tolerance = .01, maxIterations = 1000 } = {}) {
    for (const [name, v] of Object.entries({ hot, cold, ambient, conductivity, convection, heatSource, tolerance, maxIterations }))
        if (!Number.isFinite(v))
            throw new Error(`${name} must be finite.`);
    if (conductivity <= 0 || convection < 0 || tolerance <= 0 || maxIterations < 1 || maxIterations > 20000)
        throw new Error('Invalid thermal parameters.');
    const { n, values, step } = grid;
    let minX = n, maxX = -1, occupied = 0;
    for (let i = 0; i < values.length; i++)
        if (values[i] < 0) {
            const x = i % n;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            occupied++;
        }
    if (maxX <= minX)
        throw new Error('The sampled body needs at least two occupied X planes. Increase resolution or change the domain.');
    const h = step.map(x => x * .001), area = [h[1] * h[2], h[0] * h[2], h[0] * h[1]], g = area.map((a, i) => conductivity * a / h[i]), conv = area.map(a => convection * a), source = heatSource * h[0] * h[1] * h[2], initial = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++)
        initial[i] = values[i] < 0 ? hot + (cold - hot) * clamp((i % n - minX) / (maxX - minX), 0, 1) : ambient;
    return { n, minX, maxX, occupied, g, conv, source, hot, cold, ambient, conductivity, convection, heatSource, tolerance, maxIterations: Math.floor(maxIterations), initial };
}
function thermalUpdate(i, x, y, z, t, grid, s) { if (grid.values[i] >= 0)
    return s.ambient; if (x === s.minX)
    return s.hot; if (x === s.maxX)
    return s.cold; const n = s.n, ids = [i - 1, i + 1, i - n, i + n, i - n * n, i + n * n], valid = [x > 0, x < n - 1, y > 0, y < n - 1, z > 0, z < n - 1]; let rhs = s.source, diag = 0; for (let k = 0; k < 6; k++) {
    const axis = k >> 1;
    if (valid[k] && grid.values[ids[k]] < 0) {
        rhs += s.g[axis] * t[ids[k]];
        diag += s.g[axis];
    }
    else {
        rhs += s.conv[axis] * s.ambient;
        diag += s.conv[axis];
    }
} return diag > 0 ? rhs / diag : t[i]; }
function thermalDiagnostics(grid, s, temperature) {
    let residual = 0, min = Infinity, max = -Infinity, hotPower = 0, coldPower = 0, convectivePower = 0;
    const { n } = s;
    for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const i = x + n * (y + n * z);
                if (grid.values[i] >= 0)
                    continue;
                const t = temperature[i];
                min = Math.min(min, t);
                max = Math.max(max, t);
                residual = Math.max(residual, Math.abs(thermalUpdate(i, x, y, z, temperature, grid, s) - t));
                const ids = [i - 1, i + 1, i - n, i + n, i - n * n, i + n * n], valid = [x > 0, x < n - 1, y > 0, y < n - 1, z > 0, z < n - 1];
                for (let k = 0; k < 6; k++) {
                    const axis = k >> 1;
                    if (valid[k] && grid.values[ids[k]] < 0) {
                        const q = s.g[axis] * (t - temperature[ids[k]]);
                        if (x === s.minX)
                            hotPower += q;
                        if (x === s.maxX)
                            coldPower += q;
                    }
                    else {
                        const q = s.conv[axis] * (t - s.ambient);
                        convectivePower += q;
                        if (x === s.minX)
                            hotPower += q;
                        if (x === s.maxX)
                            coldPower += q;
                    }
                }
            }
    for (let i = 0; i < grid.values.length; i++) {
        if (grid.values[i] >= 0)
            continue;
        if (i % n === s.minX)
            hotPower -= s.source;
        if (i % n === s.maxX)
            coldPower -= s.source;
    }
    const generated = s.occupied * s.source;
    return { residual, minValue: min, maxValue: max, hotPower, coldPower, convectivePower, generatedPower: generated, energyImbalance: hotPower + coldPower + generated - convectivePower, converged: residual <= s.tolerance };
}
/** Steady-state finite-volume heat conduction on occupied voxels. No structural claims. */
async function solveThermal(grid, options = {}, { signal, onProgress } = {}) {
    const s = thermalSetup(grid, options), { n } = s;
    let t = s.initial, next = new Float32Array(t.length), iterations = 0, diagnostics;
    for (let iter = 0; iter < s.maxIterations; iter++) {
        throwIfAborted(signal);
        for (let z = 0; z < n; z++)
            for (let y = 0; y < n; y++)
                for (let x = 0; x < n; x++) {
                    const i = x + n * (y + n * z);
                    next[i] = thermalUpdate(i, x, y, z, t, grid, s);
                }
        [t, next] = [next, t];
        iterations = iter + 1;
        if (iterations % 20 === 0 || iterations === s.maxIterations) {
            diagnostics = thermalDiagnostics(grid, s, t);
            onProgress?.({ fraction: iterations / s.maxIterations, iterations, residual: diagnostics.residual });
            if (diagnostics.converged)
                break;
            await new Promise(r => setTimeout(r, 0));
        }
    }
    diagnostics ??= thermalDiagnostics(grid, s, t);
    return { kind: 'thermal', values: t, n, min: grid.min, max: grid.max, step: grid.step, iterations, ...diagnostics, settings: options, backend: 'CPU finite volume', unit: '°C', label: 'Temperature' };
}
__exports.solveElasticity=__require(7).solveElasticity;
__exports.optimizeTopology=__require(7).optimizeTopology;
__exports.hexElement=__require(7).hexElement;

Object.assign(__exports,{analyzeGrid:analyzeGrid,thermalSetup:thermalSetup,thermalDiagnostics:thermalDiagnostics,solveThermal:solveThermal});
},
7:(__exports,__require)=>{
const { clamp, throwIfAborted, validateDomain }=__require(2);
const CORNERS = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const OFFSETS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const sleep = () => new Promise(r => setTimeout(r, 0));
function constitutive(E, nu) { const D = new Float64Array(36), lambda = E * nu / ((1 + nu) * (1 - 2 * nu)), mu = E / (2 * (1 + nu)); for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
        D[i * 6 + j] = lambda + (i === j ? 2 * mu : 0); for (let i = 3; i < 6; i++)
    D[i * 6 + i] = mu; return D; }
function strainMatrix(h, xi, eta, zeta) { const B = new Float64Array(6 * 24); for (let i = 0; i < 8; i++) {
    const [a, b, c] = CORNERS[i], dx = a * (1 + b * eta) * (1 + c * zeta) / (4 * h[0]), dy = b * (1 + a * xi) * (1 + c * zeta) / (4 * h[1]), dz = c * (1 + a * xi) * (1 + b * eta) / (4 * h[2]), j = i * 3;
    B[j] = dx;
    B[24 + j + 1] = dy;
    B[48 + j + 2] = dz;
    B[72 + j] = dy;
    B[72 + j + 1] = dx;
    B[96 + j + 1] = dz;
    B[96 + j + 2] = dy;
    B[120 + j] = dz;
    B[120 + j + 2] = dx;
} return B; }
/** Fully integrated trilinear 8-node hexahedron. Units: mm, N, MPa. */
function hexElement(h, E = 1, nu = .3) {
    if (!Array.isArray(h) || h.length !== 3 || !Number.isFinite(nu) || h.some(x => !Number.isFinite(x) || x <= 0) || !Number.isFinite(E) || E <= 0 || nu <= -.99 || nu >= .499)
        throw new Error('Invalid elasticity material or element dimensions.');
    const D = constitutive(E, nu), K = new Float64Array(576), a = 1 / Math.sqrt(3), det = h[0] * h[1] * h[2] / 8;
    for (const x of [-a, a])
        for (const y of [-a, a])
            for (const z of [-a, a]) {
                const B = strainMatrix(h, x, y, z), DB = new Float64Array(144);
                for (let i = 0; i < 6; i++)
                    for (let j = 0; j < 24; j++)
                        for (let k = 0; k < 6; k++)
                            DB[i * 24 + j] += D[i * 6 + k] * B[k * 24 + j];
                for (let i = 0; i < 24; i++)
                    for (let j = 0; j < 24; j++) {
                        let v = 0;
                        for (let k = 0; k < 6; k++)
                            v += B[k * 24 + i] * DB[k * 24 + j];
                        K[i * 24 + j] += v * det;
                    }
            }
    return { K, B: strainMatrix(h, 0, 0, 0), D };
}
function makeProblem(sample, domain, n, { E = 69000, nu = .33, load = [0, 0, -100] } = {}) {
    validateDomain(domain);
    if (!Number.isFinite(E) || E <= 0 || !Number.isFinite(nu) || nu <= -.99 || nu >= .499)
        throw new Error('Invalid elastic material.');
    if (!Number.isInteger(n) || n < 4 || n > 24)
        throw new Error('Elasticity resolution must be 4–24 elements per axis.');
    if (!Array.isArray(load) || load.length !== 3 || load.some(x => !Number.isFinite(x)) || Math.hypot(...load) === 0)
        throw new Error('Load must be a nonzero finite XYZ vector.');
    const h = domain.max.map((v, i) => (v - domain.min[i]) / n), N = n + 1, globalCount = N ** 3, nodeMap = new Int32Array(globalCount).fill(-1), nodes = [], elements = [], elementLookup = new Int32Array(n ** 3).fill(-1);
    let minX = N, maxX = -1;
    const getNode = (x, y, z) => { const gid = x + N * (y + N * z); if (nodeMap[gid] === -1) {
        nodeMap[gid] = nodes.length;
        nodes.push({ x, y, z, gid });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
    } return nodeMap[gid]; };
    for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                if (sample(domain.min[0] + (x + .5) * h[0], domain.min[1] + (y + .5) * h[1], domain.min[2] + (z + .5) * h[2]) >= 0)
                    continue;
                const cn = OFFSETS.map(([dx, dy, dz]) => getNode(x + dx, y + dy, z + dz)), dofs = new Uint32Array(24);
                cn.forEach((v, i) => dofs.set([3 * v, 3 * v + 1, 3 * v + 2], i * 3));
                elementLookup[x + n * (y + n * z)] = elements.length;
                elements.push({ x, y, z, nodes: cn, dofs });
            }
    if (elements.length < 2 || maxX <= minX)
        throw new Error('No usable finite-element solid at this resolution.');
    const parent = Int32Array.from({ length: nodes.length }, (_, i) => i), find = i => { while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
    } return i; };
    for (const e of elements) {
        const root = find(e.nodes[0]);
        for (const i of e.nodes)
            parent[find(i)] = root;
    }
    const anchored = new Set(nodes.flatMap((v, i) => v.x === minX ? [find(i)] : []));
    const floating = new Set(nodes.map((_, i) => find(i)).filter(root => !anchored.has(root)));
    if (floating.size)
        throw new Error(`${floating.size} sampled component(s) do not reach the fixed X face. Refine the voxel grid or use a connected solid design domain.`);
    const ndof = nodes.length * 3, fixed = new Uint8Array(ndof), F = new Float64Array(ndof), loaded = nodes.filter(v => v.x === maxX).length;
    nodes.forEach((v, i) => { if (v.x === minX)
        fixed.fill(1, i * 3, i * 3 + 3); if (v.x === maxX)
        for (let k = 0; k < 3; k++)
            F[i * 3 + k] = load[k] / loaded; });
    const element = hexElement(h, 1, nu);
    return { n, N, h, domain, E, nu, load, nodes, elements, elementLookup, nodeMap, ndof, fixed, F, unitK: element.K, B: element.B, D: constitutive(E, nu), minX, maxX };
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++)
    s += a[i] * b[i]; return s; };
async function solvePCG(problem, scale, { tolerance = 1e-7, maxIterations = 700, signal, onProgress, initial = null } = {}) {
    if (!Number.isFinite(tolerance) || tolerance <= 0 || !Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 20000)
        throw new Error('Invalid PCG settings.');
    const { ndof, elements, unitK: K, fixed, F } = problem, u = initial ? new Float64Array(initial) : new Float64Array(ndof), diag = new Float64Array(ndof), local = new Float64Array(24);
    for (let ei = 0; ei < elements.length; ei++) {
        const e = elements[ei], s = scale[ei];
        for (let a = 0; a < 24; a++)
            diag[e.dofs[a]] += K[a * 24 + a] * s;
    }
    for (let i = 0; i < ndof; i++)
        if (fixed[i]) {
            diag[i] = 1;
            u[i] = 0;
        }
    const multiply = (x, out) => { out.fill(0); for (let ei = 0; ei < elements.length; ei++) {
        const ids = elements[ei].dofs, s = scale[ei];
        for (let j = 0; j < 24; j++)
            local[j] = x[ids[j]];
        for (let i = 0; i < 24; i++) {
            if (fixed[ids[i]])
                continue;
            let v = 0;
            const row = i * 24;
            for (let j = 0; j < 24; j++)
                v += K[row + j] * local[j];
            out[ids[i]] += v * s;
        }
    } for (let i = 0; i < ndof; i++)
        if (fixed[i])
            out[i] = x[i]; };
    const r = new Float64Array(ndof), z = new Float64Array(ndof), p = new Float64Array(ndof), Ap = new Float64Array(ndof);
    multiply(u, Ap);
    for (let i = 0; i < ndof; i++) {
        r[i] = F[i] - Ap[i];
        z[i] = r[i] / Math.max(diag[i], 1e-20);
        p[i] = z[i];
    }
    const normF = Math.sqrt(dot(F, F)) || 1;
    let rz = dot(r, z), relativeResidual = Math.sqrt(dot(r, r)) / normF, iterations = 0;
    while (iterations < maxIterations && relativeResidual > tolerance) {
        throwIfAborted(signal);
        multiply(p, Ap);
        const den = dot(p, Ap);
        if (!Number.isFinite(den) || den <= 1e-30)
            break;
        const alpha = rz / den;
        for (let i = 0; i < ndof; i++) {
            u[i] += alpha * p[i];
            r[i] -= alpha * Ap[i];
            z[i] = r[i] / Math.max(diag[i], 1e-20);
        }
        const next = dot(r, z), beta = next / rz;
        for (let i = 0; i < ndof; i++)
            p[i] = z[i] + beta * p[i];
        rz = next;
        iterations++;
        relativeResidual = Math.sqrt(dot(r, r)) / normF;
        if (iterations % 12 === 0) {
            onProgress?.({ iterations, relativeResidual });
            await sleep();
        }
    }
    // Recompute the true residual; recurrent CG residuals can drift in ill-conditioned systems.
    multiply(u, Ap);
    for (let i = 0; i < ndof; i++)
        r[i] = F[i] - Ap[i];
    relativeResidual = Math.sqrt(dot(r, r)) / normF;
    return { u, iterations, relativeResidual, converged: relativeResidual <= tolerance };
}
function elementEnergy(problem, e, u) { const ids = e.dofs, K = problem.unitK; let energy = 0; for (let i = 0; i < 24; i++) {
    let row = 0;
    for (let j = 0; j < 24; j++)
        row += K[i * 24 + j] * u[ids[j]];
    energy += u[ids[i]] * row;
} return energy; }
async function solveElasticity(sample, domain, { resolution = 12, E = 69000, nu = .33, load = [0, 0, -100], tolerance = 1e-7, maxIterations = 700 } = {}, hooks = {}) {
    const problem = makeProblem(sample, domain, resolution, { E, nu, load }), scale = new Float64Array(problem.elements.length).fill(E), solution = await solvePCG(problem, scale, { ...hooks, tolerance, maxIterations });
    const { N, nodes, elements, B, D } = problem, values = new Float32Array(N ** 3), counts = new Uint16Array(N ** 3), displacements = new Float32Array(N ** 3 * 3);
    let maxDisplacement = 0, maxStress = 0;
    for (let i = 0; i < nodes.length; i++) {
        const ux = solution.u[i * 3], uy = solution.u[i * 3 + 1], uz = solution.u[i * 3 + 2];
        maxDisplacement = Math.max(maxDisplacement, Math.hypot(ux, uy, uz));
        displacements.set([ux, uy, uz], nodes[i].gid * 3);
    }
    for (const e of elements) {
        const strain = new Float64Array(6), stress = new Float64Array(6);
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 24; j++)
                strain[i] += B[i * 24 + j] * solution.u[e.dofs[j]];
        for (let i = 0; i < 6; i++)
            for (let j = 0; j < 6; j++)
                stress[i] += D[i * 6 + j] * strain[j];
        const [x, y, z, xy, yz, zx] = stress, vm = Math.sqrt(.5 * ((x - y) ** 2 + (y - z) ** 2 + (z - x) ** 2) + 3 * (xy * xy + yz * yz + zx * zx));
        maxStress = Math.max(maxStress, vm);
        for (const ni of e.nodes) {
            const gid = nodes[ni].gid;
            values[gid] += vm;
            counts[gid]++;
        }
    }
    for (let i = 0; i < values.length; i++)
        if (counts[i])
            values[i] /= counts[i];
    const compliance = dot(problem.F, solution.u);
    return { kind: 'elasticity', values, n: N, min: domain.min, max: domain.max, step: problem.h, minValue: 0, maxValue: maxStress, iterations: solution.iterations, relativeResidual: solution.relativeResidual, converged: solution.converged, maxDisplacement, maxStress, compliance, strainEnergy: .5 * compliance, elements: elements.length, degreesOfFreedom: problem.ndof, displacements, backend: 'CPU matrix-free Hex8 FEM', unit: 'MPa', label: 'von Mises stress', settings: { resolution, E, nu, load, tolerance, maxIterations }, fixedX: domain.min[0] + problem.minX * problem.h[0], loadedX: domain.min[0] + problem.maxX * problem.h[0] };
}
/** SIMP compliance minimization; sensitivity filtering and optimality-criteria volume update. */
async function optimizeTopology(sample, domain, { resolution = 10, volumeFraction = .4, iterations = 15, E = 69000, nu = .33, load = [0, 0, -100], penalty = 3, filterRadius = 1.5 } = {}, { signal, onProgress } = {}) {
    if (![volumeFraction, iterations, penalty, filterRadius].every(Number.isFinite) || !Number.isInteger(iterations) || penalty < 1 || filterRadius <= 0 || filterRadius > 5)
        throw new Error('Invalid topology settings.');
    if (volumeFraction < .1 || volumeFraction > .9 || iterations < 1 || iterations > 80 || resolution > 18)
        throw new Error('Topology settings out of bounds.');
    const p = makeProblem(sample, domain, resolution, { E, nu, load }), m = p.elements.length, rho = new Float64Array(m).fill(volumeFraction), history = [], Emin = 1e-5, neighbors = [];
    let u = null;
    const R = Math.ceil(filterRadius);
    for (const e of p.elements) {
        const list = [];
        let weight = 0;
        for (let dz = -R; dz <= R; dz++)
            for (let dy = -R; dy <= R; dy++)
                for (let dx = -R; dx <= R; dx++) {
                    const x = e.x + dx, y = e.y + dy, z = e.z + dz, w = filterRadius - Math.hypot(dx, dy, dz);
                    if (w <= 0 || x < 0 || y < 0 || z < 0 || x >= p.n || y >= p.n || z >= p.n)
                        continue;
                    const j = p.elementLookup[x + p.n * (y + p.n * z)];
                    if (j >= 0) {
                        list.push([j, w]);
                        weight += w;
                    }
                }
        neighbors.push({ list, weight });
    }
    let lastConverged = true;
    for (let iter = 0; iter < iterations; iter++) {
        throwIfAborted(signal);
        const scale = Float64Array.from(rho, r => E * (Emin + (1 - Emin) * r ** penalty));
        const solution = await solvePCG(p, scale, { signal, initial: u, tolerance: 2e-5, maxIterations: 900 });
        u = solution.u;
        lastConverged = solution.converged;
        if (!solution.converged)
            throw new Error(`Topology iteration ${iter + 1}: elasticity solve did not converge (relative residual ${solution.relativeResidual.toExponential(2)}).`);
        const sensitivity = Float64Array.from(p.elements, (e, i) => -E * (1 - Emin) * penalty * rho[i] ** (penalty - 1) * elementEnergy(p, e, u)), filtered = new Float64Array(m);
        for (let i = 0; i < m; i++) {
            let sum = 0;
            for (const [j, w] of neighbors[i].list)
                sum += w * rho[j] * sensitivity[j];
            filtered[i] = sum / (Math.max(.001, rho[i]) * neighbors[i].weight);
        }
        const candidate = new Float64Array(m);
        let low = 0, high = Math.max(...filtered.map(x => -x)) * 1e4 + 1;
        for (let k = 0; k < 70; k++) {
            const lambda = .5 * (low + high);
            let sum = 0;
            for (let i = 0; i < m; i++) {
                candidate[i] = clamp(rho[i] * Math.sqrt(Math.max(0, -filtered[i] / lambda)), Math.max(.001, rho[i] - .16), Math.min(1, rho[i] + .16));
                sum += candidate[i];
            }
            if (sum > volumeFraction * m)
                low = lambda;
            else
                high = lambda;
            if ((high - low) / (high + low + 1e-20) < 1e-5)
                break;
        }
        let change = 0, mean = 0;
        for (let i = 0; i < m; i++) {
            change = Math.max(change, Math.abs(candidate[i] - rho[i]));
            mean += rho[i];
        }
        const record = { iteration: iter + 1, compliance: dot(p.F, u), volumeFraction: mean / m, nextVolumeFraction: candidate.reduce((a, b) => a + b, 0) / m, change, linearIterations: solution.iterations, linearResidual: solution.relativeResidual };
        history.push(record);
        rho.set(candidate);
        onProgress?.({ ...record, fraction: (iter + 1) / iterations });
        await sleep();
        if (iter >= 9 && change < .015)
            break;
    }
    // Export the thresholded nodal density as a padded implicit volume, retaining the design envelope.
    const N = p.N, nodeDensity = new Float64Array(N ** 3), counts = new Uint16Array(N ** 3);
    p.elements.forEach((e, i) => { for (const ni of e.nodes) {
        const gid = p.nodes[ni].gid;
        nodeDensity[gid] += rho[i];
        counts[gid]++;
    } });
    for (let i = 0; i < nodeDensity.length; i++)
        if (counts[i])
            nodeDensity[i] /= counts[i];
    const n = N + 2, min = domain.min.map((v, i) => v - p.h[i]), max = domain.max.map((v, i) => v + p.h[i]), h = Math.min(...p.h), data = new Float32Array(n ** 3).fill(h);
    for (let z = 0; z < N; z++)
        for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
                const gid = x + N * (y + N * z), pos = [domain.min[0] + x * p.h[0], domain.min[1] + y * p.h[1], domain.min[2] + z * p.h[2]];
                data[(x + 1) + n * ((y + 1) + n * (z + 1))] = Math.max((.5 - nodeDensity[gid]) * h, sample(...pos));
            }
    return { asset: { n, min, max, data }, densities: new Float32Array(rho), history, converged: lastConverged, iterations: history.length, volumeFraction: rho.reduce((a, b) => a + b, 0) / m, settings: { resolution, volumeFraction, iterations, E, nu, load, penalty, filterRadius }, note: 'The 0.5-density threshold changes volume and may disconnect features. Re-mesh and validate the thresholded body independently.' };
}

Object.assign(__exports,{hexElement:hexElement,solveElasticity:solveElasticity,optimizeTopology:optimizeTopology});
}};function __require(id){if(__cache[id])return __cache[id];const value={};__cache[id]=value;__modules[id](value,__require);return value;}return __require(0);})();
export const ImplicitRenderer=__entry.ImplicitRenderer;
export const OrbitCamera=__entry.OrbitCamera;
