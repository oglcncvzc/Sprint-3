window.addEventListener("load", (event) => {
    console.log("Hello Gemini Realtime Demo!");

    setAvailableCamerasOptions();
    setAvailableMicrophoneOptions();
});

const PROXY_URL = "ws://localhost:8080/ws";
const PROJECT_ID = "voice-asistant-459013";
const MODEL = "gemini-2.0-flash-live-preview-04-09";
const API_HOST = "us-central1-aiplatform.googleapis.com";

const accessTokenInput = document.getElementById("token");
const projectInput = document.getElementById("project");
const systemInstructionsInput = document.getElementById("systemInstructions");

CookieJar.init("token");
CookieJar.init("project");
CookieJar.init("systemInstructions");

const disconnected = document.getElementById("disconnected");
const connecting = document.getElementById("connecting");
const connected = document.getElementById("connected");
const speaking = document.getElementById("speaking");

const micBtn = document.getElementById("micBtn");
const micOffBtn = document.getElementById("micOffBtn");
const micSelect = document.getElementById("audioSource");

const geminiLiveApi = new GeminiLiveAPI(PROXY_URL, PROJECT_ID, MODEL, API_HOST);

geminiLiveApi.onErrorMessage = (message) => {
    showDialogWithMessage(message);
    setAppStatus("disconnected");
};

function getSelectedResponseModality() {
    // return "AUDIO";
    const radioButtons = document.querySelectorAll(
        'md-radio[name="responseModality"]',
    );

    let selectedValue;
    for (const radioButton of radioButtons) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
            break;
        }
    }
    return selectedValue;
}

function getSystemInstructions() {
    return systemInstructionsInput.value;
}

function connectBtnClick() {
    try {
        setAppStatus("connecting");
        console.log("WebSocket bağlantısı başlatılıyor...");

        geminiLiveApi.responseModalities = getSelectedResponseModality();
        geminiLiveApi.systemInstructions = getSystemInstructions();

        geminiLiveApi.onConnectionStarted = () => {
            console.log("WebSocket bağlantısı başarılı");
            setAppStatus("connected");
            startAudioInput();
        };

        geminiLiveApi.onErrorMessage = (message) => {
            console.error("Bağlantı hatası:", message);
            showDialogWithMessage(message);
            setAppStatus("disconnected");
        };

        if (!projectInput.value) {
            throw new Error("Project ID boş olamaz");
        }

        if (!accessTokenInput.value) {
            throw new Error("Access Token boş olamaz");
        }

        geminiLiveApi.setProjectId(projectInput.value);
        geminiLiveApi.connect(accessTokenInput.value);
    } catch (error) {
        console.error("Bağlantı hatası:", error);
        showDialogWithMessage("Bağlantı hatası: " + error.message);
        setAppStatus("disconnected");
    }
}

const liveAudioOutputManager = new LiveAudioOutputManager();

geminiLiveApi.onReceiveResponse = (messageResponse) => {
    if (messageResponse.type == "AUDIO") {
        liveAudioOutputManager.playAudioChunk(messageResponse.data);
    } else if (messageResponse.type == "TEXT") {
        console.log("Gemini said: ", messageResponse.data);
        newModelMessage(messageResponse.data);
    }
};

const liveAudioInputManager = new LiveAudioInputManager();

liveAudioInputManager.onNewAudioRecordingChunk = (audioData) => {
    geminiLiveApi.sendAudioMessage(audioData);
};

// Turn complete callback
liveAudioInputManager.onTurnCompleteCallback = (message) => {
    geminiLiveApi.sendMessage(message);
};

// Turn complete sinyali gönderme
function submitTurn() {
    geminiLiveApi.sendTurnComplete();
    micBtn.disabled = true;
    micOffBtn.disabled = true;
}

// Chat baloncuklu mesaj ekleme
function addChatMessage(text, sender = "user") {
    const chat = document.getElementById("text-chat");
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble " + (sender === "user" ? "user" : "model");
    bubble.textContent = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
}

// Kullanıcı mesajı gönderme
function newUserMessage() {
    const textInput = document.getElementById("text-message");
    const text = textInput.value.trim();
    if (!text) return;
    addChatMessage(text, "user");
    geminiLiveApi.sendTextMessage(text);
    textInput.value = "";
}

// Model mesajı ekleme
function newModelMessage(message) {
    addChatMessage(message, "model");
}

// Enter ile gönderme
window.addEventListener("DOMContentLoaded", function() {
    const textInput = document.getElementById("text-message");
    const sendBtn = document.getElementById("send-btn");
    if (textInput) {
        textInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                newUserMessage();
            }
        });
    }
    if (sendBtn) {
        sendBtn.addEventListener("click", newUserMessage);
    }

    // VAD sensitivity select listener
    const vadSelect = document.getElementById("vadSensitivity");
    if (vadSelect) {
        vadSelect.addEventListener("change", function(e) {
            const sensitivity = e.target.value;
            console.log("VAD sensitivity changed to:", sensitivity);
            setVADSensitivity(sensitivity);
            
            // UI feedback
            const feedback = sensitivity === 'more' ? 
                "Daha hassas mod: Konuşma kesintileri daha kolay tetiklenecek" : 
                "Daha az hassas mod: Konuşma kesintileri daha az tetiklenecek";
            
            showDialogWithMessage(feedback);
        });
    }
});

