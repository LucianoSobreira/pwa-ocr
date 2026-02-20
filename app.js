const video = document.getElementById('video');
const btn = document.getElementById('btn-scan');
const btnScanText = document.getElementById('btn-scan-text');
const canvas = document.getElementById('canvas');
const btnClear = document.getElementById('btn-clear');
const tableSection = document.getElementById('table-section');
const tableBody = document.getElementById('cep-table-body');
const modal = document.getElementById('manual-cep-modal');
const manualCepInput = document.getElementById('manual-cep-input');
const btnConfirmCep = document.getElementById('btn-confirm-cep');
const btnCancelCep = document.getElementById('btn-cancel-cep');

// Iniciar câmera traseira
navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => { video.srcObject = stream; })
    .catch(err => {
        Swal.fire({
            icon: 'error',
            title: 'Erro na Câmera',
            text: err && (err.message || err.toString())
        });
        console.error("getUserMedia error:", err);
    });

btn.onclick = async () => {
    // Desabilitar botão e mudar para estado processando
    btn.disabled = true;
    btn.classList.add('processing');
    btnScanText.textContent = 'Processando...';

    // Congelar frame no canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imgData = canvas.toDataURL('image/jpeg');

    try {
        // Executar OCR e medir tempo
        const t0 = performance.now();
        const result = await Tesseract.recognize(imgData, 'por');
        const t1 = performance.now();
        const durationMs = Math.round(t1 - t0);
        const text = result && result.data && result.data.text ? result.data.text : '';

        // Regex para CEP (00000-000 ou 00000000)
        const matched = text.match(/\b\d{5}-?\d{3}\b/);

        if (matched) {
            const cep = matched[0];
            enviarDados(cep, durationMs);
        } else {
            // abrir modal para entrada manual (sem tempo)
            abrirModalCep();   
        }
    } catch (e) {
        const msg = e && (e.message || e.toString()) || 'Erro desconhecido';
        console.error("Processamento falhou:", e);
        Swal.fire({
            icon: 'error',
            title: 'Erro no Processamento',
            text: msg
        });
    } finally {
        btn.disabled = false;
        btn.classList.remove('processing');
        btnScanText.textContent = 'Capturar Imagem';
    }
};

function enviarDados(cepValue, durationMs = null) {
    //console.log(cepValue, durationMs);
    adicionarCepTabela(cepValue, durationMs);
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
    // }
}

function adicionarCepTabela(cep, durationMs = null) {
    // Remover linha vazia se existir
    const emptyRow = tableBody.querySelector('.empty-table');
    if (emptyRow) {
        emptyRow.remove();
    }
    
    // Mostrar seção da tabela
    tableSection.style.display = 'block';
    
    // Criar data e hora formatadas
    const agora = new Date();
    const data = agora.toLocaleDateString('pt-BR');
    const hora = agora.toLocaleTimeString('pt-BR');
    
    // Criar nova linha
    const row = document.createElement('tr');
    const tempoCell = (typeof durationMs === 'number') ? `${durationMs}` : '-';
    row.innerHTML = `<td>${cep}</td><td>${data} ${hora}</td><td>${tempoCell}</td>`;
    tableBody.insertBefore(row, tableBody.firstChild);
}

function limparTabela() {
    tableBody.innerHTML = '<tr class="empty-table"><td colspan="2">Document list is empty</td></tr>';
    tableSection.style.display = 'none';
}

btnClear.onclick = async () => {
    const result = await Swal.fire({
        icon: 'warning',
        title: 'Confirmar Limpeza',
        text: 'Deseja realmente limpar todas as leituras?',
        showDenyButton: true,
        confirmButtonText: '<i class="fa fa-check"></i> Sim',
        denyButtonText: '<i class="fa fa-times"></i> Não',
        confirmButtonColor: '#28a745',
        denyButtonColor: '#dc3545',
        confirmButtonHTML: '<i class="fa fa-check"></i> Sim',
        denyButtonHTML: '<i class="fa fa-times"></i> Não'
    });
    if (result.isConfirmed) {
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
        Swal.fire({
            icon: 'error',
            title: 'CEP Inválido',
            text: 'Use o formato 12345-678 ou 12345678'
        });
        manualCepInput.focus();
        return;
    }
    
    // Formatar CEP - adiciona hífen automaticamente se informado com 8 números
    const cepFormatado = cep.match(/-/) ? cep : cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    
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
