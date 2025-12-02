Project Aegis II: Ghost Protocol

    > **Sovereign Memory & Anti-Censorship Suite** > *Intercepts AI data streams, encrypts them locally, and covertly exfiltrates them via network timing channels.*

    ## New in v2.2 (Ghost Protocol)
    This update transforms Aegis from a passive vault to an active counter-surveillance tool.

    * **Covert Exfiltration:** Smuggles encrypted logs out of the browser using **Network Steganography**.
    * **Timing Channels:** Encodes data in the *delay* between HTTP requests (200ms = 0, 500ms = 1).
    * **AI-Resistant Jitter:** Uses Gaussian noise to defeat pattern-matching firewalls.
    * **Intelligent Receiver:** Python server uses **K-Means Clustering** to decode the noisy signal.

    ## Installation

    ### 1. The Chrome Extension
    1.  Open `chrome://extensions`
    2.  Enable **Developer Mode**.
    3.  Click **Load Unpacked**.
    4.  Select the `aegis-ghost-protocol` folder.

    ### 2. The Listening Post (Receiver)
    You need Python installed.

    ```bash
    pip install -r requirements.txt
    python receiver_server.py
    ```

    ## How to Demo (Hackathon Flow)
    1.  **Start the Receiver:** Run `python receiver_server.py` in a terminal.
    2.  **Open Browser:** Go to an AI chat site (or any site for testing).
    3.  **Capture:** Click the Aegis extension icon to start recording (Green Badge).
    4.  **View Vault:** Press `Ctrl+Shift+U` to see the overlay.
    5.  **Exfiltrate:** Click the **TRANSMIT (COVERT)** button in the overlay.
    6.  **Watch Terminal:** See the Python script detect the pulses and decode the message in real-time.
