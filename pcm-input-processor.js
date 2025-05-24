class PCMInputProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Int16Array(2048);
        this.bufferWriteIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const channelData = input[0];

        // Gelen ses verisini buffer'a yaz
        for (let i = 0; i < channelData.length; i++) {
            if (this.bufferWriteIndex < this.buffer.length) {
                // Float32'den Int16'ya dönüştür
                this.buffer[this.bufferWriteIndex] = channelData[i] * 32767;
                this.bufferWriteIndex++;
            }
        }

        // Buffer dolduğunda gönder ve temizle
        if (this.bufferWriteIndex >= this.buffer.length) {
            this.sendAndClearBuffer();
        }

        return true;
    }

    sendAndClearBuffer() {
        this.port.postMessage({
            event: "chunk",
            data: {
                int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer
            }
        });
        this.bufferWriteIndex = 0;
    }
}

registerProcessor("pcm-input-processor", PCMInputProcessor);


