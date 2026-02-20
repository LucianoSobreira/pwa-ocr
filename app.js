const video = document.getElementById('video');
const btn = document.getElementById('btn-scan');
const status = document.getElementById('status');
const canvas = document.getElementById('canvas');

// Iniciar câmera traseira
navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => { video.srcObject = stream; })
    .catch(err => {
        status.innerText = "Erro ao acessar câmera: " + (err && (err.message || err.toString()));
        console.error("getUserMedia error:", err);
    });

btn.onclick = async () => {
    status.style.color = "blue";
    status.innerText = "Lendo imagem (aguarde)...";

    // Congelar frame no canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imgData = canvas.toDataURL('image/jpeg');

    try {
        // Executar OCR com logger para progresso
        status.style.color = "blue";
        status.innerText = "Iniciando OCR...";
        const { data: { text } } = await Tesseract.recognize(imgData, 'por', {
            logger: m => {
                // Mostrar progresso no status e log no console
                try {
                    if (m && m.status) {
                        const pct = (typeof m.progress === 'number') ? ' ' + Math.round(m.progress * 100) + '%' : '';
                        status.innerText = m.status + pct;
                        status.style.color = "blue";
                    }
                } catch (uiErr) {
                    console.warn('UI update falhou:', uiErr);
                }
                console.log('Tesseract:', m);
            }
        });
        
        // Regex para CEP (00000-000 ou 00000000)
        const matched = text.match(/\b\d{5}-?\d{3}\b/);

        if (matched) {
            const cep = matched[0];
            status.style.color = "green";
            status.innerText = "Encontrado: " + cep;
            enviarDados(cep);
        } else {
            status.style.color = "red";
            status.innerText = "CEP não localizado.";
        }
    } catch (e) {
        const msg = e && (e.message || e.toString()) || 'Erro desconhecido';
        status.style.color = "red";
        status.innerText = "Erro no processamento: " + msg;
        console.error("Processamento falhou:", e);
    }
};

async function enviarDados(cepValue) {
    const url_backend = "https://seu-backend-aqui.com"; 
    try {
        await fetch(url_backend, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cep: cepValue, timestamp: new Date() })
        });
        alert("CEP enviado com sucesso!");
    } catch (error) {
        console.error("Erro no envio:", error);
        status.style.color = "red";
        status.innerText = "Erro ao enviar CEP: " + (error && (error.message || error.toString()));
    }
}
