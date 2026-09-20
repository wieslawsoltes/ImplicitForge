"""End-to-end regression tests for the portable app, including real worker jobs.
Run after npm run build. Requires Python Playwright and a Chromium executable.
Uses set_content: it performs no network navigation and works in managed browsers.
"""
import asyncio, json, os, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
    results=[];errors=[];console_errors=[];start=time.monotonic()
    downloads=ROOT/'tests/artifacts';downloads.mkdir(exist_ok=True)
    def passed(name,details=None):
        row={'name':name,'status':'passed'}
        if details is not None: row['details']=details
        results.append(row);print('PASS',name,details or '',flush=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage']+os.environ.get('CHROMIUM_ARGS','').split())
        page=await browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1,accept_downloads=True)
        page.set_default_timeout(10000)
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.on('console',lambda m: console_errors.append(m.text) if m.type=='error' else None)
        async def wait(expression,timeout=30000):await page.wait_for_function(expression,timeout=timeout,polling=100)
        async def click(action):await page.locator(f'[data-action="{action}"]').first.click()
        async def ready_model():
            await wait('ImplicitForge.state.lastError === null && document.querySelector("#graph-status").textContent.includes("compiled")')
            await page.wait_for_timeout(250)
        async def setting(name,value):
            field=page.locator(f'#setting-{name}');await field.fill(str(value));await field.press('Tab')
        async def mode(value):await page.locator('#analysis-mode').select_option(value)
        try:
            await page.set_content((ROOT/'ImplicitForge.html').read_text(),wait_until='domcontentloaded')
            await wait('window.__IMPLICITFORGE_READY__ === true',60000)
            await wait('ImplicitForge.state.metrics !== null')
            initial=await page.evaluate('({backend:ImplicitForge.renderer.backend,nodes:ImplicitForge.store.value.nodes.length,volume:ImplicitForge.state.metrics.volume,webgpu:!!navigator.gpu,secure:isSecureContext})')
            assert initial['volume']>1000 and initial['nodes']==13
            passed('Portable startup, real surface rendering and worker evaluation',initial)
            await page.wait_for_timeout(300)
            await page.screenshot(path=str(ROOT/'docs/workbench.png'))
            await page.get_by_label('Cell size',exact=True).fill('12.5');await page.get_by_label('Cell size',exact=True).press('Tab')
            await wait('ImplicitForge.store.value.nodes.find(n=>n.type==="gyroid").params.cell===12.5')
            await click('undo');await wait('ImplicitForge.store.value.nodes.find(n=>n.type==="gyroid").params.cell===10.5')
            await click('redo');await wait('ImplicitForge.store.value.nodes.find(n=>n.type==="gyroid").params.cell===12.5')
            passed('Parameter editing, undo and redo through UI')
            await click('duplicate');assert await page.evaluate('ImplicitForge.store.value.nodes.length')==14
            await click('undo');assert await page.evaluate('ImplicitForge.store.value.nodes.length')==13
            passed('Block duplication and reversible document transaction')
            await click('library');await page.locator('[data-add="sphere"]').click();await click('output')
            await page.get_by_label('Radius',exact=True).fill('15');await page.get_by_label('Radius',exact=True).press('Tab');await ready_model()
            assert await page.evaluate('ImplicitForge.state.program.sample(0,0,0)')==-15
            passed('Add a primitive, set output and compile the edited field')
            await page.evaluate('ImplicitForge.evaluate(32)');assert await page.evaluate('ImplicitForge.state.metrics.volume')>13000
            passed('Independent worker volume calculation for new output')
            pos=await page.evaluate('({...ImplicitForge.store.value.nodes.find(n=>n.id===ImplicitForge.state.selected).position})')
            header=page.locator('.graph-node.selected .node-header');box=await header.bounding_box()
            await page.mouse.move(box['x']+60,box['y']+16);await page.mouse.down();await page.mouse.move(box['x']+95,box['y']+36,steps=4);await page.mouse.up()
            now=await page.evaluate('({...ImplicitForge.store.value.nodes.find(n=>n.id===ImplicitForge.state.selected).position})')
            assert now!=pos;passed('Graph pointer dragging commits node coordinates')
            await click('section');await wait('ImplicitForge.renderer.clip===true');await page.wait_for_timeout(700)
            assert await page.evaluate('ImplicitForge.state.program.sample(0,0,0)')==-15
            passed('Section plane changes visualization without mutating the model')
            async with page.expect_download(timeout=20000) as download:
                await click('save')
            saved=await download.value;project_path=downloads/'browser-project.iforge';await saved.save_as(str(project_path))
            project=json.loads(project_path.read_text());assert next(n for n in project['nodes'] if n['id']==project['root'])['params']['radius']==15
            passed('Save project produces parseable full graph JSON')
            await click('export');await page.locator('#export-resolution').select_option('64')
            async with page.expect_download(timeout=30000) as download:
                await page.locator('#export-now').click()
            exported=await download.value;mesh_path=downloads/'browser-sphere.stl';await exported.save_as(str(mesh_path));assert mesh_path.stat().st_size>10000
            m=await page.evaluate('ImplicitForge.state.meshResult.metrics');assert m['watertight'] and abs(m['volume']-4*3.141592653589793*15**3/3)<150
            passed('Real binary STL export ignores display clipping and closes correctly',{'triangles':m['triangles'],'volume':m['volume']})
            await page.locator('[data-action="workspace"][data-tab="fields"]').click();await ready_model()
            assert await page.evaluate('ImplicitForge.renderer.mode')==1
            await page.screenshot(path=str(ROOT/'docs/field-design.png'))
            passed('Scalar field workspace and coloring')
            await click('examples');await page.locator('[data-example="cantilever"]').click()
            if await page.locator('[data-confirm]').count():await page.locator('[data-confirm]').click()
            await wait('ImplicitForge.store.value.name.startsWith("Cantilever")');await ready_model()
            await page.locator('[data-action="workspace"][data-tab="analysis"]').click();await mode('elasticity');await setting('resolution',5);await click('run-analysis')
            await wait('!ImplicitForge.state.busy && ImplicitForge.state.analysis?.kind==="elasticity"',45000)
            a=await page.evaluate('({converged:ImplicitForge.state.analysis.converged,residual:ImplicitForge.state.analysis.relativeResidual,displacement:ImplicitForge.state.analysis.maxDisplacement,elements:ImplicitForge.state.analysis.elements})')
            assert a['converged'] and a['residual']<1e-5
            await page.wait_for_timeout(350);await page.screenshot(path=str(ROOT/'docs/elasticity.png'))
            passed('Hex8 FEM worker solve and stress visualization',a)
            await mode('thermal');await setting('resolution',12);await setting('maxIterations',500);await click('run-analysis')
            await wait('!ImplicitForge.state.busy && ImplicitForge.state.analysis?.kind==="thermal"',45000)
            a=await page.evaluate('({converged:ImplicitForge.state.analysis.converged,residual:ImplicitForge.state.analysis.residual,imbalance:ImplicitForge.state.analysis.energyImbalance})');assert a['converged']
            passed('Thermal worker solve and convergence reporting',a)
            await mode('sweep');await setting('min',1);await setting('max',6);await setting('steps',3);await setting('resolution',24);await click('run-analysis')
            await wait('!ImplicitForge.state.busy && ImplicitForge.state.sweep?.length===3')
            volumes=await page.evaluate('ImplicitForge.state.sweep.map(r=>r.volume)');assert volumes[0]>volumes[-1]
            assert await page.evaluate('ImplicitForge.store.value.nodes[0].params.radius')==.5
            passed('Parameter sweep changes measured volume without changing the document',volumes)
            await mode('topology');await setting('resolution',4);await setting('iterations',4);await click('run-analysis')
            await wait('!ImplicitForge.state.busy && ImplicitForge.state.topology?.iterations===4',45000)
            passed('SIMP optimization runs through UI',await page.evaluate('({iterations:ImplicitForge.state.topology.iterations,fraction:ImplicitForge.state.topology.volumeFraction})'))
            await click('apply-topology');await wait('ImplicitForge.store.value.nodes.find(n=>n.id===ImplicitForge.store.value.root).type==="volume"');await ready_model()
            assert await page.evaluate('ImplicitForge.state.program.assets.length')>1
            passed('Optimized density is converted to a new editable implicit-volume block')
            await page.evaluate('(()=>{ImplicitForge.runJob("mesh",{resolution:192},()=>{window.__STALE_RESULT__=true});ImplicitForge.actions.cancel()})()');await page.wait_for_timeout(300)
            assert await page.evaluate('!ImplicitForge.state.busy && !window.__STALE_RESULT__')
            passed('Cancellation rejects stale worker result commits')
            await page.locator('#open-file').set_input_files(str(project_path));await wait('ImplicitForge.store.value.nodes.find(n=>n.id===ImplicitForge.store.value.root).type==="sphere"');await ready_model()
            assert await page.evaluate('ImplicitForge.state.program.sample(0,0,0)')==-15
            passed('Project file reopen restores the modeled body')
            await page.locator('#open-file').set_input_files(str(mesh_path));await page.locator('#import-resolution').select_option('32');await page.locator('#import-now').click()
            await wait('!ImplicitForge.state.busy && ImplicitForge.store.value.nodes.find(n=>n.id===ImplicitForge.store.value.root).type==="volume"',60000);await ready_model()
            assert await page.evaluate('ImplicitForge.state.program.sample(0,0,0)')<0
            passed('STL import, BVH signed distance and reconstructed implicit body')
            await page.locator('[data-action="workspace"][data-tab="design"]').click();await click('theme')
            assert await page.evaluate('document.documentElement.dataset.theme')=='light';await page.screenshot(path=str(ROOT/'docs/light-theme.png'));await click('theme')
            await page.set_viewport_size({'width':430,'height':900});await page.wait_for_timeout(450)
            if await page.evaluate('document.querySelector(".workbench").classList.contains("show-inspector")'):await click('properties')
            await page.screenshot(path=str(ROOT/'docs/mobile.png'))
            assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector(".workbench").getBoundingClientRect().left>=0 && document.querySelector(".viewport").getBoundingClientRect().right<=innerWidth+1')
            passed('Light/dark theme and narrow viewport layout')
            await page.keyboard.press('Control+k');await page.get_by_label('Filter commands').fill('guide');await page.get_by_label('Filter commands').press('Enter');await page.locator('dialog[open]').wait_for(state='visible')
            passed('Command palette keyboard execution and guide dialog')
            assert not errors,errors;assert not console_errors,console_errors
            passed('No uncaught exceptions or console errors during regression run')
        except Exception as e:
            await page.screenshot(path=str(ROOT/'docs/browser-failure.png'))
            print('FAIL',str(e),errors,console_errors,flush=True);results.append({'name':'Regression failure','status':'failed','error':str(e)});raise
        finally:
            report={'tests':results,'durationSeconds':round(time.monotonic()-start,2),'pageErrors':errors,'consoleErrors':console_errors,'gpuValidation':'Not exercised: GPU APIs unavailable in managed test browser. Run tests/gpu.html on a WebGPU-capable secure origin.'}
            (ROOT/'docs/browser-tests.json').write_text(json.dumps(report,indent=2));await browser.close()
if __name__=='__main__':asyncio.run(main())
