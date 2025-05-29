class MediaHandler {
    constructor(previewVideoElement, previewCanvasElement) {
        this.previewVideoElement = previewVideoElement;
        this.previewCanvasElement = previewCanvasElement;
        this.ctx = this.previewCanvasElement.getContext("2d");
        
        // Stream ve durum yönetimi
        this.webcamStream = null;
        this.screenStream = null;
        this.frameCapture = null;
        
        // Durum bayrakları
        this.isWebcamActive = false;
        this.isScreenActive = false;
        
        // Frame yakalama ayarları
        this.frameRate = 2; // 2 FPS
        this.frameQuality = 0.8; // JPEG kalitesi
        this.targetTokenUsage = 258; // Hedef token kullanımı
        
        // Callback fonksiyonu
        this.onFrame = null;
    }

    // Webcam başlatma
    async startWebcam() {
        try {
            const constraints = {
                video: true
            };
            this.webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.previewVideoElement.srcObject = this.webcamStream;
            this.isWebcamActive = true;
            this.startFrameCapture();
        } catch (err) {
            console.error("Webcam erişim hatası:", err);
            throw err;
        }
    }

    // Ekran paylaşımı başlatma
    async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            });
            this.previewVideoElement.srcObject = this.screenStream;
            this.isScreenActive = true;
            this.startFrameCapture();
        } catch (err) {
            console.error("Ekran paylaşımı hatası:", err);
            throw err;
        }
    }

    // Frame yakalama başlatma
    startFrameCapture(onFrame) {
        if (onFrame) {
            this.onFrame = onFrame;
        }

        const captureFrame = () => {
            if (!this.isWebcamActive && !this.isScreenActive) return;

            this.previewCanvasElement.width = this.previewVideoElement.videoWidth;
            this.previewCanvasElement.height = this.previewVideoElement.videoHeight;
            
            this.ctx.drawImage(
                this.previewVideoElement,
                0,
                0,
                this.previewCanvasElement.width,
                this.previewCanvasElement.height
            );

            const base64Image = this.previewCanvasElement.toDataURL('image/jpeg', this.frameQuality);
            
            if (this.onFrame) {
                const message = {
                    realtimeInput: {
                        mediaChunks: [{
                            mime_type: "image/jpeg",
                            data: base64Image.split(',')[1]
                        }]
                    }
                };
                this.onFrame(message);
            }
        };

        // Dinamik FPS için interval hesaplama
        const interval = 500 / this.frameRate;
        this.frameCapture = setInterval(captureFrame, interval);
    }

    // Frame yakalamayı durdurma
    stopFrameCapture() {
        if (this.frameCapture) {
            clearInterval(this.frameCapture);
            this.frameCapture = null;
        }
    }

    // Webcam'i durdurma
    stopWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
            this.isWebcamActive = false;
        }
        this.stopFrameCapture();
    }

    // Ekran paylaşımını durdurma
    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
            this.isScreenActive = false;
        }
        this.stopFrameCapture();
    }

    // Tüm medya akışlarını durdurma
    stopAll() {
        this.stopWebcam();
        this.stopScreenShare();
        this.previewVideoElement.srcObject = null;
    }

    // Frame kalitesini ayarlama
    setFrameQuality(quality) {
        this.frameQuality = Math.max(0.1, Math.min(1.0, quality));
    }

    // Token kullanımına göre dinamik ayarlama
    adjustSettingsForTokenUsage(currentTokenUsage) {
        if (currentTokenUsage > this.targetTokenUsage) {
            // Token kullanımı yüksekse kaliteyi düşür
            this.setFrameQuality(Math.max(0.1, this.frameQuality - 0.1));
            // Frame rate'i düşür
            this.setFrameRate(Math.max(1, this.frameRate - 1));
        } else if (currentTokenUsage < this.targetTokenUsage * 0.8) {
            // Token kullanımı düşükse kaliteyi artır
            this.setFrameQuality(Math.min(1.0, this.frameQuality + 0.1));
            // Frame rate'i artır
            this.setFrameRate(Math.min(30, this.frameRate + 1));
        }
    }

    // Frame hızını ayarlama
    setFrameRate(fps) {
        this.frameRate = Math.max(1, Math.min(30, fps));
        if (this.frameCapture) {
            this.stopFrameCapture();
            this.startFrameCapture();
        }
    }
} 