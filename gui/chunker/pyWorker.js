import {loadPyodide} from "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs";

function postFromPy(value) {
    self.postMessage(JSON.parse(value));
}

async function importLocalFile(pyodide, name) {
    const response = await fetch(`py_module/${name}.py`);
    const code = await response.text();
    pyodide.FS.writeFile(`${name}.py`, code);
}

async function initPyodide() {
    const pyodide = await loadPyodide();

    await pyodide.loadPackage(["micropip"]);
    await pyodide.runPythonAsync(`
import micropip
await micropip.install("pandas")
await micropip.install("openpyxl")
await micropip.install("tqdm")
`);

    await importLocalFile(pyodide, "decode_wsm")
    await importLocalFile(pyodide, "encode_wsm")

    pyodide.globals.set("post_message", postFromPy);

    console.log(`Pyodide version: ${pyodide.version}`);
    return pyodide
}

const pyodide = await initPyodide();

const randStr = () => {
    const rnd = () => Math.random().toString(36).substring(2, 15)
    return rnd() + rnd()
}

async function encodeAction(params, content) {
    const encodeChunksCode = `
from encode_wsm import encode_chunks_from_io
import json

final_chunk = None
for chunk in encode_chunks_from_io(file_name="${params.name}", chunk_size_mb=${params.chunk_size_mb}, ext="${params.ext}"):
    if "path" in chunk:
        final_chunk = chunk
    else:
        msg = json.dumps({"type": "progress", "chunk": chunk, "progress_id": "${params.progress_id}"})
        post_message(msg)
        
json.dumps(final_chunk)
    `;

    pyodide.FS.writeFile(params.name, new Uint8Array(content));
    const pyResult = await pyodide.runPythonAsync(encodeChunksCode)
    const jsResult = JSON.parse(pyResult)
    const bytes = pyodide.FS.readFile(jsResult.path);

    self.postMessage({
        type: "result-encode",
        buffer: bytes.buffer,
        path: jsResult.path
    }, [bytes.buffer]);
}


async function decodeAction(params, content) {
    const folder = `/input_chunks_${randStr()}`
    pyodide.FS.mkdir(folder);

    for (let idx = 0; idx < params.names.length; idx++) {
        const name = params.names[idx];
        const buffer = content[idx];

        const fPath = `${folder}/${name}`
        pyodide.FS.writeFile(fPath, new Uint8Array(buffer));
    }

    const decodeChunksCode = `
from decode_wsm import decode_chunks_from_io
import json

final_chunk = None
for chunk in decode_chunks_from_io(src="${folder}", ext="${params.ext}"):
    if "path" in chunk:
        final_chunk = chunk
    else:
        msg = json.dumps({"type": "progress", "chunk": chunk, "progress_id": "${params.progress_id}"})
        post_message(msg)

json.dumps(final_chunk)
    `

    const pyResult = await pyodide.runPythonAsync(decodeChunksCode)
    const jsResult = JSON.parse(pyResult)
    const bytes = pyodide.FS.readFile(jsResult.path);

    self.postMessage({
        type: "result-decode",
        buffer: bytes.buffer,
        path: jsResult.path
    }, [bytes.buffer]);
}

async function onWorkerMessage(event) {
    const dt = event.data
    const {type, content, params} = dt;

    if (type === "file-encode") {
        await encodeAction(params, content)
    } else if (type === "files-decode") {
        await decodeAction(params, content)
    }
}

self.onmessage = async (event) => {
    try {
        await onWorkerMessage(event)
    } catch (error) {
        console.error(error)
        self.postMessage({type: "error", message: error?.message});
    }
};

self.postMessage({type: "ready"});