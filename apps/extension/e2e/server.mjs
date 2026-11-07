import { createServer } from 'node:http';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Fillin browser test</title></head>
<body>
  <label>Text input <input id="text" type="text"></label>
  <label>Multiline input <textarea id="textarea"></textarea></label>
  <label>Password <input id="password" type="password"></label>
  <div id="editor" role="textbox" aria-label="Rich text editor" contenteditable="true"></div>
  <output id="observed"></output>
  <script>
    document.querySelector('#text').addEventListener('input', event => {
      document.querySelector('#observed').textContent = event.target.value;
    });
  </script>
</body></html>`;

const server = createServer((request, response) => {
  response.setHeader(
    'Content-Type',
    request.url === '/health' ? 'text/plain' : 'text/html'
  );
  response.end(request.url === '/health' ? 'ok' : html);
});
server.listen(Number(process.env.FILLIN_E2E_PORT || 4177), '127.0.0.1');
process.on('SIGTERM', () => server.close());
