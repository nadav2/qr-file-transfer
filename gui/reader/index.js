const HOST = window.location.host;
let ws

const videoElem = document.getElementById('qr-video');
const progressElem = document.getElementById('progress');
const qrDataText = document.getElementById('status');
const cancelBtn = document.getElementById('cancel');

function sendQrData(text) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(text);
        qrDataText.innerText = new Date().toISOString()
    }
}


function downloadFile(data, fileName) {
    alert(`File received ${fileName}`)
    const blob = new Blob([data], {type: "application/octet-stream"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function startWebSocket() {
    const wsType = window.location.origin.startsWith("https") ? "wss" : "ws";
    ws = new WebSocket(`${wsType}://${HOST}/ws/receive_file`);
    let fileName = "no-name.txt";

    ws.onopen = () => {
        console.log('WebSocket Client Connected');
        cancelBtn.disabled = false;
    };
    ws.onmessage = (message) => {
        if (typeof message.data === "string") {
            if (message.data.startsWith("FILE_NAME:")) {
                fileName = message.data.replace("FILE_NAME:", "");
                return;
            }

            const progressVal = parseFloat(message.data) * 100;
            if (isNaN(progressVal)) {
                alert(message.data);
                return;
            }
            progressElem.innerText = `${progressVal}%`;
            progressElem.value = progressVal;
        } else {
            const fileData = message.data;

            downloadFile(fileData, fileName);
            restartRecording();
        }
    };
    ws.onclose = () => {
        console.log('WebSocket Client Disconnected');
    };
}

function startQrReader() {
    const qrScanner = new window.QrScanner(
        videoElem,
        (result) => sendQrData(result.data),
        {
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 30
        }
    );
    qrScanner.start();
}

function restartRecording() {
    ws?.close();
    qrDataText.innerText = "Waiting for QR codes...";
    progressElem.innerText = "0%";
    progressElem.value = 0;
    cancelBtn.disabled = true;
    startWebSocket();
}

startQrReader()
startWebSocket()