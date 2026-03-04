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
const SCAN_LABEL_CAPTURE = 'Capturar Imagem';
const SCAN_LABEL_PROCESSING = 'Processando...';
const MAX_OCR_WIDTH_ROI = 720;
const MAX_OCR_WIDTH_FULL = 900;
const OCR_IMAGE_QUALITY = 0.86;
const GRAYSCALE_DARK_MULTIPLIER = 0.82;
const GRAYSCALE_LIGHT_MULTIPLIER = 1.18;

let ocrWorker = null;
let ocrWorkerPromise = null;

function updateScanButtonLabel() {
    if (!btnScanText) return;
    btnScanText.textContent = SCAN_LABEL_CAPTURE;
}

async function getOrCreateOcrWorker() {
    if (ocrWorker) return ocrWorker;
    if (ocrWorkerPromise) return ocrWorkerPromise;

    ocrWorkerPromise = (async () => {
        const worker = await Tesseract.createWorker();
        await worker.loadLanguage('por');
        await worker.initialize('por');
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789-., ',
            tessedit_pageseg_mode: '6'
        });
        ocrWorker = worker;
        return worker;
    })();

    try {
        return await ocrWorkerPromise;
    } catch (error) {
        ocrWorkerPromise = null;
        throw error;
    }
}

function warmUpOcrWorker() {
    getOrCreateOcrWorker().catch(function (error) {
        console.error('OCR warm-up error:', error);
    });
}

function terminateOcrWorker() {
    if (ocrWorker) {
        ocrWorker.terminate();
        ocrWorker = null;
    }
    ocrWorkerPromise = null;
}

function buildOptimizedOcrImage(frameCanvas, maxWidth = MAX_OCR_WIDTH_FULL, applyEnhancement = true) {
    const sourceWidth = frameCanvas.width;
    const sourceHeight = frameCanvas.height;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(1, maxWidth / sourceWidth);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const optimizedCanvas = document.createElement('canvas');
    optimizedCanvas.width = targetWidth;
    optimizedCanvas.height = targetHeight;

    const ctx = optimizedCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(frameCanvas, 0, 0, targetWidth, targetHeight);

    if (applyEnhancement) {
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const pixels = imageData.data;
        for (let i = 0; i < pixels.length; i += 4) {
            const gray = (pixels[i] * 0.299) + (pixels[i + 1] * 0.587) + (pixels[i + 2] * 0.114);
            const adjustedGray = gray < 140
                ? gray * GRAYSCALE_DARK_MULTIPLIER
                : Math.min(255, gray * GRAYSCALE_LIGHT_MULTIPLIER);
            pixels[i] = adjustedGray;
            pixels[i + 1] = adjustedGray;
            pixels[i + 2] = adjustedGray;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    return optimizedCanvas.toDataURL('image/jpeg', OCR_IMAGE_QUALITY);
}

function buildCanvasFromRegion(frameCanvas, region) {
    const x = Math.max(0, Math.min(region.x, frameCanvas.width - 1));
    const y = Math.max(0, Math.min(region.y, frameCanvas.height - 1));
    const width = Math.max(1, Math.min(region.width, frameCanvas.width - x));
    const height = Math.max(1, Math.min(region.height, frameCanvas.height - y));

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = width;
    croppedCanvas.height = height;

    const ctx = croppedCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(
        frameCanvas,
        x, y, width, height,
        0, 0, width, height
    );

    return croppedCanvas;
}

function getCepRoiCandidates(frameWidth, frameHeight) {
    const w = frameWidth;
    const h = frameHeight;

    // ROI única para manter ganho de performance: onde CEP costuma aparecer em etiquetas/endereço.
    if (h >= w) {
        return [{
            x: Math.round(w * 0.08),
            y: Math.round(h * 0.52),
            width: Math.round(w * 0.84),
            height: Math.round(h * 0.36)
        }];
    }

    return [{
        x: Math.round(w * 0.38),
        y: Math.round(h * 0.44),
        width: Math.round(w * 0.56),
        height: Math.round(h * 0.40)
    }];
}

async function recognizeCepWithRoiFallback(worker, frameCanvas) {
    const roiCandidates = getCepRoiCandidates(frameCanvas.width, frameCanvas.height);

    for (const roi of roiCandidates) {
        const roiCanvas = buildCanvasFromRegion(frameCanvas, roi);
        if (!roiCanvas) continue;

        const roiImgData = buildOptimizedOcrImage(roiCanvas, MAX_OCR_WIDTH_ROI, true);
        if (!roiImgData) continue;

        const roiResult = await worker.recognize(roiImgData);
        const roiText = (roiResult && roiResult.data && roiResult.data.text) ? roiResult.data.text : '';
        const roiCep = extractCepFromOcrText(roiText);
        if (roiCep) return roiCep;
    }

    const optimizedFullImgData = buildOptimizedOcrImage(frameCanvas, MAX_OCR_WIDTH_FULL, false);
    const fullImgData = optimizedFullImgData || frameCanvas.toDataURL('image/jpeg', OCR_IMAGE_QUALITY);
    const fullResult = await worker.recognize(fullImgData);
    const fullText = (fullResult && fullResult.data && fullResult.data.text) ? fullResult.data.text : '';
    return extractCepFromOcrText(fullText);
}

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
    const result = await verificarCompatibilidadeDispositivo();
    if (result.compatible) {
        await ensureCameraReady();
        warmUpOcrWorker();
    }
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
   CAMERA CONTROL
========================================================= */

async function startCamera() {

    if (!deviceCompatible || currentStream) return;

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" }
            },
            audio: false
        });

        video.srcObject = currentStream;
        await video.play();
        updateScanButtonLabel();

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

