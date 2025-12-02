import time
        import sys
        import numpy as np
        from flask import Flask, Response
        from flask_cors import CORS
        from sklearn.cluster import KMeans

        app = Flask(__name__)
        CORS(app) # Allow cross-origin for the "pixel" fetch

        class SignalBuffer:
            def __init__(self):
                self.last_packet_time = 0
                self.raw_deltas = []
                self.capture_active = False

        receiver = SignalBuffer()

        def decode_signal(deltas):
            if len(deltas) < 8: return
            print(f"\n[*] Processing {len(deltas)} signal pulses...")
            X = np.array(deltas).reshape(-1, 1)
            kmeans = KMeans(n_clusters=2, n_init=10).fit(X)
            centers = kmeans.cluster_centers_.flatten()
            mapping = {0: 0, 1: 1} if centers[0] < centers[1] else {0: 1, 1: 0}
            decoded_bits = [mapping[label] for label in kmeans.labels_]
            
            msg = ""
            try:
                for i in range(0, len(decoded_bits), 8):
                    byte = decoded_bits[i:i+8]
                    if len(byte) < 8: break
                    msg += chr(int("".join(str(b) for b in byte), 2))
                print(f"\n[+] DECODED PAYLOAD: {msg}\n")
            except: pass

        @app.route('/pixel.png')
        def handle_pulse():
            arrival_time = time.perf_counter()
            if receiver.last_packet_time == 0:
                receiver.last_packet_time = arrival_time
                receiver.capture_active = True
                print("[*] Signal Start Detected...")
                return Response(status=204)

            delta = arrival_time - receiver.last_packet_time
            receiver.last_packet_time = arrival_time

            if delta > 1.5 and receiver.capture_active:
                print("[*] End of Transmission.")
                decode_signal(receiver.raw_deltas)
                receiver.raw_deltas = []
                receiver.capture_active = False
                return Response(status=204)

            if delta > 0.05: # Filter noise
                receiver.raw_deltas.append(delta)
                sys.stdout.write(f"\r[*] Pulse Gap: {delta*1000:.1f}ms")
                sys.stdout.flush()

            return Response(status=204)

        if __name__ == '__main__':
            print("[*] Listening Post Active on :5000")
            app.run(host='0.0.0.0', port=5000, threaded=False)