function startAudioInput() {
    liveAudioInputManager.connectMicrophone();
}

function stopAudioInput() {
    liveAudioInputManager.disconnectMicrophone();
}

// Interruption handler
geminiLiveApi.onInterruptionCallback = () => {
    console.log('Interruption detected');
    liveAudioOutputManager.handleInterruption();
    setAppStatus('interrupted');
};

// VAD sensitivity ayarı
function setVADSensitivity(sensitivity) {
    console.log("Setting VAD sensitivity to:", sensitivity);
    geminiLiveApi.setVADSensitivity(sensitivity);
    
    // Log ekle
    logWsEvent("VAD", "Sensitivity changed", sensitivity);
}

// Model speaking state yönetimi
function setModelSpeaking(isSpeaking) {
    geminiLiveApi.isModelSpeaking = isSpeaking;
    if (isSpeaking) {
        setAppStatus('speaking');
    } else {
        setAppStatus('connected');
    }
}

// Mic button yönetimi
function micBtnClick() {
    stopAudioInput();
    micBtn.hidden = true;
    micOffBtn.hidden = false;
    liveAudioInputManager.stopRecording();
    submitTurn(); // Turn complete sinyali gönder
}

function micOffBtnClick() {
    startAudioInput();
    micBtn.hidden = false;
    micOffBtn.hidden = true;
    liveAudioInputManager.turnComplete = false;
    liveAudioOutputManager.clearInterruption();
}

function showDialogWithMessage(messageText) {
    const dialog = document.getElementById("dialog");
    const dialogMessage = document.getElementById("dialogMessage");
    dialogMessage.innerHTML = messageText;
    dialog.show();
}

async function getAvailableDevices(deviceType) {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const devices = [];
    allDevices.forEach((device) => {
        if (device.kind === deviceType) {
            devices.push({
                id: device.deviceId,
                name: device.label || device.deviceId,
            });
        }
    });
    return devices;
}

async function getAvailableCameras() {
    return await this.getAvailableDevices("videoinput");
}

async function getAvailableAudioInputs() {
    return await this.getAvailableDevices("audioinput");
}

function setMaterialSelect(allOptions, selectElement) {
    allOptions.forEach((optionData) => {
        const option = document.createElement("md-select-option");
        option.value = optionData.id;

        const slotDiv = document.createElement("div");
        slotDiv.slot = "headline";
        slotDiv.innerHTML = optionData.name;
        option.appendChild(slotDiv);

        selectElement.appendChild(option);
    });
}

async function setAvailableCamerasOptions() {
    const cameras = await getAvailableCameras();
    const videoSelect = document.getElementById("cameraSource");
    setMaterialSelect(cameras, videoSelect);
}

async function setAvailableMicrophoneOptions() {
    const mics = await getAvailableAudioInputs();
    const audioSelect = document.getElementById("audioSource");
    setMaterialSelect(mics, audioSelect);
}

function setAppStatus(status) {
    disconnected.hidden = true;
    connecting.hidden = true;
    connected.hidden = true;
    speaking.hidden = true;

    switch (status) {
        case "disconnected":
            disconnected.hidden = false;
            break;
        case "connecting":
            connecting.hidden = false;
            break;
        case "connected":
            connected.hidden = false;
            break;
        case "speaking":
            speaking.hidden = false;
            break;
        case "interrupted":
            speaking.hidden = false;
            break;
        default:
    }
}

