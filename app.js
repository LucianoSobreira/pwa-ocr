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
const btnCheckDevice = document.getElementById('btn-check-device');
const deviceStatus = document.getElementById('device-status');

let currentStream = null;
let deviceCompatible = false;

/* =========================================================
   DEVICE COMPATIBILITY CHECK
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    await verificarCompatibilidadeDispositivo();
});

function atualizarStatusDispositivo(result) {
    if (!deviceStatus) return;

    deviceStatus.classList.remove('ok', 'error');

    if (result.compatible) {
        deviceStatus.classList.add('ok');
        deviceStatus.textContent = 'Status do dispositivo: compatível';
    } else {
        deviceStatus.classList.add('error');
        deviceStatus.textContent = 'Status do dispositivo: não compatível';
    }
}

async function verificarCompatibilidadeDispositivo(showSuccess = false) {
    const result = await checkDeviceCompatibility();

    deviceCompatible = result.compatible;
    btn.disabled = !result.compatible;
    atualizarStatusDispositivo(result);

    if (!result.compatible) {
        Swal.fire({
            icon: 'error',
            title: 'Dispositivo não compatível',
            html: result.message,
            confirmButtonText: 'Entendi'
        });
    } else if (showSuccess) {
        Swal.fire({
            icon: 'success',
            title: 'Dispositivo compatível',
            text: 'O dispositivo está configurado corretamente para executar a aplicação.'
        });
    }

    return result;
}

async function checkDeviceCompatibility() {

    let issues = [];

    // HTTPS obrigatório
    if (!window.isSecureContext) {
        issues.push("Aplicação precisa estar em HTTPS.");
    }

    if (!navigator.mediaDevices) {
        issues.push("MediaDevices não suportado.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        issues.push("getUserMedia não suportado neste navegador.");
    }

    // Verificar se há câmera
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(d => d.kind === "videoinput");

        if (!hasCamera) {
            issues.push("Nenhuma câmera encontrada.");
        }
    } catch {
        issues.push("Não foi possível verificar dispositivos de mídia.");
    }

    // Verificar permissão (quando suportado)
    if (navigator.permissions) {
        try {
            const permission = await navigator.permissions.query({ name: 'camera' });
            if (permission.state === 'denied') {
                issues.push("Permissão da câmera está bloqueada.");
            }
        } catch {
            console.log("Permissions API não suportada totalmente.");
        }
    }

    return {
        compatible: issues.length === 0,
        message: issues.length === 0
            ? "Dispositivo compatível."
            : "<ul style='text-align:left'>" +
              issues.map(i => `<li>${i}</li>`).join("") +
              "</ul>"
    };
}

/* =========================================================
   CAMERA START (ONLY ON USER ACTION)
========================================================= */

async function startCamera() {

    if (!deviceCompatible) return;

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" }
            },
            audio: false
        });

        video.srcObject = currentStream;
        await video.play();

    } catch (err) {

        Swal.fire({
            icon: 'error',
            title: 'Erro ao acessar câmera',
            html: `
                ${err.message}<br><br>
                <b>Sugestões:</b><br>
                - Verifique se a câmera não está em uso<br>
                - Atualize o Chrome<br>
                - Atualize o Android System WebView<br>
                - Reinicie o navegador
            `
        });

        console.error("Camera error:", err);
        throw err;
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

/* =========================================================
   CAPTURE BUTTON
========================================================= */

btn.onclick = async () => {

    if (!currentStream) {
        await startCamera();
        if (!currentStream) return;
    }

    btn.disabled = true;
    btn.classList.add('processing');
    btnScanText.textContent = 'Processando...';

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const imgData = canvas.toDataURL('image/jpeg');

    try {
        const t0 = performance.now();
        const result = await Tesseract.recognize(imgData, 'por');
        const t1 = performance.now();
        const durationMs = Math.round(t1 - t0);

        const text = result?.data?.text || '';
        const matched = text.match(/\b\d{5}-?\d{3}\b/);

        if (matched) {
            const cep = matched[0].includes('-')
                ? matched[0]
                : matched[0].replace(/^(\d{5})(\d{3})$/, '$1-$2');

            enviarDados(cep, durationMs);
        } else {
            abrirModalCep();
        }

    } catch (e) {

        Swal.fire({
            icon: 'error',
            title: 'Erro no Processamento',
            text: e.message || 'Erro desconhecido'
        });

        console.error("OCR error:", e);

    } finally {
        btn.disabled = false;
        btn.classList.remove('processing');
        btnScanText.textContent = 'Capturar Imagem';
    }
};

/* =========================================================
   DATA HANDLING
========================================================= */

function enviarDados(cepValue, durationMs = null) {
    adicionarCepTabela(cepValue, durationMs);
}

function adicionarCepTabela(cep, durationMs = null) {

    const emptyRow = tableBody.querySelector('.empty-table');
    if (emptyRow) emptyRow.remove();

    tableSection.style.display = 'block';

    const agora = new Date();
    const dataHora = agora.toLocaleString('pt-BR');

    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${cep}</td>
        <td>${dataHora}</td>
        <td>${typeof durationMs === 'number' ? durationMs : '-'}</td>
    `;

    tableBody.insertBefore(row, tableBody.firstChild);
}

function limparTabela() {
    tableBody.innerHTML =
        '<tr class="empty-table"><td colspan="3">Document list is empty</td></tr>';
    tableSection.style.display = 'none';
}

btnClear.onclick = async () => {

    const result = await Swal.fire({
        icon: 'warning',
        title: 'Confirmar Limpeza',
        text: 'Deseja realmente limpar todas as leituras?',
        showCancelButton: true,
        confirmButtonText: 'Sim',
        cancelButtonText: 'Não'
    });

    if (result.isConfirmed) limparTabela();
};

/* =========================================================
   MODAL MANUAL CEP
========================================================= */

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

    if (!/^\d{5}-?\d{3}$/.test(cep)) {
        Swal.fire({
            icon: 'error',
            title: 'CEP Inválido',
            text: 'Use o formato 12345-678 ou 12345678'
        });
        return;
    }

    const cepFormatado = cep.includes('-')
        ? cep
        : cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');

    fecharModalCep();
    enviarDados(cepFormatado);
}

manualCepInput.onkeypress = e => {
    if (e.key === 'Enter') confirmarCepManual();
};

manualCepInput.oninput = () => {
    manualCepInput.value =
        manualCepInput.value.replace(/[^\d-]/g, '');
};

btnConfirmCep.onclick = confirmarCepManual;
btnCancelCep.onclick = fecharModalCep;
btnCheckDevice.onclick = async () => {
    await verificarCompatibilidadeDispositivo(true);
};

/* =========================================================
   CLEANUP ON PAGE EXIT (ANDROID SAFETY)
========================================================= */

window.addEventListener('beforeunload', stopCamera);
window.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
});
