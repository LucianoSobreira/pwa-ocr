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

function showAlert(options) {
    if (window.Swal && typeof window.Swal.fire === 'function') {
        return window.Swal.fire(options);
    }

    const safeOptions = options || {};
    const title = safeOptions.title || 'Aviso';
    const text = safeOptions.text || (safeOptions.html ? safeOptions.html.replace(/<[^>]*>/g, ' ') : '');
    const message = title + '\n\n' + text;

    if (safeOptions.showCancelButton) {
        return Promise.resolve({ isConfirmed: window.confirm(message) });
    }

    window.alert(message);
    return Promise.resolve({ isConfirmed: true });
}

function renderChecksHtml(checks) {
    if (!checks || !checks.length) {
        return "<p>Nenhuma checagem foi executada.</p>";
    }

    return "<ul style='text-align:left; padding-left:18px; margin:0;'>" +
        checks.map(function (check) {
            const statusText = check.ok ? "OK" : "ERRO";
            const statusColor = check.ok ? "#218838" : "#dc3545";
            return "<li style='margin-bottom:8px;'>" +
                "<b>" + check.label + "</b><br>" +
                "<span style='color:" + statusColor + "; font-weight:700;'>" + statusText + "</span>" +
                " - " + check.detail +
                "</li>";
        }).join("") +
        "</ul>";
}

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
        const issuesHtml = result.issues && result.issues.length
            ? "<ul style='text-align:left; padding-left:18px;'>" +
              result.issues.map(function (issue) { return "<li>" + issue + "</li>"; }).join("") +
              "</ul>"
            : "<p>Nenhum bloqueio informado.</p>";

        showAlert({
            icon: 'error',
            title: 'Dispositivo não compatível',
            html:
                "<p style='text-align:left;'>Resultado das checagens:</p>" +
                renderChecksHtml(result.checks) +
                "<p style='text-align:left; margin-top:12px;'><b>Bloqueios encontrados:</b></p>" +
                issuesHtml,
            confirmButtonText: 'Entendi'
        });
    } else if (showSuccess) {
        showAlert({
            icon: 'success',
            title: 'Dispositivo compatível',
            html:
                "<p style='text-align:left;'>Resultado das checagens:</p>" +
                renderChecksHtml(result.checks) +
                "<p style='text-align:left; margin-top:12px;'><b>Bloqueios encontrados:</b></p>" +
                "<p style='text-align:left; margin:0;'>Nenhum bloqueio encontrado.</p>",
            confirmButtonText: 'Entendi'
        });
    }

    return result;
}

async function checkDeviceCompatibility() {

    let issues = [];
    const checks = [];

    function addCheck(label, ok, detail) {
        checks.push({ label: label, ok: ok, detail: detail });
    }

    // HTTPS obrigatório
    const secureContext = !!window.isSecureContext;
    addCheck(
        "Contexto seguro (HTTPS)",
        secureContext,
        secureContext ? "Aplicação em contexto seguro." : "Aplicação precisa estar em HTTPS."
    );
    if (!secureContext) issues.push("Aplicação precisa estar em HTTPS.");

    const hasMediaDevices = !!navigator.mediaDevices;
    addCheck(
        "API MediaDevices",
        hasMediaDevices,
        hasMediaDevices ? "MediaDevices disponível." : "MediaDevices não suportado."
    );
    if (!hasMediaDevices) issues.push("MediaDevices não suportado.");

    const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    addCheck(
        "getUserMedia",
        hasGetUserMedia,
        hasGetUserMedia ? "getUserMedia disponível." : "getUserMedia não suportado neste navegador."
    );
    if (!hasGetUserMedia) issues.push("getUserMedia não suportado neste navegador.");

    const hasEnumerateDevices = !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices);
    addCheck(
        "enumerateDevices",
        hasEnumerateDevices,
        hasEnumerateDevices ? "enumerateDevices disponível." : "enumerateDevices não suportado neste navegador."
    );
    if (!hasEnumerateDevices) issues.push("enumerateDevices não suportado neste navegador.");

    // Verificar se há câmera
    if (hasEnumerateDevices) {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(function (d) { return d.kind === "videoinput"; });
            addCheck(
                "Acesso aos dispositivos",
                true,
                "Lista de dispositivos obtida com sucesso."
            );

            if (!hasCamera) {
                issues.push("Nenhuma câmera encontrada.");
                addCheck("Câmera disponível", false, "Nenhuma câmera encontrada.");
            } else {
                addCheck("Câmera disponível", true, "Foi encontrada ao menos uma câmera.");
            }
        } catch (error) {
            issues.push("Não foi possível verificar dispositivos de mídia.");
            addCheck(
                "Acesso aos dispositivos",
                false,
                "Não foi possível listar dispositivos de mídia."
            );
        }
    }

    // Verificar permissão (quando suportado)
    if (navigator.permissions) {
        try {
            const permission = await navigator.permissions.query({ name: 'camera' });
            if (permission.state === 'denied') {
                issues.push("Permissão da câmera está bloqueada.");
                addCheck("Permissão da câmera", false, "Permissão da câmera está bloqueada.");
            } else {
                addCheck(
                    "Permissão da câmera",
                    true,
                    permission.state === 'granted'
                        ? "Permissão concedida."
                        : "Permissão ainda não concedida, será solicitada no uso."
                );
            }
        } catch (error) {
            addCheck(
                "Permissão da câmera",
                true,
                "Permissions API não suportada totalmente (não bloqueia uso)."
            );
        }
    } else {
        addCheck(
            "Permissão da câmera",
            true,
            "Permissions API indisponível (não bloqueia uso)."
        );
    }

    return {
        compatible: issues.length === 0,
        checks: checks,
        issues: issues,
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

        showAlert({
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

        const text = (result && result.data && result.data.text) ? result.data.text : '';
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

        showAlert({
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

    const result = await showAlert({
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
        showAlert({
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
