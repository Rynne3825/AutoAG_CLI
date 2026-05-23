const wsUrl = process.argv[2];

if (!wsUrl) {
  console.error("Missing websocket URL");
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

function call(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data.toString());
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }

  if (msg.method === "Runtime.exceptionThrown") {
    console.log("EXCEPTION", JSON.stringify(msg.params.exceptionDetails));
  }

  if (msg.method === "Runtime.consoleAPICalled") {
    const args = (msg.params.args || []).map((arg) => arg.value ?? arg.description ?? null);
    console.log("CONSOLE", msg.params.type, JSON.stringify(args));
  }
};

ws.onerror = (err) => {
  console.error("WS_ERROR", err.message || err);
};

ws.onopen = async () => {
  await call("Runtime.enable");
  await call("Page.enable");

  const exprs = [
    "document.readyState",
    "document.title",
    "window.location.href",
    "document.body && document.body.innerText",
    "document.getElementById('root') && document.getElementById('root').childElementCount",
    "document.getElementById('root') && document.getElementById('root').innerHTML.slice(0,1200)",
    "performance.getEntriesByType('resource').map(r => ({name:r.name,type:r.initiatorType})).slice(-20)",
  ];

  for (const expression of exprs) {
    const res = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.result.exceptionDetails) {
      console.log("EVAL_ERROR", expression, JSON.stringify(res.result.exceptionDetails));
    } else {
      console.log("EVAL", expression, JSON.stringify(res.result.result.value));
    }
  }

  setTimeout(() => ws.close(), 1500);
};

ws.onclose = () => process.exit(0);
