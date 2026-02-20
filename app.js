const video = document.getElementById('video');
const btn = document.getElementById('btn-scan');
const status = document.getElementById('status');
const canvas = document.getElementById('canvas');
const btnClear = document.getElementById('btn-clear');
const tableBody = document.getElementById('cep-table-body');
const modal = document.getElementById('manual-cep-modal');
const manualCepInput = document.getElementById('manual-cep-input');
const btnConfirmCep = document.getElementById('btn-confirm-cep');
const btnCancelCep = document.getElementById('btn-cancel-cep');

// Iniciar câmera traseira
navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => { video.srcObject = stream; })
    .catch(err => {
        status.innerText = "Erro ao acessar câmera: " + (err && (err.message || err.toString()));
        console.error("getUserMedia error:", err);
    });

btn.onclick = async () => {
    // Desabilitar botão e mudar para estado processando
    btn.disabled = true;
    btn.classList.add('processing');
    btn.innerText = 'Processando...';
    status.style.color = "blue";
    status.innerText = "Lendo imagem (aguarde)...";

    // Congelar frame no canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imgData = canvas.toDataURL('image/jpeg');

    try {
        // Executar OCR
        const { data: { text } } = await Tesseract.recognize(imgData, 'por');
        
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
            abrirModalCep();   
        }
    } catch (e) {
        const msg = e && (e.message || e.toString()) || 'Erro desconhecido';
        status.style.color = "red";
        status.innerText = "Erro no processamento: " + msg;
        console.error("Processamento falhou:", e);
        alert("Erro ao processar a imagem: " + msg);
    } finally {
        // Restaurar botão ao estado original
        btn.disabled = false;
        btn.classList.remove('processing');
        btn.innerText = 'LER DOCUMENTO';
    }
};

function enviarDados(cepValue) {
    console.log('CEP: ', cepValue);
    alert('CEP => ' + cepValue);
    adicionarCepTabela(cepValue);
    // const url_backend = "https://seu-backend-aqui.com"; 
    // try {
    //     await fetch(url_backend, {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json' },
    //         body: JSON.stringify({ cep: cepValue, timestamp: new Date() })
    //     });
    //     alert("CEP enviado com sucesso!");
    // } catch (error) {
    //     console.error("Erro no envio:", error);
    //     status.style.color = "red";
    //     status.innerText = "Erro ao enviar CEP: " + (error && (error.message || error.toString()));
    // }
}

function adicionarCepTabela(cep) {
    // Remover linha vazia se existir
    const emptyRow = tableBody.querySelector('.empty-table');
    if (emptyRow) {
        emptyRow.remove();
    }
    
    // Criar data e hora formatadas
    const agora = new Date();
    const data = agora.toLocaleDateString('pt-BR');
    const hora = agora.toLocaleTimeString('pt-BR');
    
    // Criar nova linha
    const row = document.createElement('tr');
    row.innerHTML = `<td>${cep}</td><td>${data} ${hora}</td>`;
    tableBody.insertBefore(row, tableBody.firstChild);
}

function limparTabela() {
    tableBody.innerHTML = '<tr class="empty-table"><td colspan="2">Nenhum CEP lido ainda</td></tr>';
}

btnClear.onclick = () => {
    if (confirm('Deseja realmente limpar todos os registros de CEP?')) {
        limparTabela();
    }
};

function abrirModalCep() {
    manualCepInput.value = '';
    modal.classList.add('show');
    manualCepInput.focus();
}

function fecharModalCep() {
    modal.classList.remove('show');
    manualCepInput.value = '';
}

function confirmarCepManual() {
    const cep = manualCepInput.value.trim();
    
    // Validar formato do CEP (00000-000 ou 00000000)
    if (!cep || !cep.match(/^\d{5}-?\d{3}$/) && !cep.match(/^\d{8}$/)) {
        alert('CEP inválido. Use o formato 12345-678 ou 12345678');
        manualCepInput.focus();
        return;
    }
    
    // Formatar CEP
    const cepFormatado = cep.match(/-/) ? cep : cep.replace(/(\d{5})(\d{3})/, '$1-$2');
    
    fecharModalCep();
    enviarDados(cepFormatado);
}

manualCepInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
        confirmarCepManual();
    }
};

manualCepInput.oninput = () => {
    // Permitir apenas números e hífen
    manualCepInput.value = manualCepInput.value.replace(/[^\d-]/g, '');
};

btnConfirmCep.onclick = confirmarCepManual;
btnCancelCep.onclick = fecharModalCep;