async function ensureCameraReady() {
    if (!deviceCompatible || currentStream) return;
    try {
        await startCamera();
    } catch (error) {
        // O alerta já é exibido em startCamera; não interrompe o restante da aplicação.
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    updateScanButtonLabel();
}

function formatCepFromDigits(digits) {
    if (!/^\d{8}$/.test(digits)) return null;
    return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

function normalizeOcrTextForCep(text) {
    return text
        .toUpperCase()
        .replace(/[OQ]/g, '0')
        .replace(/[IL]/g, '1')
        .replace(/S/g, '5')
        .replace(/B/g, '8')
        .replace(/Z/g, '2');
}

function extractCepWithPatterns(text) {
    const patterns = [
        /\b\d{5}-?\d{3}\b/g,
        /\b\d{5}\s*[-.,]?\s*\d{3}\b/g,
        /\b\d{2}[.\s]?\d{3}\s*[-.,]?\s*\d{3}\b/g,
        /\d{8}/g
    ];

    for (const pattern of patterns) {
        const matches = text.match(pattern) || [];
        for (const match of matches) {
            const digits = match.replace(/\D/g, '');
            const cep = formatCepFromDigits(digits);
            if (cep) return cep;
        }
    }

    return null;
}

function extractCepFromOcrText(text) {
    if (!text) return null;

    // Prioriza a regra antiga (old_app.js) no texto original.
    const cepFromRawText = extractCepWithPatterns(text);
    if (cepFromRawText) return cepFromRawText;

    // Fallback para OCR com caracteres ambíguos.
    const normalizedText = normalizeOcrTextForCep(text);
    return extractCepWithPatterns(normalizedText);
}

/* =========================================================
   CAPTURE BUTTON
========================================================= */

btn.onclick = async () => {

    if (!currentStream) {
        await ensureCameraReady();
        if (!currentStream) return;
    }

    btn.disabled = true;
    btn.classList.add('processing');
    btnScanText.textContent = SCAN_LABEL_PROCESSING;

    if (!video.videoWidth || !video.videoHeight) {
        showAlert({
            icon: 'warning',
            title: 'Câmera indisponível',
            text: 'A câmera ainda não está pronta. Tente novamente em alguns instantes.'
        });
        btn.disabled = false;
        btn.classList.remove('processing');
        updateScanButtonLabel();
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    try {
        const t0 = performance.now();
        const worker = await getOrCreateOcrWorker();
        const cep = await recognizeCepWithRoiFallback(worker, canvas);
        const t1 = performance.now();
        const durationMs = Math.round(t1 - t0);

        if (cep) {
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
        updateScanButtonLabel();
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
    const result = await verificarCompatibilidadeDispositivo(true);
    if (result.compatible) {
        await ensureCameraReady();
        warmUpOcrWorker();
    }
};

/* =========================================================
   CLEANUP ON PAGE EXIT (ANDROID SAFETY)
========================================================= */

window.addEventListener('beforeunload', () => {
    stopCamera();
    terminateOcrWorker();
});
window.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
});

updateScanButtonLabel();
