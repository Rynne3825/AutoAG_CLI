// Auto-submit Command Execution Requests (Ultimate Network & DOM Hybrid Edition v2)
// Shadow Stream Monitor: Maintains independent background streams for ALL sessions
(() => {
    console.log('[Auto-Submit] Preload patch loading...');

    // Memory cache to prevent duplicate approvals
    if (!window.approvedNetworkSteps) {
        window.approvedNetworkSteps = new Set();
    }

    // =========================================================================
    // Shadow Stream Manager - Maintains background streams for ALL conversations
    // =========================================================================
    const ShadowStreamManager = {
        activeStreams: {},      // conversationId -> AbortController
        knownConversations: new Set(),
        currentActiveConv: null,
        subscriberCounter: 0,
        isEnabled: true,

        generateSubscriberId() {
            // Simple UUID-like generator
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
            if (!conversationId || this.knownConversations.has(conversationId)) return;
            this.knownConversations.add(conversationId);
            console.log(`[Shadow Stream] Registered conversation: ${conversationId}`);
            this.ensureBackgroundStreams();
        },

        setActiveConversation(conversationId) {
            if (this.currentActiveConv === conversationId) return;
            const oldActive = this.currentActiveConv;
            this.currentActiveConv = conversationId;
            console.log(`[Shadow Stream] Active conversation changed: ${oldActive?.substring(0, 8)}... -> ${conversationId?.substring(0, 8)}...`);
            // When active conversation changes, the frontend creates its own stream.
            // We need to create shadow streams for conversations that are NO LONGER active.
            if (oldActive && oldActive !== conversationId) {
                // Give the frontend a moment to close its own stream, then create our shadow
                setTimeout(() => this.createShadowStream(oldActive), 1000);
            }
            // Kill shadow stream for the newly active conversation (frontend handles it)
            this.killShadowStream(conversationId);
        },

        killShadowStream(conversationId) {
            if (this.activeStreams[conversationId]) {
                console.log(`[Shadow Stream] Killing shadow stream for ${conversationId.substring(0, 8)}... (frontend took over)`);
                this.activeStreams[conversationId].abort();
                delete this.activeStreams[conversationId];
            }
        },

        async createShadowStream(conversationId) {
            if (!this.checkSettings()) return;
            if (this.activeStreams[conversationId]) return; // Already has a shadow stream
            if (conversationId === this.currentActiveConv) return; // Frontend handles active conv

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

            console.log(`🔌 [Shadow Stream] Opening background stream for conversation ${conversationId.substring(0, 8)}...`);

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
                    console.warn(`[Shadow Stream] Failed to open stream for ${conversationId.substring(0, 8)}...: status ${response.status}`);
                    delete this.activeStreams[conversationId];
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        console.log(`[Shadow Stream] Stream ended for ${conversationId.substring(0, 8)}...`);
                        break;
                    }

                    try {
                        const text = decoder.decode(value, { stream: true });
                        this.processStreamChunk(text, conversationId);
                    } catch (chunkErr) {
                        // Silently continue on chunk parse errors
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log(`[Shadow Stream] Stream aborted for ${conversationId.substring(0, 8)}...`);
                } else {
                    console.warn(`[Shadow Stream] Stream error for ${conversationId.substring(0, 8)}...:`, err.message);
                }
            } finally {
                delete this.activeStreams[conversationId];
            }
        },

        processStreamChunk(text, cascadeId) {
            if (!text.includes('"trajectoryId"') || !text.includes('"stepIndex"')) return;

            const trajMatches = [...text.matchAll(/"trajectoryId":"([^"]+)"/g)];
            const stepMatches = [...text.matchAll(/"stepIndex":(\d+)/g)];

            if (trajMatches.length === 0 || stepMatches.length === 0) return;

            // Check for permission-related content
            if (text.includes('permission') || text.includes('allow') || text.includes('WAITING_FOR_USER_PERMISSION')) {
                const trajectoryId = trajMatches[0][1];
                const stepIndex = parseInt(stepMatches[0][1], 10);
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

        ensureBackgroundStreams() {
            for (const convId of this.knownConversations) {
                if (convId !== this.currentActiveConv && !this.activeStreams[convId]) {
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
                    if (match) {
                        this.registerConversation(match[1]);
                    }
                }

                // Detect currently active conversation from URL
                const pathMatch = window.location.pathname.match(/\/c\/([a-f0-9-]{36})/);
                if (pathMatch) {
                    this.setActiveConversation(pathMatch[1]);
                }
            } catch (e) {}
        }
    };

    // Helper to encode JSON to gRPC-web frame format (5-byte header + JSON body)
    function encodeGrpcWebPayload(jsonStr) {
        const encoder = new TextEncoder();
        const jsonBytes = encoder.encode(jsonStr);
        const len = jsonBytes.length;
        
        const payloadBytes = new Uint8Array(5 + len);
        payloadBytes[0] = 0; // Flags = 0 (Normal data frame)
        payloadBytes[1] = (len >> 24) & 0xFF;
        payloadBytes[2] = (len >> 16) & 0xFF;
        payloadBytes[3] = (len >> 8) & 0xFF;
        payloadBytes[4] = len & 0xFF;
        payloadBytes.set(jsonBytes, 5);
        
        return payloadBytes;
    }

    // Direct network approval sender
    function autoApproveViaNetwork(cascadeId, trajectoryId, stepIndex) {
        if (!cascadeId) return;

        if (!ShadowStreamManager.checkSettings()) {
            console.log('[Auto-Submit Network] Disabled in settings. Skipping.');
            return;
        }

        try {
            const payloadObj = {
                cascadeId: cascadeId,
                interaction: {
                    trajectoryId: trajectoryId,
                    stepIndex: stepIndex,
                    permission: {
                        allow: true
                    }
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
            .then(() => {
                console.log('[Auto-Submit Network] Approval acknowledged!');
            })
            .catch(err => {
                console.error('[Auto-Submit Network] Approval POST failed:', err);
            });
        } catch (err) {
            console.error('[Auto-Submit Network] Failed to compile approval:', err);
        }
    }

    // ---------------------------------------------------------------------------
    // Network Interception Hooks (gRPC-Web Stream Hook)
    // ---------------------------------------------------------------------------
    // Store original fetch reference BEFORE hooking (shadow streams use this)
    const originalFetchRef = window.fetch;

    try {
        console.log('[Auto-Submit] Installing gRPC-web network interceptor hooks...');

        // Hook window.fetch
        window.fetch = async function(resource, init) {
            const url = typeof resource === 'string' ? resource : (resource.url || '');
            
            // Intercept StreamAgentStateUpdates to capture permission requests
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
                        // Register this conversation and mark it as active (frontend is opening stream for it)
                        ShadowStreamManager.registerConversation(cascadeId);
                        ShadowStreamManager.setActiveConversation(cascadeId);
                        console.log(`[Auto-Submit Network] Frontend stream opened for: ${cascadeId.substring(0, 12)}...`);
                    }
                } catch (e) {
                    console.error('[Auto-Submit Network] Failed to parse request body:', e);
                }

                const response = await originalFetchRef.apply(this, arguments);
                if (!response.ok || !response.body) {
                    return response;
                }

                const originalBody = response.body;
                const activeCascadeId = cascadeId;

                // Wrap response body to inspect chunks dynamically
                const modifiedStream = new ReadableStream({
                    async start(controller) {
                        const reader = originalBody.getReader();
                        const decoder = new TextDecoder();
                        
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) {
                                    controller.close();
                                    break;
                                }
                                
                                try {
                                    const text = decoder.decode(value, { stream: true });
                                    
                                    if (text.includes('"trajectoryId"') && text.includes('"stepIndex"')) {
                                        const trajMatches = [...text.matchAll(/"trajectoryId":"([^"]+)"/g)];
                                        const stepMatches = [...text.matchAll(/"stepIndex":(\d+)/g)];
                                        
                                        if (trajMatches.length > 0 && stepMatches.length > 0) {
                                            const trajectoryId = trajMatches[0][1];
                                            const stepIndex = parseInt(stepMatches[0][1], 10);
                                            
                                            if (text.includes('permission') || text.includes('allow') || text.includes('WAITING_FOR_USER_PERMISSION')) {
                                                const approvalKey = `${activeCascadeId}-${trajectoryId}-${stepIndex}`;
                                                
                                                if (!window.approvedNetworkSteps.has(approvalKey)) {
                                                    window.approvedNetworkSteps.add(approvalKey);
                                                    
                                                    console.log(`🚀 [Auto-Submit Network] Auto-approved ACTIVE session permission:
  - Conversation: ${activeCascadeId}
  - Trajectory: ${trajectoryId}
  - Step Index: ${stepIndex}`);
                                                    
                                                    autoApproveViaNetwork(activeCascadeId, trajectoryId, stepIndex);
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

        console.log('[Auto-Submit] gRPC-web network interceptor hooks installed successfully.');
    } catch (e) {
        console.error('[Auto-Submit] Failed to install network hooks:', e);
    }

    // ---------------------------------------------------------------------------
    // DOM-based Auto-Submit & Smart Background Rotator Logic (Fallback Protection)
    // ---------------------------------------------------------------------------
    function init() {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity', 'autosubmit.json');

        console.log('[Auto-Submit] Preload patch DOM listener initialized.');

        // Periodically scan DOM for conversation links and create shadow streams
        setInterval(() => {
            ShadowStreamManager.scanDOMForConversations();
        }, 5000);
        // Initial scan
        setTimeout(() => ShadowStreamManager.scanDOMForConversations(), 2000);

        // Watch for URL changes (user switching sessions via clicks)
        let lastPath = window.location.pathname;
        setInterval(() => {
            const currentPath = window.location.pathname;
            if (currentPath !== lastPath) {
                lastPath = currentPath;
                const pathMatch = currentPath.match(/\/c\/([a-f0-9-]{36})/);
                if (pathMatch) {
                    ShadowStreamManager.setActiveConversation(pathMatch[1]);
                }
            }
        }, 500);

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

            if (!autoSubmitEnabled) {
                return;
            }

            const bodyText = document.body ? (document.body.textContent || '') : '';

            if (bodyText.includes('Allow running this command?') || 
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
                bodyText.includes('using this MCP server?')) {
                
                const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span, a'));
                const submitButton = allElements.find(el => {
                    const text = (el.textContent || '').trim();
                    return text === 'Submit' || (el.tagName === 'BUTTON' && text.includes('Submit'));
                });

                if (submitButton) {
                    const options = Array.from(document.querySelectorAll('div, li, span, label, button'));
                    const firstOption = options.find(el => el.textContent && el.textContent.includes('Yes, allow this time'));
                    if (firstOption) {
                        firstOption.click();
                    }
                    
                    console.log('[Auto-Submit DOM Fallback] Automatically accepting permission request.');
                    submitButton.click();
                }
            }

            if (bodyText.includes('Agent terminated due to error')) {
                const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span, a'));
                const retryButton = allElements.find(el => {
                    const text = (el.textContent || '').trim();
                    return text === 'Retry' || (el.tagName === 'BUTTON' && text.includes('Retry'));
                });
                if (retryButton) {
                    console.log('[Auto-Submit DOM Fallback] Automatically retrying terminated agent.');
                    retryButton.click();
                }
            }
        }

        if (document.documentElement) {
            let debounceTimer = null;
            const observer = new MutationObserver(() => {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
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