// Log fonksiyonu
function logWsEvent(type, event, message) {
    const logContainer = document.getElementById("ws-logs-content");
    if (!logContainer) return;
    const now = new Date();
    const time = now.toLocaleTimeString("tr-TR", { hour12: false }) + "." + String(now.getMilliseconds()).padStart(3, '0');
    const entry = document.createElement("div");
    entry.className = "log-entry";

    // Renkli class
    let typeClass = "";
    if (type === "ERROR") typeClass = "error-event";
    else if (type === "SETUP") typeClass = "setup-event";
    else if (type === "SEND") typeClass = "send-event";
    else if (type === "RECV") typeClass = "recv-event";
    else typeClass = "ws-event";

    // Her parça için ayrı span
    const timeSpan = document.createElement("span");
    timeSpan.className = "log-time";
    timeSpan.textContent = `[${time}]`;

    const typeSpan = document.createElement("span");
    typeSpan.className = typeClass;
    typeSpan.textContent = `[${type}]`;

    const eventSpan = document.createElement("span");
    eventSpan.className = "log-event";
    if (event) eventSpan.textContent = `[${event}]`;

    const msgSpan = document.createElement("span");
    msgSpan.className = "log-msg";
    if (message instanceof ArrayBuffer) {
        try {
            const decoder = new TextDecoder('utf-8');
            msgSpan.textContent = decoder.decode(new Uint8Array(message));
        } catch (e) {
            msgSpan.textContent = '[Veri çözümlenemedi]';
        }
    } else if (message instanceof Uint8Array) {
        try {
            const decoder = new TextDecoder('utf-8');
            msgSpan.textContent = decoder.decode(message);
        } catch (e) {
            msgSpan.textContent = '[Veri çözümlenemedi]';
        }
    } else {
        msgSpan.textContent = message;
    }

    // Sıralı ekle
    entry.appendChild(timeSpan);
    entry.appendChild(typeSpan);
    if (event) entry.appendChild(eventSpan);
    if (message) entry.appendChild(msgSpan);

    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// GeminiLiveAPI eventlerine log ekle
const oldOnConnectionStarted = geminiLiveApi.onConnectionStarted;
geminiLiveApi.onConnectionStarted = function() {
    logWsEvent("OPEN", "WebSocket bağlantısı açıldı.");
    if (oldOnConnectionStarted) oldOnConnectionStarted();
};
const oldOnErrorMessage = geminiLiveApi.onErrorMessage;
geminiLiveApi.onErrorMessage = function(message) {
    logWsEvent("ERROR", "WebSocket bağlantısı kesildi.", message);
    if (oldOnErrorMessage) oldOnErrorMessage(message);
};

// Mesaj gönderme ve alma logları
const oldSendAudioMessage = geminiLiveApi.sendAudioMessage;
geminiLiveApi.sendAudioMessage = function(audioData) {
    console.log("Gönderilen ses verisi:", audioData);
    logWsEvent("SEND", "Sesli mesaj gönderildi (AUDIO)", "Ses verisi gönderildi");
    oldSendAudioMessage.call(this, audioData);
};
const oldSendTextMessage = geminiLiveApi.sendTextMessage;
geminiLiveApi.sendTextMessage = function(text) {
    logWsEvent("SEND", "Metin mesajı gönderildi", text);
    oldSendTextMessage.call(this, text);
};
const oldSendImageMessage = geminiLiveApi.sendImageMessage;
geminiLiveApi.sendImageMessage = function(image) {
    logWsEvent("SEND", "Görsel mesaj gönderildi (IMAGE)", image);
    oldSendImageMessage.call(this, image);
};
const oldOnReceiveResponse = geminiLiveApi.onReceiveResponse;
geminiLiveApi.onReceiveResponse = function(messageResponse) {
    if (messageResponse.type === "AUDIO") {
        console.log("Alınan ses verisi:", messageResponse.data);
        logWsEvent("RECV", "Sesli mesaj alındı (AUDIO)", "Ses verisi alındı");
    } else if (messageResponse.type === "TEXT") {
        logWsEvent("RECV", "Metin mesajı alındı", messageResponse.data);
    } else {
        logWsEvent("RECV", "Bilinmeyen mesaj tipi", messageResponse.type);
    }
    if (oldOnReceiveResponse) oldOnReceiveResponse(messageResponse);
};

// Setup mesajı logu (örnek)
const oldSendInitialSetupMessages = geminiLiveApi.sendInitialSetupMessages;
geminiLiveApi.sendInitialSetupMessages = function() {
    logWsEvent("SETUP", "Setup mesajı gönderildi.");
    oldSendInitialSetupMessages.call(this);
};

function disconnectBtnClick() {
    try {
        if (geminiLiveApi && typeof geminiLiveApi.disconnect === "function") {
            geminiLiveApi.disconnect();
        }
        setAppStatus("disconnected");
        logWsEvent("CLOSE", "WebSocket bağlantısı kapatıldı.");
    } catch (error) {
        console.error("Bağlantı kapatılamadı:", error);
        showDialogWithMessage("Bağlantı kapatılamadı: " + error.message);
    }
}

geminiLiveApi.onSetupComplete = () => {
    console.log("Setup complete, enabling mic button");
    micBtn.disabled = false;
    micOffBtn.disabled = false;
    setAppStatus("connected");
};

// UI feedback için
function updateAudioFeedback(status) {
    const feedbackElement = document.getElementById('audio-feedback');
    switch(status) {
        case 'speaking':
            feedbackElement.textContent = 'Konuşma devam ediyor...';
            break;
        case 'silence':
            feedbackElement.textContent = 'Sessizlik algılandı...';
            break;
        case 'turn_complete':
            feedbackElement.textContent = 'Turn tamamlandı';
            break;
    }
}

function logMessage(message) {
    // Console'a log
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
    
    // UI'a log
    const logDiv = document.getElementById('log-output');
    if (logDiv) {
        const logElement = document.createElement('div');
        logElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logDiv.appendChild(logElement);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}
