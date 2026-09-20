import { ImplicitRenderer } from '../packages/render/src/index.js';
import { compileDocument } from '../packages/compile/src/index.js';
import { EXAMPLES } from '../app/examples.js';
window.errors = [];
window.renderer = new ImplicitRenderer(document.querySelector('canvas'), { onError: e => { window.errors.push(e.message); console.error(e); }, onStatus: s => window.statusInfo = s });
(async () => { try {
    await renderer.init({ forceWebGL: window.forceWebGL ?? false });
    const d = EXAMPLES[0].make();
    renderer.setDomain(d.domain, { fit: true });
    await renderer.setProgram(compileDocument(d));
    window.ready = true;
}
catch (e) {
    window.errors.push(e.stack);
    console.error(e);
} })();
