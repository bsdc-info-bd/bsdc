/* This script MUST run in the sandboxed /playground/runner Function document.
 * The embedding frame also uses sandbox=allow-scripts (never same-origin).
 * User JavaScript runs only in a terminable worker with an opaque origin.
 */
const output = document.getElementById('output');
let worker;
let timer;
function stop() {
  clearTimeout(timer);
  worker?.terminate();
  worker = undefined;
}
function print(text) {
  const remaining = 64000 - output.textContent.length;
  if (remaining > 0) output.textContent += String(text).slice(0, remaining) + '\n';
}
const workerSource = `
  const describe = (v) => { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return '[unserializable]'; } };
  let size = 0;
  for (const method of ['log', 'info', 'warn', 'error']) {
    console[method] = (...args) => {
      if (size >= 64000) return;
      const text = args.map(describe).join(' ').slice(0, 64000 - size);
      size += text.length + 1;
      postMessage({ type: 'line', text });
    };
  }
  onmessage = async ({ data }) => {
    try { await new Function('"use strict";\\n' + data)(); }
    catch (error) { console.error('Error: ' + error.message); }
    postMessage({ type: 'done' });
  };
`;
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.type !== 'bsdc-run') return;
  const { code, language } = event.data;
  if (typeof code !== 'string' || code.length > 40000) return;
  stop();
  output.textContent = '';
  document.querySelector('iframe')?.remove();
  if (language === 'sql') {
    output.textContent = code; // A preview, not a database execution service.
    return;
  }
  if (language === 'typescript') {
    print('TypeScript execution is not supported. Choose JavaScript to run compiled code.');
    return;
  }
  if (language === 'html' || language === 'css') {
    // Markup previews are deliberately inert. No scripts, forms or navigation.
    const parsed = new DOMParser().parseFromString(
      language === 'css' ? '<div>CSS preview</div>' : code,
      'text/html',
    );
    parsed
      .querySelectorAll('script,iframe,object,embed,link,meta,base,form,svg,math')
      .forEach((node) => node.remove());
    for (const node of parsed.querySelectorAll('*')) {
      for (const attribute of [...node.attributes]) {
        if (!['class', 'id', 'style', 'title', 'alt', 'role'].includes(attribute.name))
          node.removeAttribute(attribute.name);
      }
    }
    const frame = document.createElement('iframe');
    frame.title = 'Inert markup preview';
    frame.setAttribute('sandbox', '');
    frame.style.cssText = 'width:100%;height:320px;border:0';
    if (language === 'css') {
      const style = parsed.createElement('style');
      style.textContent = code.replace(/</g, '\\3c ');
      parsed.head.append(style);
    }
    frame.srcdoc = '<!doctype html>' + parsed.documentElement.outerHTML;
    document.body.append(frame);
    return;
  }
  if (language !== 'javascript') return;
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  worker = new Worker(url);
  URL.revokeObjectURL(url);
  worker.onmessage = ({ data }) => {
    if (data?.type === 'line' && typeof data.text === 'string') print(data.text);
    if (data?.type === 'done') stop();
  };
  worker.onerror = () => {
    print('Execution failed.');
    stop();
  };
  timer = setTimeout(() => {
    print('Execution stopped: 2 second limit.');
    stop();
  }, 2000);
  worker.postMessage(code);
});
