const encodeForm = document.getElementById("encode-form")
const decodeForm = document.getElementById("decode-form")

function downloadFileFromServer(url) {
    const link = document.createElement('a');
    const name = url.split('/').pop();
    link.href = `/${url}`;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function sendAirportReq(url, formData, btnId, progressID) {
    const button = document.getElementById(btnId);
    const progress = document.getElementById(progressID);
    const progressBr = progress.querySelector(".progress-br");
    try {
        button.disabled = true;
        progress.style.display = "block";
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const {done, value} = await reader.read();
            if (done) break;

            // Convert the stream chunk to text
            const chunk = decoder.decode(value);
            const jsVal = JSON.parse(chunk);
            if (jsVal.idx) {
                console.log(jsVal.idx, jsVal.n);
                progressBr.classList.remove("progress-bounce");
                progressBr.style.width = `${(jsVal.idx / jsVal.n) * 100}%`;
            } else if (jsVal.path) {
                downloadFileFromServer(jsVal.path)
                return
            } else {
                alert(`Unexpected response: ${jsVal}`);
                return
            }
        }
    } catch (error) {
        alert(`Error: ${error}`);
    } finally {
        button.disabled = false;
        progress.style.display = "none";
    }
}

encodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    //file: UploadFile = File(...), chunk_size: str = Form(...), ext: str = Form(...)
    const form = e.target;
    formData.append('file', form.file.files[0]);
    formData.append('chunk_size_mb', form.chunk_size.value);
    formData.append('ext', form.chunk_format.value);
    await sendAirportReq("/encode_chunks", formData, "encode-btn", "encode-progress");
});

decodeForm.addEventListener('submit', async (e) => {
      e.preventDefault();

    const formData = new FormData();
    const form = e.target;

    formData.append('name', form.name.value);
    await sendAirportReq(formData);
});