const worker = new Worker("pyWorker.js", {type: "module"});

const encodeForm = document.getElementById("encode-form")
const encodeBtn = document.getElementById("encode-btn")

const decodeForm = document.getElementById("decode-form")
const decodeBtn = document.getElementById("decode-btn")

let ready = false

const DisableCompsEncode = ["encode-btn", "encode-file"]
const EncodeProgressID = "encode-progress"

const DisableCompsDecode = ["decode-btn", "decode-files"]
const DecodeProgressID = "decode-progress"


function startAirportAction(disabledComps, progressID) {
    const progress = document.getElementById(progressID);
    const progressBr = progress.querySelector(".progress-br");
    progressBr.style.width = "15%";
    if (!progressBr.classList.contains("progress-bounce")) {
        progressBr.classList.add("progress-bounce");
    }

    for (let id of disabledComps) {
        document.getElementById(id).disabled = true;
    }
    progress.style.display = "block";
    for (let id of disabledComps) {
        document.getElementById(id).disabled = true;
    }
    progress.style.display = "block";
}


function handleProgressMsg(jsVal, progressID) {
    if (jsVal.idx) {
        const progress = document.getElementById(progressID);
        const progressBr = progress.querySelector(".progress-br");

        progressBr.classList.remove("progress-bounce");
        progressBr.style.width = `${(jsVal.idx / jsVal.n) * 100}%`;
        return false
    }
    if (jsVal.error) {
        alert(jsVal.error);
        return true
    }

    console.log({jsVal});
    alert(`Unexpected response: ${jsVal}`);
    return true
}

function downloadFile(buffer, filename) {
    const blob = new Blob([buffer], {type: "application/octet-stream"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function getFName(path) {
    return path.replaceAll("\\", "/").split("/").at(-1)
}

worker.onmessage = async (event) => {
    const dt = event.data
    const {type} = dt;

    if (type === "ready") {
        ready = true
        encodeBtn.disabled = false
        decodeBtn.disabled = false
        return
    }

    if (type === "progress") {
        handleProgressMsg(dt.chunk, dt.progress_id);
        return
    }

    if (type === "result-encode") {
        const fName = getFName(dt.path)
        downloadFile(dt.buffer, fName)

        for (let id of DisableCompsEncode) {
            document.getElementById(id).disabled = false;
        }

        const progress = document.getElementById(EncodeProgressID);
        progress.style.display = "none";
        return
    }

    if (type === "result-decode") {
        const fName = getFName(dt.path)
        downloadFile(dt.buffer, fName)

        for (let id of DisableCompsDecode) {
            document.getElementById(id).disabled = false;
        }

        const progress = document.getElementById(DecodeProgressID);
        progress.style.display = "none";
        return
    }

    if (type === "error") {
        alert(dt.message)
    }
}


encodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    startAirportAction(DisableCompsEncode, EncodeProgressID)

    const form = e.target;

    const file = form.file.files[0]
    const buffer = await file.arrayBuffer();

    const fName = getFName(file.name)
    console.log({fName})

    const chunkSizeMb = form.chunk_size.value;
    const ext = form.chunk_format.value;

    worker.postMessage({
        type: "file-encode",
        content: buffer,
        params: {
            chunk_size_mb: chunkSizeMb,
            ext: ext,
            progress_id: EncodeProgressID,
            name: fName,
        }
    }, [buffer]);
});


function validateFileNames(fileNames, ext) {
    if (fileNames.length === 0) return false;

    let lastName = fileNames[0].split("_")[0];

    for (const name of fileNames) {
        if (!name.endsWith(`.${ext}`)) {
            return false;
        }

        const orgName = name.split("_")[0];
        if (orgName !== lastName) {
            return false;
        }

        lastName = orgName;
    }

    const sortedFiles = fileNames.map(name => {
        const numberPart = name.split("_")[1].split(".")[0];
        return parseInt(numberPart, 10);
    }).sort((a, b) => a - b);

    for (let i = 0; i < sortedFiles.length; i++) {
        if (sortedFiles[i] !== i) {
            return false;
        }
    }

    return true;
}

decodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    startAirportAction(DisableCompsDecode, DecodeProgressID)

    const form = e.target;
    const ext = form.chunk_format.value;

    const fileNames = Array.from(form.files.files).map(file => file.name);
    console.log({fileNames})

    if (!validateFileNames(fileNames, ext)) {
        alert("Invalid file names");
        return;
    }

    const fileBuffers = [];
    for (let file of form.files.files) {
        fileBuffers.push(await file.arrayBuffer());
    }

    worker.postMessage({
        type: "files-decode",
        content: fileBuffers,
        params: {
            names: fileNames,
            ext: ext,
            progress_id: DecodeProgressID
        }
    }, fileBuffers);
})
