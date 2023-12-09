let stop = false;
let delay = 300;

const HOST = "www.qr-transfer.eshqol.com"

const stopButton = document.getElementById("stop-btn");
const sendButton = document.getElementById("send-btn");
const fileInput = document.getElementById("file-input");
const qrCodeImg = document.getElementById("qr-code-img");
const qrCodeDiv = document.getElementById("qr-code");
const delayText = document.getElementById("delay-text");
const delayInput = document.getElementById("delay-input");

let ws;

delayInput.value = delay;

delayInput.oninput = () => {
    delayText.innerText = delayInput.value.toString();
    delay = delayInput.value;
}


function sendFileWrapper() {
    try {
        stopButton.disabled = false;
        sendButton.disabled = true;

        qrCodeDiv.style.display = "none";
        qrCodeImg.src = "public/upload.gif";
        sendFile()
    } catch (e) {
        stopSending();
        alert(e);
    }

    return false

}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function interval(func) {
    while (true) {
        await sleep(delay);
        if (stop) {
            break;
        }
        func();
    }
}

function addNameToBuffer(fileName, arrayBuffer) {
    // add file name to the beginning of the array buffer and add @@ as a delimiter
    const fileNameArrayBuffer = new TextEncoder().encode(fileName);
    const fileNameWithPad = new Uint8Array(fileNameArrayBuffer.length + 2);
    fileNameWithPad.set(fileNameArrayBuffer);
    fileNameWithPad.set([64, 64], fileNameArrayBuffer.length);
    const arrayBufferWithFileName = new Uint8Array(fileNameWithPad.length + arrayBuffer.byteLength);

    arrayBufferWithFileName.set(fileNameWithPad);
    arrayBufferWithFileName.set(new Uint8Array(arrayBuffer), fileNameWithPad.length);
    return arrayBufferWithFileName;
}

function sendFileAction() {
    const wsType = HOST.startsWith("localhost") ? "ws" : "wss";
    ws = new WebSocket(`${wsType}://${HOST}/ws`);
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
        while (taskQueue.length > 0) {
            await sleep(100);
        }
    }

    interval(task, delay).catch(console.error);

    ws.onmessage =  async (event) =>  {
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

    ws.onopen =  () => {
        console.log("Connection established");

        const file = fileInput.files[0];
        const fileReader = new FileReader();
        fileReader.readAsArrayBuffer(file);
        const fileName = file.name;
        fileReader.onload =  ()=>  {
            const arrayBuffer = fileReader.result;
            const arrayBufferWithFileName = addNameToBuffer(fileName, arrayBuffer);
            ws.send(arrayBufferWithFileName);
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
    qrCodeImg.style.display = "block";
    qrCodeImg.src = "public/qr.png";

    stopButton.disabled = true;
    sendButton.disabled = false;
}