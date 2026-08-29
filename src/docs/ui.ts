export function renderDocsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LinkedIn Profile API</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      padding: 2.5rem 1rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.4rem;
      color: #334155;
    }
    input[type="text"] {
      width: 100%;
      padding: 0.7rem 0.9rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.95rem;
      font-family: inherit;
      background: white;
    }
    input:focus {
      outline: none;
      border-color: #0a66c2;
    }
    button {
      background: #0a66c2;
      color: white;
      border: none;
      padding: 0.7rem 1.5rem;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover {
      background: #004182;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .output-section {
      margin-top: 2rem;
    }
    .output-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .status {
      font-size: 0.85rem;
      color: #64748b;
    }
    pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 1rem;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      overflow-x: auto;
      min-height: 220px;
      max-height: 600px;
      line-height: 1.45;
    }
  </style>
</head>
<body>

<div class="container">
  <h1>LinkedIn Profile API</h1>

  <form id="scrapeForm" onsubmit="sendRequest(event)">
    <div class="form-group">
      <label for="url">LinkedIn Profile URL</label>
      <input type="text" id="url" placeholder="https://www.linkedin.com/in/username/" required />
    </div>

    <button type="submit" id="sendBtn">Send</button>
  </form>

  <div class="output-section">
    <div class="output-header">
      <label>Response</label>
      <span id="status" class="status">Idle</span>
    </div>
    <pre id="output">// Response will appear here</pre>
  </div>
</div>

<script>
  async function sendRequest(e) {
    e.preventDefault();
    const url = document.getElementById('url').value.trim();
    const sendBtn = document.getElementById('sendBtn');
    const status = document.getElementById('status');
    const output = document.getElementById('output');

    sendBtn.disabled = true;
    sendBtn.innerText = 'Sending...';
    status.innerText = 'Scraping in progress...';
    output.innerText = '// Processing profile extraction...';

    const startTime = performance.now();

    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      const data = await res.json();

      status.innerText = res.status + ' ' + res.statusText + ' (' + duration + 's)';
      output.innerText = JSON.stringify(data, null, 2);
    } catch (err) {
      status.innerText = 'Error';
      output.innerText = JSON.stringify({ error: err.message }, null, 2);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerText = 'Send';
    }
  }
</script>

</body>
</html>`;
}
