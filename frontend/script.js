window.addEventListener("load", (event) => {
    console.log("Hello Gemini Realtime Demo!");

    setAvailableCamerasOptions();
    setAvailableMicrophoneOptions();
});

const PROXY_URL = "ws://localhost:8080/ws";
const PROJECT_ID = "voice-asistant-459013";
const MODEL = "gemini-2.0-flash-live-preview-04-09";
const API_HOST = "us-central1-aiplatform.googleapis.com";

const projectInput = document.getElementById("project");
const systemInstructionsInput = document.getElementById("systemInstructions");

CookieJar.init("project");
CookieJar.init("systemInstructions");

const disconnected = document.getElementById("disconnected");
const connecting = document.getElementById("connecting");
const connected = document.getElementById("connected");
const speaking = document.getElementById("speaking");

const micBtn = document.getElementById("micBtn");
const micOffBtn = document.getElementById("micOffBtn");
const cameraBtn = document.getElementById("cameraBtn");
const screenBtn = document.getElementById("screenBtn");

const cameraSelect = document.getElementById("cameraSource");
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

// Token'ı backend'den alma fonksiyonu
async function getAccessToken() {
    try {
        const response = await fetch('http://localhost:5000/api/get-token');
        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Token alınamadı:', error);
        throw error;
    }
}

async function connectBtnClick() {
    setAppStatus("connecting");

    geminiLiveApi.responseModalities = getSelectedResponseModality();
    geminiLiveApi.systemInstructions = getSystemInstructions();

    geminiLiveApi.onConnectionStarted = () => {
        setAppStatus("connected");
        startAudioInput();
    };

    geminiLiveApi.onConnectionError = (error) => {
        console.error("Connection error:", error);
        showDialogWithMessage("Bağlantı hatası: " + error);
        setAppStatus("disconnected");
    };

    geminiLiveApi.setProjectId(projectInput.value);
    // Boş bir auth mesajı gönder
    geminiLiveApi.connect(JSON.stringify({}));
}

const liveAudioOutputManager = new LiveAudioOutputManager();

let modelMessageBuffer = "";
let modelTypingDiv = null;
let modelTypingTimeout = null;

function showModelTyping() {
    const textChat = document.getElementById("text-chat");
    if (!modelTypingDiv) {
        modelTypingDiv = document.createElement("div");
        modelTypingDiv.className = "chat-message bot typing-dots";
        modelTypingDiv.textContent = "";
        textChat.appendChild(modelTypingDiv);
    }
    textChat.scrollTop = textChat.scrollHeight;
}

function updateModelTyping(text) {
    if (modelTypingDiv) {
        modelTypingDiv.textContent = text;
        modelTypingDiv.classList.add("typing-dots");
    }
}

function finishModelTyping() {
    if (modelTypingDiv) {
        modelTypingDiv.textContent = modelMessageBuffer.trim();
        modelTypingDiv.classList.remove("typing-dots");
        modelTypingDiv = null;
    }
    modelMessageBuffer = "";
    if (modelTypingTimeout) {
        clearTimeout(modelTypingTimeout);
        modelTypingTimeout = null;
    }
    const textChat = document.getElementById("text-chat");
    textChat.scrollTop = textChat.scrollHeight;
}

geminiLiveApi.onReceiveResponse = (messageResponse) => {
    if (messageResponse.type == "AUDIO") {
        liveAudioOutputManager.playAudioChunk(messageResponse.data);
    } else if (messageResponse.type == "TEXT") {
        showModelTyping();
        modelMessageBuffer += messageResponse.data;
        updateModelTyping(modelMessageBuffer);
        // Her yeni mesajda zamanlayıcıyı başlat
        if (modelTypingTimeout) clearTimeout(modelTypingTimeout);
        modelTypingTimeout = setTimeout(() => {
            finishModelTyping();
        }, 1200); // 1.2 saniye boyunca yeni mesaj gelmezse mesajı tamamla
    }
};

const liveAudioInputManager = new LiveAudioInputManager();

liveAudioInputManager.onNewAudioRecordingChunk = (audioData) => {
    geminiLiveApi.sendAudioMessage(audioData);
};

function addMessageToChat(message, isUser = false) {
    const textChat = document.getElementById("text-chat");
    const msgDiv = document.createElement("div");
    msgDiv.className = isUser ? "chat-message user" : "chat-message bot";
    msgDiv.textContent = message.trim();
    textChat.appendChild(msgDiv);
    textChat.scrollTop = textChat.scrollHeight;
}

function newModelMessage(message) {
    addMessageToChat(message, false);
}

function newUserMessage() {
    const textMessage = document.getElementById("text-message");
    if (textMessage.value.trim() === "") return;
    addMessageToChat(textMessage.value, true);
    geminiLiveApi.sendTextMessage(textMessage.value);
    textMessage.value = "";
}

// Enter ile mesaj gönderme
const textMessageInput = document.getElementById("text-message");
if (textMessageInput) {
    textMessageInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            newUserMessage();
        }
    });
}

function startAudioInput() {
    liveAudioInputManager.connectMicrophone();
}

function stopAudioInput() {
    liveAudioInputManager.disconnectMicrophone();
}

function micBtnClick() {
    console.log("micBtnClick");
    stopAudioInput();
    micBtn.hidden = true;
    micOffBtn.hidden = false;
}

function micOffBtnClick() {
    console.log("micOffBtnClick");
    startAudioInput();

    micBtn.hidden = false;
    micOffBtn.hidden = true;
}

const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("canvas");

const mediaHandler = new MediaHandler(videoElement, canvasElement);

mediaHandler.onFrame = (frameData) => {
    geminiLiveApi.sendImageMessage(frameData.realtimeInput.mediaChunks[0].data);
};

function startCameraCapture() {
    mediaHandler.stopScreenShare();
    mediaHandler.startWebcam();
    document.getElementById('stopAllBtn').hidden = false;
}

function startScreenCapture() {
    mediaHandler.stopWebcam();
    mediaHandler.startScreenShare();
    document.getElementById('stopAllBtn').hidden = false;
}

function stopAllMedia() {
    mediaHandler.stopAll();
    document.getElementById('stopAllBtn').hidden = true;
}

function cameraBtnClick() {
    startCameraCapture();
    console.log("cameraBtnClick");
}

function screenShareBtnClick() {
    startScreenCapture();
    console.log("screenShareBtnClick");
}

function newCameraSelected() {
    console.log("newCameraSelected ", cameraSelect.value);
    if (mediaHandler.isWebcamActive) {
        mediaHandler.stopWebcam();
        mediaHandler.startWebcam();
    }
}

function newMicSelected() {
    console.log("newMicSelected", micSelect.value);
    liveAudioInputManager.updateMicrophoneDevice(micSelect.value);
}

function disconnectBtnClick() {
    setAppStatus("disconnected");
    geminiLiveApi.disconnect();
    stopAudioInput();
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
    setModelState(status);
}

function setModelState(state) {
    // Tüm state'leri gizle ve .active'i kaldır
    ["disconnected", "connecting", "connected"].forEach(id => {
        const el = document.getElementById(id);
        el.hidden = true;
        el.classList.remove("active");
    });

    // Sadece aktif olanı göster ve .active ekle
    const activeEl = document.getElementById(state);
    if (activeEl) {
        activeEl.hidden = false;
        activeEl.classList.add("active");
    }
}
