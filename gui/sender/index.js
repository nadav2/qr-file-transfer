let stop = false;
let delay = 300;
let resolution = 102;

const HOST = window.location.host;

const stopButton = document.getElementById("stop-btn");
const sendButton = document.getElementById("send-btn");
const fileInput = document.getElementById("file-input");
const qrCodeImg = document.getElementById("qr-code-img");
const qrCodeDiv = document.getElementById("qr-code");
const delayText = document.getElementById("delay-text");
const delayInput = document.getElementById("delay-input");
const resolutionInput = document.getElementById("resolution-input");
const resolutionText = document.getElementById("resolution-text");
const statusText = document.getElementById("status-text");

let ws;

delayInput.value = delay;
resolutionInput.value = resolution;

delayInput.oninput = () => {
    delayText.innerText = delayInput.value.toString();
    delay = delayInput.value;
}

resolutionInput.oninput = () => {
    resolutionText.innerText = resolutionInput.value.toString();
    resolution = resolutionInput.value;
}


function sendFileWrapper() {
    try {
        stopButton.disabled = false;
        sendButton.disabled = true;

        qrCodeDiv.style.display = "none";
        qrCodeImg.src = "../public/upload.gif";
        sendFile()
    } catch (e) {
        stopSending();
        alert(e);
    }

    return false

}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function interval(func, setStatus) {
    while (true) {
        await sleep(delay);
        if (stop) {
            break;
        }
        setStatus(delay);
        func();
    }
}

function addPartToBuffer(text, arrayBuffer) {
    // add file name to the beginning of the array buffer and add @@ as a delimiter
    const fileNameArrayBuffer = new TextEncoder().encode(text);
    const fileNameWithPad = new Uint8Array(fileNameArrayBuffer.length + 2);
    fileNameWithPad.set(fileNameArrayBuffer);
    fileNameWithPad.set([64, 64], fileNameArrayBuffer.length);
    const arrayBufferWithFileName = new Uint8Array(fileNameWithPad.length + arrayBuffer.byteLength);

    arrayBufferWithFileName.set(fileNameWithPad);
    arrayBufferWithFileName.set(new Uint8Array(arrayBuffer), fileNameWithPad.length);
    return arrayBufferWithFileName;
}

function sendFileAction() {
    stop = false;
    let file = {name: "no-name.txt", size: 0};

    const wsType = window.location.origin.startsWith("https") ? "wss" : "ws";
    ws = new WebSocket(`${wsType}://${HOST}/ws/send_file`);
    const taskQueue = [];

    const qr = new QRCode(qrCodeDiv, {
        correctLevel: QRCode.CorrectLevel.M,
        width: 512,
        height: 512,
    });

    const task = () => {
        if (taskQueue.length === 0) {
            return;
        }
        const message = taskQueue[0];
        qr.makeCode(message);
        taskQueue.shift();
    }

    const taskEmpty = async () => {
        while (taskQueue.length > 25) {
            await sleep(100);
        }
    }

    const tempResolution = resolution
    const setStatus = (delay) => statusText.innerText = `
${file.name} - ${file.size / 1024} KB
Ideal Transfer speed: ${(1000 / delay) * tempResolution} B/s`.trim();

    interval(task, setStatus).catch(console.error);

    ws.onmessage = async (event) => {
        const message = event.data;
        if (qrCodeDiv.style.display === "none") {
            qrCodeDiv.style.display = "block";
            qrCodeImg.style.display = "none";
        }

        if (message === "NEXT?") {
            if (stop) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send("STOP");
                }
                return;
            }
            await taskEmpty();
            ws.send("NEXT");
        } else {
            taskQueue.push(message);
        }
    };

    const readFile = (file) => {
        return new Promise((resolve, reject) => {
            const fileReader = new FileReader();
            fileReader.readAsArrayBuffer(file);
            const fileName = file.name;
            fileReader.onload = () => {
                let arrayBuffer = fileReader.result;
                arrayBuffer = addPartToBuffer(resolution.toString(), arrayBuffer);
                arrayBuffer = addPartToBuffer(fileName, arrayBuffer);
                resolve(arrayBuffer)
            }
            fileReader.onerror = () => {
                const error = fileReader.error
                reject(error)
            }
        })
    }

    ws.onopen = async () => {
        console.log("Connection established");

        if (fileInput.files.length === 1) {
            file = fileInput.files[0];
            const arrBuf = await readFile(file)
            ws.send(arrBuf)
        } else {
            const zip = new JSZip()
            const files = [...fileInput.files]
            await Promise.all(
                files.map(async file => {
                    const arrBuf = await readFile(file)
                    return zip.file(file.name, arrBuf)
                })
            )
            const blob = await zip.generateAsync({type: "blob"})
            let arrayBuffer = await blob.arrayBuffer()
            file = {
                name: `comb_${Math.floor(Date.now() / 1000)}.zip`,
                size: arrayBuffer.byteLength
            }
            arrayBuffer = addPartToBuffer(resolution.toString(), arrayBuffer);
            arrayBuffer = addPartToBuffer(file.name, arrayBuffer);
            ws.send(arrayBuffer)
        }
    }
}

function sendFile() {
    try {
        sendFileAction();
    } catch (e) {
        stopSending();
        alert(e);
    }
}


function stopSending() {
    stop = true;
    ws?.close()

    qrCodeDiv.style.display = "none";
    qrCodeDiv.innerText = "";
    qrCodeImg.style.display = "block";
    qrCodeImg.src = "../public/qr.png";

    stopButton.disabled = true;
    sendButton.disabled = false;

    statusText.innerText = "Choose File to start streaming...";
}
