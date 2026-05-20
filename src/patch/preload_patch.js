// Auto-submit Command Execution Requests (Ultimate Network & DOM Hybrid Edition)
(() => {
    console.log('[Auto-Submit] Preload patch loading...');

    // Memory cache to prevent duplicate approvals
    if (!window.approvedNetworkSteps) {
        window.approvedNetworkSteps = new Set();
    }

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
        if (!cascadeId) {
            console.error('[Auto-Submit Network] Cannot approve: cascadeId is null');
            return;
        }

        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity', 'autosubmit.json');
        let autoSubmitEnabled = true;
        try {
            if (fs.existsSync(settingsPath)) {
                const config = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                autoSubmitEnabled = config.enabled !== false;
            }
        } catch (e) {}

        if (!autoSubmitEnabled) {
            console.log('[Auto-Submit Network] Auto-Submit is disabled in settings. Skipping approval.');
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
            console.log(`[Auto-Submit Network] Sending direct gRPC-web approval request for Cascade: ${cascadeId}, Step: ${stepIndex}...`);
            
            fetch(approveUrl, {
                method: 'POST',
                headers: {
                    'content-type': 'application/grpc-web+json',
                    'accept': 'application/grpc-web+json'
                },
                body: encodedPayload
            })
            .then(res => res.text())
            .then(resText => {
                console.log('[Auto-Submit Network] Direct gRPC-web approval acknowledged by Language Server!');
            })
            .catch(err => {
                console.error('[Auto-Submit Network] gRPC-web approval POST failed:', err);
            });
        } catch (err) {
            console.error('[Auto-Submit Network] Failed to compile approval package:', err);
        }
    }

    // ---------------------------------------------------------------------------
    // Synchronous Network Interception Hooks (Direct gRPC-Web Stream Hook)
    // ---------------------------------------------------------------------------
    try {
        console.log('[Auto-Submit] Installing gRPC-web network interceptor hooks...');

        // Hook window.fetch
        const originalFetch = window.fetch;
        window.fetch = async function(resource, init) {
            const url = typeof resource === 'string' ? resource : (resource.url || '');
            
            // Intercept StreamAgentStateUpdates to capture permission requests in real-time
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
                        console.log(`[Auto-Submit Network] Hooked state update stream for Conversation: ${cascadeId}`);
                    }
                } catch (e) {
                    console.error('[Auto-Submit Network] Failed to parse request body:', e);
                }

                const response = await originalFetch.apply(this, arguments);
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
                                    
                                    // Parse stream chunks for permission triggers
                                    if (text.includes('"trajectoryId"') && text.includes('"stepIndex"')) {
                                        const trajMatches = [...text.matchAll(/"trajectoryId":"([^"]+)"/g)];
                                        const stepMatches = [...text.matchAll(/"stepIndex":(\d+)/g)];
                                        
                                        if (trajMatches.length > 0 && stepMatches.length > 0) {
                                            const trajectoryId = trajMatches[0][1];
                                            const stepIndex = parseInt(stepMatches[0][1], 10);
                                            
                                            // Check if this chunk is requesting permissions
                                            if (text.includes('permission') || text.includes('allow') || text.includes('WAITING_FOR_USER_PERMISSION')) {
                                                const approvalKey = `${activeCascadeId}-${trajectoryId}-${stepIndex}`;
                                                
                                                if (!window.approvedNetworkSteps.has(approvalKey)) {
                                                    window.approvedNetworkSteps.add(approvalKey);
                                                    
                                                    console.log(`🚀 [Auto-Submit Network] Automatically approved background permission request:
  - Conversation (Cascade): ${activeCascadeId}
  - Trajectory: ${trajectoryId}
  - Step Index: ${stepIndex}`);
                                                    
                                                    autoApproveViaNetwork(activeCascadeId, trajectoryId, stepIndex);
                                                }
                                            }
                                        }
                                    }
                                } catch (chunkErr) {
                                    console.error('[Auto-Submit Network] Error processing chunk:', chunkErr);
                                }
                                
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
            
            return originalFetch.apply(this, arguments);
        };

        // Hook window.XMLHttpRequest (XHR) for diagnostics
        const originalOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
            return originalOpen.apply(this, [method, url, ...args]);
        };

        // Hook window.WebSocket for diagnostics
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function(...args) {
            return new OriginalWebSocket(...args);
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

        let lastUserActivity = Date.now();
        window.addEventListener('mousemove', () => { lastUserActivity = Date.now(); });
        window.addEventListener('keydown', () => { lastUserActivity = Date.now(); });
        window.addEventListener('mousedown', () => { lastUserActivity = Date.now(); });
        window.addEventListener('scroll', () => { lastUserActivity = Date.now(); });

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

        function checkBackgroundSessions() {
            const hasFocus = document.hasFocus();
            const timeSinceLastActivity = Date.now() - lastUserActivity;

            if (hasFocus && timeSinceLastActivity < 5000) {
                return;
            }

            const sessionLinks = Array.from(document.querySelectorAll('a')).filter(a => {
                const href = a.getAttribute('href') || '';
                return href.includes('/c/') && !href.includes('/c/new');
            });

            if (sessionLinks.length <= 1) {
                return;
            }

            const currentPath = window.location.pathname;
            const activeLink = sessionLinks.find(a => a.getAttribute('href') === currentPath);
            const backgroundLinks = sessionLinks.filter(a => a.getAttribute('href') !== currentPath);

            if (backgroundLinks.length === 0) {
                return;
            }

            if (!window.nextBackgroundIndex) {
                window.nextBackgroundIndex = 0;
            }
            const targetIndex = window.nextBackgroundIndex % backgroundLinks.length;
            const targetLink = backgroundLinks[targetIndex];
            window.nextBackgroundIndex++;

            const targetHref = targetLink.getAttribute('href');
            console.log('[Auto-Submit DOM Fallback] Out-of-focus or Idle scanning background session:', targetHref);

            targetLink.click();

            setTimeout(() => {
                if (activeLink) {
                    activeLink.click();
                }
            }, 60);
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
            setInterval(checkBackgroundSessions, 3000);
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
