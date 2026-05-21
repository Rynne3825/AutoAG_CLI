// Auto-submit Command Execution Requests (Ultimate Network & DOM Hybrid Edition v3)
// Shadow Stream Monitor v3: gRPC Frame Parser + Auto-Reconnect + Retry Limiter
(() => {
    console.log('[Auto-Submit] Preload patch v3 loading...');

    // Memory cache to prevent duplicate approvals
    if (!window.approvedNetworkSteps) {
        window.approvedNetworkSteps = new Set();
    }

    // Retry counter per conversation: conversationId -> count
    if (!window.retryCounters) {
        window.retryCounters = {};
    }
    const MAX_RETRY_PER_SESSION = 10;

    // Maximum concurrent shadow streams to avoid exhausting browser connection pool
    const MAX_SHADOW_STREAMS = 4;

    // =========================================================================
    // gRPC-Web Frame Parser - Properly handles TCP chunk fragmentation
    // =========================================================================
    class GrpcFrameParser {
        constructor() {
            this.buffer = new Uint8Array(0);
        }

        /** Append raw bytes from a network chunk into the internal buffer */
        appendChunk(chunk) {
            if (!(chunk instanceof Uint8Array)) {
                chunk = new Uint8Array(chunk);
            }
            const merged = new Uint8Array(this.buffer.length + chunk.length);
            merged.set(this.buffer, 0);
            merged.set(chunk, this.buffer.length);
            this.buffer = merged;
        }

        /** Extract all complete JSON frames from the buffer. Returns array of parsed objects. */
        extractFrames() {
            const frames = [];
            const decoder = new TextDecoder();

            while (this.buffer.length >= 5) {
                // Read 4-byte big-endian length from bytes 1-4
                const len = (this.buffer[1] << 24) | (this.buffer[2] << 16) | (this.buffer[3] << 8) | this.buffer[4];

                // Sanity check: reject impossible lengths
                if (len < 0 || len > 2 * 1024 * 1024) {
                    // Corrupt frame header - skip 1 byte and retry
                    this.buffer = this.buffer.slice(1);
                    continue;
                }

                // Not enough data yet for the full frame - wait for more chunks
                if (this.buffer.length < 5 + len) {
                    break;
                }

                // Extract payload
                const payload = this.buffer.slice(5, 5 + len);
                this.buffer = this.buffer.slice(5 + len);

                try {
                    const text = decoder.decode(payload);
                    const obj = JSON.parse(text);
                    frames.push(obj);
                } catch (_) {
                    // Not valid JSON (e.g. trailer frame) - skip silently
                }
            }

            return frames;
        }
    }

    // =========================================================================
    // Shadow Stream Manager v3
    // =========================================================================
    const ShadowStreamManager = {
        activeStreams: {},          // conversationId -> AbortController
        knownConversations: new Set(),
        currentActiveConv: null,
        isEnabled: true,
        lastActivity: {},          // conversationId -> timestamp (for LRU eviction)

        generateSubscriberId() {
            const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
            return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
        },

        checkSettings() {
            try {
                const fs = require('fs');
                const path = require('path');
                const os = require('os');
                const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity', 'autosubmit.json');
                if (fs.existsSync(settingsPath)) {
                    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    this.isEnabled = config.enabled !== false;
                }
            } catch (e) {}
            return this.isEnabled;
        },

        registerConversation(conversationId) {
            if (!conversationId) return;
            if (!this.knownConversations.has(conversationId)) {
                this.knownConversations.add(conversationId);
                console.log(`[Shadow Stream] Registered conversation: ${conversationId.substring(0, 12)}...`);
            }
            // Always update activity timestamp
            this.lastActivity[conversationId] = Date.now();
            this.ensureBackgroundStreams();
        },

        setActiveConversation(conversationId) {
            if (this.currentActiveConv === conversationId) return;
            const oldActive = this.currentActiveConv;
            this.currentActiveConv = conversationId;
            this.lastActivity[conversationId] = Date.now();
            console.log(`[Shadow Stream] Active changed: ${oldActive?.substring(0, 8) || 'none'} -> ${conversationId?.substring(0, 8)}...`);

            if (oldActive && oldActive !== conversationId) {
                setTimeout(() => this.createShadowStream(oldActive), 1000);
            }
            this.killShadowStream(conversationId);
        },

        killShadowStream(conversationId) {
            if (this.activeStreams[conversationId]) {
                console.log(`[Shadow Stream] Killing shadow for ${conversationId.substring(0, 8)}...`);
                this.activeStreams[conversationId].abort();
                delete this.activeStreams[conversationId];
            }
        },

        /** Get the N most recently active background conversations */
        getTopBackgroundConversations(maxCount) {
            const candidates = [...this.knownConversations]
                .filter(id => id !== this.currentActiveConv)
                .sort((a, b) => (this.lastActivity[b] || 0) - (this.lastActivity[a] || 0));
            return candidates.slice(0, maxCount);
        },

        async createShadowStream(conversationId) {
            if (!this.checkSettings()) return;
            if (this.activeStreams[conversationId]) return;
            if (conversationId === this.currentActiveConv) return;

            // Enforce connection pool limit
            const activeCount = Object.keys(this.activeStreams).length;
            if (activeCount >= MAX_SHADOW_STREAMS) {
                // Evict the oldest stream
                let oldestId = null;
                let oldestTime = Infinity;
                for (const id of Object.keys(this.activeStreams)) {
                    const t = this.lastActivity[id] || 0;
                    if (t < oldestTime) {
                        oldestTime = t;
                        oldestId = id;
                    }
                }
                if (oldestId) {
                    console.log(`[Shadow Stream] Evicting oldest stream ${oldestId.substring(0, 8)}... to free connection slot`);
                    this.killShadowStream(oldestId);
                }
            }

            const subscriberId = this.generateSubscriberId();
            const controller = new AbortController();
            this.activeStreams[conversationId] = controller;

            const payloadObj = {
                conversationId: conversationId,
                subscriberId: subscriberId,
                initialStepsPageBounds: { startIndex: -50 },
                initialGeneratorMetadatasPageBounds: { startIndex: -1 },
                initialExecutorMetadatasPageBounds: { endIndexExclusive: 0 }
            };
            const jsonStr = JSON.stringify(payloadObj);
            const encodedPayload = encodeGrpcWebPayload(jsonStr);

            console.log(`🔌 [Shadow Stream] Opening background stream for ${conversationId.substring(0, 8)}...`);

            try {
                const response = await originalFetchRef('/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/grpc-web+json',
                        'accept': 'application/grpc-web+json'
                    },
                    body: encodedPayload,
                    signal: controller.signal
                });

                if (!response.ok || !response.body) {
                    console.warn(`[Shadow Stream] Failed to open for ${conversationId.substring(0, 8)}...: ${response.status}`);
                    delete this.activeStreams[conversationId];
                    return;
                }

                const reader = response.body.getReader();
                const frameParser = new GrpcFrameParser();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log(`[Shadow Stream] Stream ended for ${conversationId.substring(0, 8)}...`);
                        break;
                    }

                    try {
                        frameParser.appendChunk(value);
                        const frames = frameParser.extractFrames();
                        for (const frame of frames) {
                            this.processFrame(frame, conversationId);
                        }
                    } catch (chunkErr) {
                        // Silently continue
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log(`[Shadow Stream] Aborted for ${conversationId.substring(0, 8)}...`);
                } else {
                    console.warn(`[Shadow Stream] Error for ${conversationId.substring(0, 8)}...:`, err.message);
                }
            } finally {
                delete this.activeStreams[conversationId];
            }
        },

        /** Process a fully-parsed JSON frame from a shadow stream */
        processFrame(frame, cascadeId) {
            const frameStr = JSON.stringify(frame);
            if (!frameStr.includes('trajectoryId') || !frameStr.includes('stepIndex')) return;

            // Check for permission-related content
            if (frameStr.includes('permission') || frameStr.includes('WAITING_FOR_USER') || frameStr.includes('askPermission')) {
                const trajMatch = frameStr.match(/"trajectoryId":"([^"]+)"/);
                const stepMatch = frameStr.match(/"stepIndex":(\d+)/);
                if (!trajMatch || !stepMatch) return;

                const trajectoryId = trajMatch[1];
                const stepIndex = parseInt(stepMatch[1], 10);
                const approvalKey = `${cascadeId}-${trajectoryId}-${stepIndex}`;

                if (!window.approvedNetworkSteps.has(approvalKey)) {
                    window.approvedNetworkSteps.add(approvalKey);
                    console.log(`🚀 [Shadow Stream] Auto-approving BACKGROUND permission:
  - Conversation: ${cascadeId.substring(0, 12)}...
  - Trajectory: ${trajectoryId.substring(0, 12)}...
  - Step: ${stepIndex}`);
                    autoApproveViaNetwork(cascadeId, trajectoryId, stepIndex);
                }
            }
        },

        /** Ensure shadow streams exist for top N background conversations, and reconnect dropped ones */
        ensureBackgroundStreams() {
            const topConvs = this.getTopBackgroundConversations(MAX_SHADOW_STREAMS);
            for (const convId of topConvs) {
                if (!this.activeStreams[convId]) {
                    this.createShadowStream(convId);
                }
            }
        },

        scanDOMForConversations() {
            try {
                const links = Array.from(document.querySelectorAll('a'));
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/\/c\/([a-f0-9-]{36})/);
                    if (match) this.registerConversation(match[1]);
                }

                const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[4a-f0-9]{4}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i;
                const elements = document.querySelectorAll('[data-id], [id]');
                for (const el of elements) {
                    const dataId = el.getAttribute('data-id') || '';
                    if (uuidRegex.test(dataId)) {
                        this.registerConversation(dataId.match(uuidRegex)[0]);
                        continue;
                    }
                    const id = el.getAttribute('id') || '';
                    if (uuidRegex.test(id)) {
                        this.registerConversation(id.match(uuidRegex)[0]);
                    }
                }

                const pathMatch = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
                if (pathMatch) this.setActiveConversation(pathMatch[1]);
            } catch (e) {}
        }
    };

    // =========================================================================
    // Helper: encode JSON to gRPC-web frame (5-byte header + JSON body)
    // =========================================================================
    function encodeGrpcWebPayload(jsonStr) {
        const encoder = new TextEncoder();
        const jsonBytes = encoder.encode(jsonStr);
        const len = jsonBytes.length;
        const payloadBytes = new Uint8Array(5 + len);
        payloadBytes[0] = 0;
        payloadBytes[1] = (len >> 24) & 0xFF;
        payloadBytes[2] = (len >> 16) & 0xFF;
        payloadBytes[3] = (len >> 8) & 0xFF;
        payloadBytes[4] = len & 0xFF;
        payloadBytes.set(jsonBytes, 5);
        return payloadBytes;
    }

    // =========================================================================
    // Direct network approval sender
    // =========================================================================
    function autoApproveViaNetwork(cascadeId, trajectoryId, stepIndex) {
        if (!cascadeId) return;
        if (!ShadowStreamManager.checkSettings()) {
            console.log('[Auto-Submit Network] Disabled. Skipping.');
            return;
        }

        try {
            const payloadObj = {
                cascadeId: cascadeId,
                interaction: {
                    trajectoryId: trajectoryId,
                    stepIndex: stepIndex,
                    permission: { allow: true }
                }
            };
            const jsonStr = JSON.stringify(payloadObj);
            const encodedPayload = encodeGrpcWebPayload(jsonStr);
            const approveUrl = '/exa.language_server_pb.LanguageServerService/HandleCascadeUserInteraction';
            console.log(`[Auto-Submit Network] Sending approval: Cascade=${cascadeId.substring(0, 8)}..., Step=${stepIndex}`);

            originalFetchRef(approveUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/grpc-web+json',
                    'accept': 'application/grpc-web+json'
                },
                body: encodedPayload
            })
            .then(res => res.text())
            .then(() => console.log('[Auto-Submit Network] Approval acknowledged!'))
            .catch(err => console.error('[Auto-Submit Network] Approval POST failed:', err));
        } catch (err) {
            console.error('[Auto-Submit Network] Failed to compile approval:', err);
        }
    }

    // =========================================================================
    // Network Interception Hooks (gRPC-Web Stream Hook with Frame Parser)
    // =========================================================================
    const originalFetchRef = window.fetch;

    try {
        console.log('[Auto-Submit] Installing gRPC-web network interceptor hooks...');

        window.fetch = async function(resource, init) {
            const url = typeof resource === 'string' ? resource : (resource.url || '');

            if (url.includes('/StreamAgentStateUpdates')) {
                let cascadeId = null;
                try {
                    let reqText = '';
                    if (init && init.body) {
                        if (init.body instanceof Uint8Array || init.body instanceof ArrayBuffer) {
                            reqText = new TextDecoder().decode(init.body);
                        } else if (typeof init.body === 'string') {
                            reqText = init.body;
                        }
                    }
                    const convMatch = reqText.match(/"conversationId":"([^"]+)"/);
                    if (convMatch) {
                        cascadeId = convMatch[1];
                        ShadowStreamManager.registerConversation(cascadeId);
                        ShadowStreamManager.setActiveConversation(cascadeId);
                        console.log(`[Auto-Submit Network] Frontend stream opened for: ${cascadeId.substring(0, 12)}...`);
                    }
                } catch (e) {
                    console.error('[Auto-Submit Network] Failed to parse request body:', e);
                }

                const response = await originalFetchRef.apply(this, arguments);
                if (!response.ok || !response.body) return response;

                const originalBody = response.body;
                const activeCascadeId = cascadeId;
                const frameParser = new GrpcFrameParser();

                const modifiedStream = new ReadableStream({
                    async start(controller) {
                        const reader = originalBody.getReader();
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) { controller.close(); break; }

                                try {
                                    frameParser.appendChunk(value);
                                    const frames = frameParser.extractFrames();
                                    for (const frame of frames) {
                                        const frameStr = JSON.stringify(frame);
                                        if (frameStr.includes('trajectoryId') && frameStr.includes('stepIndex')) {
                                            if (frameStr.includes('permission') || frameStr.includes('WAITING_FOR_USER') || frameStr.includes('askPermission')) {
                                                const trajMatch = frameStr.match(/"trajectoryId":"([^"]+)"/);
                                                const stepMatch = frameStr.match(/"stepIndex":(\d+)/);
                                                if (trajMatch && stepMatch) {
                                                    const trajectoryId = trajMatch[1];
                                                    const stepIndex = parseInt(stepMatch[1], 10);
                                                    const approvalKey = `${activeCascadeId}-${trajectoryId}-${stepIndex}`;
                                                    if (!window.approvedNetworkSteps.has(approvalKey)) {
                                                        window.approvedNetworkSteps.add(approvalKey);
                                                        console.log(`🚀 [Auto-Submit Network] Auto-approved ACTIVE permission:
  - Conversation: ${activeCascadeId}
  - Trajectory: ${trajectoryId}
  - Step Index: ${stepIndex}`);
                                                        autoApproveViaNetwork(activeCascadeId, trajectoryId, stepIndex);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (chunkErr) {}

                                controller.enqueue(value);
                            }
                        } catch (streamErr) {
                            controller.error(streamErr);
                        }
                    }
                });

                return new Response(modifiedStream, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            }

            return originalFetchRef.apply(this, arguments);
        };

        console.log('[Auto-Submit] gRPC-web interceptor hooks installed.');
    } catch (e) {
        console.error('[Auto-Submit] Failed to install network hooks:', e);
    }

    // =========================================================================
    // DOM-based Auto-Submit & Retry Limiter
    // =========================================================================
    function init() {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity', 'autosubmit.json');

        console.log('[Auto-Submit] Preload patch DOM listener initialized.');

        // Periodically scan DOM for conversations and reconnect dead shadow streams
        setInterval(() => ShadowStreamManager.scanDOMForConversations(), 5000);
        // Also periodically ensure background streams are alive (reconnection)
        setInterval(() => ShadowStreamManager.ensureBackgroundStreams(), 10000);
        // Initial scan
        setTimeout(() => ShadowStreamManager.scanDOMForConversations(), 2000);

        // Watch for URL changes
        let lastPath = window.location.pathname;
        setInterval(() => {
            const currentPath = window.location.pathname;
            if (currentPath !== lastPath) {
                lastPath = currentPath;
                const pathMatch = currentPath.match(/\/c\/([a-f0-9-]{36})/);
                if (pathMatch) ShadowStreamManager.setActiveConversation(pathMatch[1]);
            }
        }, 500);

        /** Get current conversation ID from URL */
        function getCurrentConversationId() {
            const m = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
            return m ? m[1] : 'unknown';
        }

        function checkAndSubmit() {
            let autoSubmitEnabled = true;
            try {
                if (fs.existsSync(settingsPath)) {
                    const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    autoSubmitEnabled = config.enabled !== false;
                }
            } catch (e) {
                console.error('[Auto-Submit] Failed to read settings file:', e);
            }
            if (!autoSubmitEnabled) return;

            const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span, a'));

            // 1. Auto-click Review buttons
            const reviewButtons = allElements.filter(el => {
                const text = (el.textContent || '').trim().toLowerCase();
                return text === 'review' || text === 'xem xét' || text === 'xem lại' || text === 'xem';
            });
            for (const btn of reviewButtons) {
                console.log('[Auto-Submit DOM] Auto-clicking Review button...');
                btn.click();
            }

            const bodyText = document.body ? (document.body.textContent || '') : '';

            // 2. Permission prompt handling
            const isPermissionPrompt = bodyText.includes('Allow running this command?') ||
                                     bodyText.includes('Allow read access to this path?') ||
                                     bodyText.includes('Allow write access to this path?') ||
                                     bodyText.includes('Allow read/write access to this path?') ||
                                     bodyText.includes('Allow filesystem access?') ||
                                     bodyText.includes('access to this path?') ||
                                     bodyText.includes('Allow reading this URL?') ||
                                     bodyText.includes('Allow executing this URL?') ||
                                     bodyText.includes('reading this URL?') ||
                                     bodyText.includes('executing this URL?') ||
                                     bodyText.includes('Allow using this MCP tool?') ||
                                     bodyText.includes('using this MCP tool?') ||
                                     bodyText.includes('Allow using this MCP server?') ||
                                     bodyText.includes('using this MCP server?') ||
                                     bodyText.includes('Permission Request') ||
                                     bodyText.includes('Yêu cầu cấp quyền');

            if (isPermissionPrompt) {
                // Shield UI: move permission dialog off-screen
                const modalDivs = Array.from(document.querySelectorAll('div[role="dialog"], div[class*="modal"], div[class*="dialog"], div[class*="Overlay"], div[class*="Backdrop"]'));
                for (const div of modalDivs) {
                    const text = div.textContent || '';
                    if (text.includes('Allow') || text.includes('permission') || text.includes('Yes, allow') || text.includes('đồng ý') || text.includes('cấp quyền')) {
                        div.style.position = 'absolute';
                        div.style.left = '-9999px';
                        div.style.opacity = '0';
                    }
                }

                // Click "Yes, allow this time"
                const options = Array.from(document.querySelectorAll('div, li, span, label, button'));
                const firstOption = options.find(el => {
                    const text = el.textContent || '';
                    return text.includes('Yes, allow this time') || text.includes('Đồng ý lần này') || text.includes('Yes, allow') || text.includes('Cho phép');
                });
                if (firstOption) firstOption.click();

                // Click Submit / Approve / Confirm
                const submitButton = allElements.find(el => {
                    const text = (el.textContent || '').trim().toLowerCase();
                    return text === 'submit' || text === 'gửi' || text === 'đồng ý' || text === 'allow' || text === 'approve' || text === 'confirm' || text === 'chấp nhận';
                });
                if (submitButton) {
                    console.log('[Auto-Submit DOM] Auto-approving permission dialog...');
                    submitButton.click();
                }
            }

            // 3. Auto-Retry with LIMIT (max 10 per session, then stop)
            const hasError = bodyText.includes('Agent terminated due to error') ||
                           bodyText.includes('Lỗi hệ thống') ||
                           bodyText.includes('bị dừng') ||
                           bodyText.includes('An error occurred');

            if (hasError) {
                const convId = getCurrentConversationId();
                const currentCount = window.retryCounters[convId] || 0;

                if (currentCount >= MAX_RETRY_PER_SESSION) {
                    console.warn(`⛔ [Auto-Retry] Session ${convId.substring(0, 12)}... reached ${MAX_RETRY_PER_SESSION} retries. STOPPING auto-retry.`);
                    return;
                }

                const retryButton = allElements.find(el => {
                    const text = (el.textContent || '').trim().toLowerCase();
                    return text === 'retry' || text === 'thử lại' || text === 'chạy lại';
                });

                if (retryButton) {
                    window.retryCounters[convId] = currentCount + 1;
                    console.log(`🔄 [Auto-Retry] Retry #${window.retryCounters[convId]}/${MAX_RETRY_PER_SESSION} for session ${convId.substring(0, 12)}...`);
                    retryButton.click();
                }
            } else {
                // Reset retry counter when session is running fine (no error visible)
                const convId = getCurrentConversationId();
                if (window.retryCounters[convId] && window.retryCounters[convId] > 0) {
                    console.log(`✅ [Auto-Retry] Session ${convId.substring(0, 12)}... recovered. Resetting retry counter.`);
                    window.retryCounters[convId] = 0;
                }
            }
        }

        if (document.documentElement) {
            let debounceTimer = null;
            const observer = new MutationObserver(() => {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(checkAndSubmit, 100);
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true
            });

            setInterval(checkAndSubmit, 300);
            checkAndSubmit();
        }
    }

    if (document.documentElement) {
        try { init(); } catch (err) { console.error(err); }
    } else {
        const interval = setInterval(() => {
            if (document.documentElement) {
                clearInterval(interval);
                try { init(); } catch (err) { console.error(err); }
            }
        }, 50);
    }
})();
