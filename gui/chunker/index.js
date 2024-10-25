const encodeForm = document.getElementById("encode-form")
const decodeForm = document.getElementById("decode-form")

async function sendAirportReq(formData) {
    try {
        const response = await fetch('/upload', {
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
            document.getElementById('response').textContent += chunk;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

encodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    const form = e.target;

    formData.append('name', form.name.value);

    const files = form.files.files;
    for (let file of files) {
        formData.append('files', file);
    }

    await sendAirportReq(formData);
});

decodeForm.addEventListener('submit', async (e) => {
      e.preventDefault();

    const formData = new FormData();
    const form = e.target;

    formData.append('name', form.name.value);
    await sendAirportReq(formData);
});