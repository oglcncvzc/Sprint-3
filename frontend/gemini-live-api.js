class GeminiLiveResponseMessage {
    constructor(data) {
        this.data = "";
        this.type = "";
        this.endOfTurn = data?.serverContent?.turnComplete;

        const parts = data?.serverContent?.modelTurn?.parts;

        if (data?.setupComplete) {
            this.type = "SETUP COMPLETE";
        } else if (parts?.length && parts[0].text) {
            this.data = parts[0].text;
            this.type = "TEXT";
        } else if (parts?.length && parts[0].inlineData) {
            this.data = parts[0].inlineData.data;
            this.type = "AUDIO";
        }
    }
}

class GeminiLiveAPI {
    constructor(proxyUrl, projectId, model, apiHost) {
        this.proxyUrl = proxyUrl;
        this.projectId = projectId;
        this.model = model;
        this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;

        this.responseModalities = ["AUDIO"];
        this.systemInstructions = "";

        this.apiHost = apiHost;
        this.serviceUrl = `wss://${this.apiHost}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

        this.onReceiveResponse = (message) => {
            console.log("Default message received callback", message);
        };

        this.onConnectionStarted = () => {
            console.log("Default onConnectionStarted");
        };

        this.onErrorMessage = (message) => {
            console.error("WebSocket Error:", message);
        };

        this.accessToken = "";
        this.websocket = null;

        this.isInterrupted = false;
        this.isModelSpeaking = false;
        this.vadSensitivity = 'less'; // 'more' veya 'less'

        console.log("Created Gemini Live API object: ", this);
    }

    setProjectId(projectId) {
        this.projectId = projectId;
        this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;
    }

    setAccessToken(newAccessToken) {
        console.log("setting access token: ", newAccessToken);
        this.accessToken = newAccessToken;
    }

    connect(accessToken) {
        this.setAccessToken(accessToken);
        this.setupWebSocketToService();
    }

    disconnect() {
        this.webSocket.close();
    }

    sendMessage(message) {
        this.webSocket.send(JSON.stringify(message));
    }

    onReceiveMessage(messageEvent) {
        console.log("Message received: ", messageEvent);
        const messageData = JSON.parse(messageEvent.data);
        
        if (messageData.setupComplete) {
            console.log("Setup complete, enabling mic button");
            this.onSetupComplete();
            return;
        }

        if (messageData.serverContent?.interrupted) {
            console.log('Gemini: Interrupted');
            this.isInterrupted = true;
            this.onInterrupted();
            return;
        }

        const message = new GeminiLiveResponseMessage(messageData);
        this.onReceiveResponse(message);
    }

    onInterrupted() {
        if (this.audioOutputManager) {
            this.audioOutputManager.stop();
        }
        
        if (this.onInterruptionCallback) {
            this.onInterruptionCallback();
        }
    }

    setVADSensitivity(sensitivity) {
        if (sensitivity === 'more' || sensitivity === 'less') {
            console.log(`VAD sensitivity changing from ${this.vadSensitivity} to ${sensitivity}`);
            this.vadSensitivity = sensitivity;
            this.sendVADSensitivityUpdate(sensitivity);
            
            // State değişikliğini logla
            if (this.onVADSensitivityChanged) {
                this.onVADSensitivityChanged(sensitivity);
            }
        }
    }

    sendVADSensitivityUpdate(sensitivity) {
        const message = {
            vad_config: {
                sensitivity: sensitivity
            }
        };
        this.sendMessage(message);
    }

    sendTurnComplete() {
        const message = {
            client_content: {
                turns: [{
                    role: "user",
                    parts: []
                }],
                turn_complete: true
            }
        };
        this.sendMessage(message);
    }

    setupWebSocketToService() {
        try {
            console.log("Connecting to WebSocket server:", this.proxyUrl);
            
            this.webSocket = new WebSocket(this.proxyUrl);

            this.webSocket.onclose = (event) => {
                console.log("WebSocket closed:", event);
                this.onErrorMessage("Bağlantı kapandı");
            };

            this.webSocket.onerror = (event) => {
                console.error("WebSocket error:", event);
                this.onErrorMessage("Bağlantı hatası oluştu");
            };

            this.webSocket.onopen = (event) => {
                console.log("WebSocket connection established:", event);
                this.sendInitialSetupMessages();
                this.onConnectionStarted();
            };

            this.webSocket.onmessage = this.onReceiveMessage.bind(this);
        } catch (error) {
            console.error("WebSocket setup error:", error);
            this.onErrorMessage("WebSocket bağlantısı kurulamadı: " + error.message);
        }
    }

    sendInitialSetupMessages() {
        const serviceSetupMessage = {
            bearer_token: this.accessToken,
            service_url: this.serviceUrl,
        };
        this.sendMessage(serviceSetupMessage);

        const sessionSetupMessage = {
            setup: {
                model: this.modelUri,
                generation_config: {
                    response_modalities: this.responseModalities,
                },
                system_instruction: {
                    parts: [{ text: this.systemInstructions }],
                },
            },
        };
        this.sendMessage(sessionSetupMessage);
    }

    sendTextMessage(text) {
        const textMessage = {
            client_content: {
                turns: [
                    {
                        role: "user",
                        parts: [{ text: text }],
                    },
                ],
                turn_complete: true,
            },
        };
        this.sendMessage(textMessage);
    }

    sendRealtimeInputMessage(data, mime_type) {
        const message = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: mime_type,
                        data: data,
                    },
                ],
            },
        };
        this.sendMessage(message);
    }

    sendAudioMessage(base64PCM) {
        this.sendRealtimeInputMessage(base64PCM, "audio/pcm");
    }

    sendImageMessage(base64Image, mime_type = "image/jpeg") {
        this.sendRealtimeInputMessage(base64Image, mime_type);
    }

    sendTurnContinueMessage() {
        const message = {
            client_content: {
                turns: [{
                    role: "user",
                    parts: []
                }],
                turn_complete: false
            }
        };
        this.sendMessage(message);
    }

    handleTurnBoundary() {
        // Turn başlangıcı
        this.onTurnStart = () => {
            console.log("Turn başladı");
            setAppStatus("user_speaking");
        };

        // Turn sonu
        this.onTurnEnd = () => {
            console.log("Turn bitti");
            setAppStatus("connected");
        };
    }

    updateVADAndTurnBoundary(sensitivity) {
        const vadThresholds = {
            'less': {
                silenceDuration: 1000, // 1 saniye
                energyThreshold: 0.3
            },
            'more': {
                silenceDuration: 500,  // 0.5 saniye
                energyThreshold: 0.2
            }
        };

        const config = vadThresholds[sensitivity];
        this.updateVADConfig(config);
    }

    updateVADConfig(config) {
        this.vadConfig = {
            ...this.vadConfig,
            ...config
        };
        
        // VAD değişikliğini logla
        logWsEvent("VAD", "Config updated", config);
        
        // UI feedback
        updateAudioFeedback('vad_updated');
    }
}

console.log("loaded gemini-live-api.js");
