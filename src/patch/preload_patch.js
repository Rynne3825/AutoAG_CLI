// Auto-submit Command Execution Requests (Lean Stable Edition - High Performance)
(() => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const logPath = 'd:\\AutoAG_CLI\\autosubmit.log';
    const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity', 'autosubmit.json');

    // Async logger queue to avoid blocking main thread with sync disk writes
    let logQueue = [];
    let isWritingLog = false;

    function logToFile(message) {
        console.log(`[AutoSubmit] ${message}`);
        const logMsg = `[${new Date().toISOString()}] ${message}\n`;
        logQueue.push(logMsg);
        processLogQueue();
    }

    function processLogQueue() {
        if (isWritingLog || logQueue.length === 0) return;
        isWritingLog = true;
        const msg = logQueue.shift();
        fs.appendFile(logPath, msg, 'utf8', (err) => {
            isWritingLog = false;
            processLogQueue();
        });
    }

    try {
        if (!window.hasInitializedLeanAutoSubmitLog) {
            window.hasInitializedLeanAutoSubmitLog = true;
            fs.appendFile(logPath, `\n=== [Session Started: ${window.location.href}] ===\n`, 'utf8', () => { });
        }
    } catch (_) { }

    let isStartupPhase = true;

    let cachedEnabled = true;
    let isReadingSettings = false;

    function loadSettingsAsync() {
        if (isReadingSettings) return;
        isReadingSettings = true;
        fs.readFile(settingsPath, 'utf8', (err, data) => {
            isReadingSettings = false;
            if (err) {
                if (err.code !== 'ENOENT') {
                    logToFile(`[Settings] Failed to read autosubmit.json: ${err.message}`);
                }
                return;
            }
            try {
                const parsed = JSON.parse(data);
                const newEnabled = parsed.enabled !== false;
                if (newEnabled !== cachedEnabled) {
                    cachedEnabled = newEnabled;
                    logToFile(`[Settings] Updated enabled status: ${cachedEnabled}`);
                    if (cachedEnabled) {
                        manageShadowStreams();
                    } else {
                        // Stop all shadow streams
                        for (const id of activeShadowStreams.keys()) {
                            stopShadowStream(id);
                        }
                    }
                }
            } catch (ex) {
                logToFile(`[Settings] Error parsing autosubmit.json: ${ex.message}`);
            }
        });
    }

    // Load settings initially
    loadSettingsAsync();

    function isEnabled() {
        return cachedEnabled;
    }

    // =========================================================================
    // SECTION 1: Direct Network Interception & Direct Network Approver Engine
    // =========================================================================

    let lastBaseUrl = '';
    let lastHeaders = null;
    let activeForegroundConversationId = null;
    const discoveredConversations = new Set();
    const activeShadowStreams = new Map(); // conversationId -> AbortController
    const approvedSteps = new Set(); // set of "cascadeId:trajectoryId:stepIndex"

    const defaultHeaders = {
        'accept': '*/*',
        'content-type': 'application/grpc-web+json',
        'x-grpc-web': '1',
        'x-user-agent': 'CONNECT_ES_USER_AGENT'
    };

    // Main World Injection script to hook fetch/XHR inside context-isolated pages
    const mainWorldCode = `
(() => {
    const defaultHeaders = {
        'accept': '*/*',
        'content-type': 'application/grpc-web+json',
        'x-grpc-web': '1',
        'x-user-agent': 'CONNECT_ES_USER_AGENT'
    };

    function notifyPreload(type, data) {
        window.dispatchEvent(new CustomEvent('autoag-main-world-event', {
            detail: { type, data }
        }));
    }

    try {
        if (window.__APP_CONFIG__ && window.__APP_CONFIG__.csrfToken) {
            notifyPreload('csrf-token', {
                token: window.__APP_CONFIG__.csrfToken,
                baseUrl: window.location.origin
            });
        }
    } catch (_) {}

    function captureStreamDetails(url, headers, bodyText) {
        try {
            if (url.includes('/HandleCascadeUserInteraction')) {
                return;
            }
            if (bodyText && bodyText.includes('autoag_shadow_')) {
                return;
            }
            const parsedUrl = new URL(url, window.location.origin);
            const baseUrl = parsedUrl.origin;
            let token = null;

            if (headers) {
                const keys = Object.keys(headers);
                for (const key of keys) {
                    if (key.toLowerCase() === 'x-codeium-csrf-token') {
                        token = headers[key];
                        break;
                    }
                }
            }

            if (token) {
                notifyPreload('csrf-token', { token, baseUrl });
            }

            if (bodyText) {
                const m = bodyText.match(/"conversationId"\\s*:\\s*"([^"]+)"/);
                if (m && m[1]) {
                    notifyPreload('conversation-discovered', { conversationId: m[1] });
                }
            }
        } catch (_) {}
    }

    if (window.fetch && !window.fetch.isHookedByAutoAG) {
        const originalFetch = window.fetch;
        window.fetch = async function(resource, init) {
            const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
            if (url.includes('autoag_shadow=true') || url.includes('autoag_approve=true') || url.includes('/HandleCascadeUserInteraction')) {
                return originalFetch.apply(this, arguments);
            }
            
            if (url.includes('/exa.language_server_pb.LanguageServerService/')) {
                let bodyText = '';
                const bodySource = (init && init.body) || (resource && resource.body);
                if (bodySource) {
                    if (typeof bodySource === 'string') {
                        bodyText = bodySource;
                    } else {
                        try {
                            bodyText = new TextDecoder('utf-8').decode(bodySource);
                        } catch (_) {}
                    }
                }

                if (bodyText && bodyText.includes('autoag_shadow_')) {
                    return originalFetch.apply(this, arguments);
                }

                if (init && (init.isShadowStream || init.isAutoAG)) {
                    return originalFetch.apply(this, arguments);
                }

                const capturedHeaders = {};
                const processHeaderObj = (h) => {
                    if (!h) return;
                    if (typeof h.forEach === 'function') {
                        h.forEach((val, key) => {
                            capturedHeaders[key.toLowerCase()] = val;
                        });
                    } else if (typeof h === 'object') {
                        for (const key in h) {
                            capturedHeaders[key.toLowerCase()] = h[key];
                        }
                    }
                };

                if (resource && resource.headers) {
                    processHeaderObj(resource.headers);
                }
                if (init && init.headers) {
                    processHeaderObj(init.headers);
                }

                captureStreamDetails(url, capturedHeaders, bodyText);
            }

            return originalFetch.apply(this, arguments);
        };
        window.fetch.isHookedByAutoAG = true;
    }

    if (window.XMLHttpRequest && !window.XMLHttpRequest.isHookedByAutoAG) {
        const originalOpen = window.XMLHttpRequest.prototype.open;
        const originalSend = window.XMLHttpRequest.prototype.send;
        const originalSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader;

        window.XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            this._method = method;
            this._headers = {};
            return originalOpen.apply(this, arguments);
        };

        window.XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (this._headers) {
                this._headers[header.toLowerCase()] = value;
            }
            return originalSetRequestHeader.apply(this, arguments);
        };

        window.XMLHttpRequest.prototype.send = function(body) {
            const url = this._url || '';
            if (url.includes('/exa.language_server_pb.LanguageServerService/')) {
                let bodyText = '';
                if (body) {
                    if (typeof body === 'string') {
                        bodyText = body;
                    } else {
                        try {
                            bodyText = new TextDecoder('utf-8').decode(body);
                        } catch (_) {}
                    }
                }
                captureStreamDetails(url, this._headers, bodyText);
            }
            return originalSend.apply(this, arguments);
        };
        window.XMLHttpRequest.isHookedByAutoAG = true;
    }
})();
`;

    // Hook to receive messages from the main world context
    window.addEventListener('autoag-main-world-event', (event) => {
        try {
            const { type, data } = event.detail;
            if (type === 'csrf-token') {
                const { token, baseUrl } = data;
                if (token) {
                    if (!lastHeaders || lastHeaders['x-codeium-csrf-token'] !== token) {
                        lastHeaders = {
                            ...defaultHeaders,
                            'x-codeium-csrf-token': token
                        };
                        logToFile(`[Event] Received CSRF Token from main world: ${token}`);
                    }
                    if (baseUrl && baseUrl !== lastBaseUrl) {
                        lastBaseUrl = baseUrl;
                        logToFile(`[Event] Received Base URL from main world: ${lastBaseUrl}`);
                    }
                    registerSessionInCoverageFile(activeForegroundConversationId || 'global');
                    manageShadowStreams();
                }
            } else if (type === 'conversation-discovered') {
                const { conversationId } = data;
                if (conversationId) {
                    setActiveForegroundConversation(conversationId);
                    registerConversation(conversationId);
                }
            }
        } catch (err) {
            logToFile(`[Event] Error processing main world event: ${err.message}`);
        }
    });

    function injectMainWorldScript(doc) {
        try {
            if (!doc || doc.hasAutoAGMainWorldScriptInjected) return;

            const parent = doc.head || doc.documentElement;
            if (!parent) {
                setTimeout(() => injectMainWorldScript(doc), 10);
                return;
            }

            doc.hasAutoAGMainWorldScriptInjected = true;
            const script = doc.createElement('script');
            script.textContent = mainWorldCode;
            parent.appendChild(script);
            script.remove();
            logToFile(`[Inject] Main world script successfully injected into ${doc.location ? doc.location.href : 'document'}`);
        } catch (err) {
            logToFile(`[Inject] Failed to inject main world script: ${err.message}`);
        }
    }

    // Try to guess base URL on startup
    try {
        const parsedUrl = new URL(window.location.href);
        if (parsedUrl.protocol.startsWith('http') && parsedUrl.hostname === '127.0.0.1') {
            lastBaseUrl = parsedUrl.origin;
            logToFile(`[Init] Guessed Base URL: ${lastBaseUrl}`);
        }
    } catch (_) { }

    // Guess active conversation ID from URL parameters on startup
    try {
        const parsedUrl = new URL(window.location.href);
        const conversationId = parsedUrl.searchParams.get('conversationId');
        if (conversationId) {
            logToFile(`[Init] Found conversationId in URL: ${conversationId}`);
            setActiveForegroundConversation(conversationId);
            registerConversation(conversationId);
        }
    } catch (_) { }

    function generateUUID() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // High performance non-blocking session synchronization
    // SỬA LỖI PING-PONG: Chỉ ghi nhận trạng thái hoạt động thực sự và tránh ghi đè chéo
    let isWritingCoverage = false;
    let writeQueue = [];
    let coverageWriteTimeout = null;
    let pendingCoverageIds = new Set();

    function registerSessionInCoverageFile(conversationId) {
        if (!conversationId || typeof conversationId !== 'string' || conversationId.length < 10) return;

        pendingCoverageIds.add(conversationId);

        if (coverageWriteTimeout) return;

        coverageWriteTimeout = setTimeout(() => {
            coverageWriteTimeout = null;
            const idsToProcess = Array.from(pendingCoverageIds);
            pendingCoverageIds.clear();

            writeQueue.push(...idsToProcess);
            processWriteQueue();
        }, 50); // Ghi file siêu tốc sau 50ms để chia sẻ ngay lập tức
    }

    function processWriteQueue() {
        if (isWritingCoverage || writeQueue.length === 0) return;

        isWritingCoverage = true;
        const currentConvId = writeQueue.shift();
        const coveragePath = 'd:\\AutoAG_CLI\\autosubmit_coverage.json';

        fs.readFile(coveragePath, 'utf8', (readErr, raw) => {
            let data = {
                generatedAt: new Date().toISOString(),
                trigger: 'client_registration',
                currentActiveConversation: activeForegroundConversationId || currentConvId,
                maxShadowStreams: 50,
                sessions: []
            };

            if (!readErr) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && Array.isArray(parsed.sessions)) {
                        data = parsed;
                    }
                } catch (_) { }
            }

            if (!data.sessions) data.sessions = [];
            let found = false;
            for (const s of data.sessions) {
                if (s.conversationId === currentConvId) {
                    found = true;
                    s.lastSeenAt = new Date().toISOString();
                    break;
                }
            }

            if (!found) {
                data.sessions.push({
                    conversationId: currentConvId,
                    registeredAt: new Date().toISOString(),
                    lastSeenAt: new Date().toISOString(),
                    coverageStatus: 'known',
                    coverageReason: 'moved_to_background_waiting_for_stream',
                    streamOpenAttempts: 0,
                    streamConnectCount: 0,
                    approvalCount: 0
                });
            }

            // CHỈ đặt currentActiveConversation khi cửa sổ này thực sự có tiêu điểm (focus)
            if (document.hasFocus() && activeForegroundConversationId) {
                data.currentActiveConversation = activeForegroundConversationId;
            }

            if (lastHeaders && lastHeaders['x-codeium-csrf-token']) {
                data.sharedCsrfToken = lastHeaders['x-codeium-csrf-token'];
            }
            if (lastBaseUrl) {
                data.sharedBaseUrl = lastBaseUrl;
            }

            data.generatedAt = new Date().toISOString();

            fs.writeFile(coveragePath, JSON.stringify(data, null, 2), 'utf8', (writeErr) => {
                isWritingCoverage = false;
                if (writeErr) {
                    logToFile(`[Sync] Failed to write session to coverage file: ${writeErr.message}`);
                    setTimeout(() => registerSessionInCoverageFile(currentConvId), 150);
                }
                processWriteQueue();
            });
        });
    }

    function registerConversation(id) {
        if (!id || typeof id !== 'string' || id.length < 10) return;

        if (discoveredConversations.has(id)) return;

        discoveredConversations.add(id);
        logToFile(`[Discovery] Discovered new conversation ID: ${id}`);

        registerSessionInCoverageFile(id);

        triggerShadowStreamIfNeeded(id);
    }

    function setActiveForegroundConversation(id) {
        if (!id || activeForegroundConversationId === id) return;
        activeForegroundConversationId = id;
        logToFile(`[Foreground] Active foreground conversation of this window: ${id}`);

        registerSessionInCoverageFile(id);

        manageShadowStreams();
    }

    function parseGrpcWebFrames(uint8Array) {
        let offset = 0;
        const frames = [];
        while (offset + 5 <= uint8Array.length) {
            const flag = uint8Array[offset];
            const length = (uint8Array[offset + 1] << 24) |
                (uint8Array[offset + 2] << 16) |
                (uint8Array[offset + 3] << 8) |
                uint8Array[offset + 4];
            if (offset + 5 + length <= uint8Array.length) {
                const dataBytes = uint8Array.slice(offset + 5, offset + 5 + length);
                const jsonText = new TextDecoder('utf-8').decode(dataBytes);
                try {
                    const parsed = JSON.parse(jsonText);
                    frames.push({ flag, data: parsed });

                    // Detailed log for frame parse success
                    const parsedStr = JSON.stringify(parsed);
                    if (parsedStr.includes("waiting") || parsedStr.includes("step") || parsedStr.includes("trajectory") || parsedStr.includes("cascade")) {
                        logToFile(`[gRPC] Parsed frame successfully (contains interesting keywords): ${parsedStr.slice(0, 2000)}`);
                    } else {
                        logToFile(`[gRPC] Parsed normal frame, keys: ${Object.keys(parsed).join(', ')}`);
                    }
                } catch (err) {
                    if (flag !== 128) {
                        logToFile(`[Shadow] JSON Parse failed for frame flag ${flag}: ${err.message}. Length: ${length}. Preview: ${jsonText.slice(0, 100)}`);
                    }
                }
                offset += 5 + length;
            } else {
                break; // Incomplete frame
            }
        }
        return { frames, remaining: uint8Array.slice(offset) };
    }

    function isWaitingStatus(s) {
        if (s === 9 || s === 1) return true;
        if (typeof s === 'string') {
            const upper = s.toUpperCase();
            return upper.includes('WAITING') || upper.includes('PENDING') || upper === '9' || upper === '1';
        }
        return false;
    }

    function scanStateUpdateForWaitingSteps(obj, foundCallback, currentCascadeId = null, currentTrajectoryId = null, visited = new Set()) {
        if (!obj || typeof obj !== 'object') return;
        if (visited.has(obj)) return;
        visited.add(obj);

        const cascadeId = obj.cascadeId || obj.cascade_id || obj.conversationId || obj.conversation_id || currentCascadeId;
        const trajectoryId = obj.trajectoryId || obj.trajectory_id || currentTrajectoryId;

        // Path 1: Check waitingSteps (could be waitingSteps or waiting_steps)
        const waitingSteps = obj.waitingSteps || obj.waiting_steps;
        if (Array.isArray(waitingSteps)) {
            logToFile(`[Sniffer] Found waitingSteps array of length ${waitingSteps.length}. cascadeId=${cascadeId}, trajectoryId=${trajectoryId}`);

            for (const ws of waitingSteps) {
                if (ws && typeof ws === 'object') {
                    // Extract stepIndex
                    let stepIndex = null;
                    if (typeof ws.stepIndex === 'number') stepIndex = ws.stepIndex;
                    else if (typeof ws.step_index === 'number') stepIndex = ws.step_index;

                    let sCascadeId = null;
                    let sTrajectoryId = null;

                    const step = ws.step;
                    if (step && typeof step === 'object') {
                        if (typeof step.stepIndex === 'number') stepIndex = step.stepIndex;
                        else if (typeof step.step_index === 'number') stepIndex = step.step_index;

                        if (step.metadata) {
                            const info = step.metadata.sourceTrajectoryStepInfo || step.metadata.source_trajectory_step_info;
                            if (info && typeof info === 'object') {
                                if (typeof info.stepIndex === 'number') stepIndex = info.stepIndex;
                                else if (typeof info.step_index === 'number') stepIndex = info.step_index;

                                sCascadeId = info.cascadeId || info.cascade_id || info.conversationId || info.conversation_id;
                                sTrajectoryId = info.trajectoryId || info.trajectory_id;
                            }
                        }
                    }

                    const finalCascadeId = sCascadeId || ws.cascadeId || ws.conversationId || cascadeId;
                    const finalTrajectoryId = sTrajectoryId || ws.trajectoryId || trajectoryId;

                    if (stepIndex !== null && finalCascadeId && finalTrajectoryId) {
                        logToFile(`[Sniffer] Successfully matched waiting step details! Index=${stepIndex}, cascadeId=${finalCascadeId}, trajectoryId=${finalTrajectoryId}`);
                        foundCallback({ cascadeId: finalCascadeId, trajectoryId: finalTrajectoryId, stepIndex });
                    } else {
                        logToFile(`[Sniffer] Failed to extract details. Index=${stepIndex}, cascadeId=${finalCascadeId}, trajectoryId=${finalTrajectoryId}`);
                    }
                }
            }
        }

        // Path 2: Check steps array under stepsUpdate or other objects
        const steps = obj.steps;
        if (Array.isArray(steps)) {
            for (const step of steps) {
                if (step && typeof step === 'object') {
                    const statusVal = step.status;
                    if (isWaitingStatus(statusVal)) {
                        let stepIndex = null;
                        if (typeof step.stepIndex === 'number') stepIndex = step.stepIndex;
                        else if (typeof step.step_index === 'number') stepIndex = step.step_index;

                        let sCascadeId = null;
                        let sTrajectoryId = null;

                        if (step.metadata) {
                            const info = step.metadata.sourceTrajectoryStepInfo || step.metadata.source_trajectory_step_info;
                            if (info && typeof info === 'object') {
                                if (typeof info.stepIndex === 'number') stepIndex = info.stepIndex;
                                else if (typeof info.step_index === 'number') stepIndex = info.step_index;

                                sCascadeId = info.cascadeId || info.cascade_id || info.conversationId || info.conversation_id;
                                sTrajectoryId = info.trajectoryId || info.trajectory_id;
                            }
                        }

                        const finalCascadeId = sCascadeId || step.cascadeId || step.conversationId || cascadeId;
                        const finalTrajectoryId = sTrajectoryId || step.trajectoryId || trajectoryId;

                        const permissions = step.permissions || step.permission;
                        if (permissions || isWaitingStatus(statusVal)) {
                            if (stepIndex !== null && finalCascadeId && finalTrajectoryId) {
                                logToFile(`[Sniffer Secondary] Found step waiting for permission! Status=${statusVal}, Index=${stepIndex}. cascadeId=${finalCascadeId}, trajectoryId=${finalTrajectoryId}`);
                                foundCallback({ cascadeId: finalCascadeId, trajectoryId: finalTrajectoryId, stepIndex });
                            } else {
                                logToFile(`[Sniffer Secondary] Missing info. Index=${stepIndex}, cascadeId=${finalCascadeId}, trajectoryId=${finalTrajectoryId}`);
                            }
                        }
                    }
                }
            }
        }

        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                scanStateUpdateForWaitingSteps(obj[key], foundCallback, cascadeId, trajectoryId, visited);
            }
        }
    }

    function approveWaitingStep(cascadeId, trajectoryId, stepIndex) {
        const key = `${cascadeId}:${trajectoryId}:${stepIndex}`;
        if (approvedSteps.has(key)) return;
        approvedSteps.add(key);

        logToFile(`[DirectApprove] Detected waiting step: cascadeId=${cascadeId}, trajectoryId=${trajectoryId}, stepIndex=${stepIndex}`);

        const urlToUse = lastBaseUrl || window.location.origin;
        const approveUrl = `${urlToUse}/exa.language_server_pb.LanguageServerService/HandleCascadeUserInteraction?autoag_approve=true`;

        const jsonPayload = JSON.stringify({
            cascadeId: cascadeId,
            interaction: {
                trajectoryId: trajectoryId,
                stepIndex: stepIndex,
                permission: {
                    allow: true
                }
            }
        });

        const jsonBytes = new TextEncoder().encode(jsonPayload);
        const payloadBytes = new Uint8Array(5 + jsonBytes.length);
        payloadBytes[0] = 0x00; // Flag
        const len = jsonBytes.length;
        payloadBytes[1] = (len >> 24) & 0xFF;
        payloadBytes[2] = (len >> 16) & 0xFF;
        payloadBytes[3] = (len >> 8) & 0xFF;
        payloadBytes[4] = len & 0xFF;
        payloadBytes.set(jsonBytes, 5);

        const headers = new Headers(lastHeaders || defaultHeaders);
        headers.set('content-type', 'application/grpc-web+json');

        logToFile(`[DirectApprove] Sending approval POST request to ${approveUrl}...`);

        fetch(approveUrl, {
            method: 'POST',
            headers: headers,
            body: payloadBytes,
            isAutoAG: true
        }).then(res => {
            logToFile(`[DirectApprove] Approval response code: ${res.status}`);
            return res.text();
        }).then(text => {
            logToFile(`[DirectApprove] Approval response body: ${text.slice(0, 100)}`);
        }).catch(err => {
            logToFile(`[DirectApprove] Approval failed: ${err.message}`);
        });
    }

    function tryInitCsrfToken() {
        if (lastHeaders && lastHeaders['x-codeium-csrf-token']) {
            return true;
        }

        // 1. Try reading from script tags in DOM (highly reliable context isolation bypass)
        try {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent || '';
                if (text.includes('__APP_CONFIG__') && text.includes('csrfToken')) {
                    const match = text.match(/"csrfToken"\s*:\s*"([^"]+)"/);
                    if (match && match[1]) {
                        const token = match[1];
                        lastHeaders = {
                            ...defaultHeaders,
                            'x-codeium-csrf-token': token
                        };
                        logToFile(`[Init] Successfully retrieved CSRF Token from DOM script tag: ${token}`);
                        return true;
                    }
                }
            }
        } catch (err) {
            logToFile(`[Init] Error parsing DOM script tags: ${err.message}`);
        }

        // 2. Try window.__APP_CONFIG__ (fallback if no context isolation)
        try {
            if (window.__APP_CONFIG__ && window.__APP_CONFIG__.csrfToken) {
                const token = window.__APP_CONFIG__.csrfToken;
                lastHeaders = {
                    ...defaultHeaders,
                    'x-codeium-csrf-token': token
                };
                logToFile(`[Init] Successfully retrieved CSRF Token from window.__APP_CONFIG__: ${token}`);
                return true;
            }
        } catch (err) {
            logToFile(`[Init] Error reading CSRF from __APP_CONFIG__: ${err.message}`);
        }

        // 3. Try document.cookie (fallback)
        try {
            if (typeof document !== 'undefined' && document.cookie) {
                const match = document.cookie.match(/(?:^|; )(?:csrfToken|x-codeium-csrf-token)=([^;]+)/);
                if (match && match[1]) {
                    const token = match[1];
                    lastHeaders = {
                        ...defaultHeaders,
                        'x-codeium-csrf-token': token
                    };
                    logToFile(`[Init] Successfully retrieved CSRF Token from document.cookie: ${token}`);
                    return true;
                }
            }
        } catch (err) {
            logToFile(`[Init] Error reading CSRF from cookie: ${err.message}`);
        }

        return false;
    }

    function triggerShadowStreamIfNeeded(id) {
        if (!isEnabled()) return;
        if (id === activeForegroundConversationId) {
            stopShadowStream(id);
            return;
        }

        tryInitCsrfToken();

        if (!lastHeaders || !lastHeaders['x-codeium-csrf-token']) {
            return;
        }

        if (activeShadowStreams.has(id)) return;

        startShadowStream(id);
    }

    function stopShadowStream(id) {
        const controller = activeShadowStreams.get(id);
        if (controller) {
            try {
                controller.abort();
                logToFile(`[Shadow] Aborted shadow stream for: ${id}`);
            } catch (_) { }
            activeShadowStreams.delete(id);
        }
    }

    function startShadowStream(id) {
        const urlToUse = lastBaseUrl || window.location.origin;
        logToFile(`[Shadow] Initiating shadow stream connection for: ${id}`);

        const controller = new AbortController();
        activeShadowStreams.set(id, controller);

        const subscriberId = 'autoag_shadow_' + generateUUID();
        const jsonPayload = JSON.stringify({
            conversationId: id,
            subscriberId: subscriberId,
            initialStepsPageBounds: { startIndex: -50 },
            initialGeneratorMetadatasPageBounds: { startIndex: -1 },
            initialExecutorMetadatasPageBounds: { endIndexExclusive: 0 }
        });

        const jsonBytes = new TextEncoder().encode(jsonPayload);
        const payloadBytes = new Uint8Array(5 + jsonBytes.length);
        payloadBytes[0] = 0x00; // Flag
        const len = jsonBytes.length;
        payloadBytes[1] = (len >> 24) & 0xFF;
        payloadBytes[2] = (len >> 16) & 0xFF;
        payloadBytes[3] = (len >> 8) & 0xFF;
        payloadBytes[4] = len & 0xFF;
        payloadBytes.set(jsonBytes, 5);

        const streamUrl = `${urlToUse}/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates?autoag_shadow=true`;
        const headers = new Headers(lastHeaders || defaultHeaders);
        headers.set('content-type', 'application/grpc-web+json');

        fetch(streamUrl, {
            method: 'POST',
            headers: headers,
            body: payloadBytes,
            signal: controller.signal,
            isShadowStream: true
        }).then(async (response) => {
            if (!response.ok) {
                throw new Error(`HTTP Error Status: ${response.status} ${response.statusText}`);
            }
            if (!response.body) {
                throw new Error("No response body available in Stream");
            }

            logToFile(`[Shadow] Stream established for background session: ${id} (Status: ${response.status})`);

            const reader = response.body.getReader();
            let buffer = new Uint8Array(0);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const newBuf = new Uint8Array(buffer.length + value.length);
                newBuf.set(buffer, 0);
                newBuf.set(value, buffer.length);
                buffer = newBuf;

                const result = parseGrpcWebFrames(buffer);
                buffer = result.remaining;

                for (const frame of result.frames) {
                    scanStateUpdateForWaitingSteps(frame.data, (ws) => {
                        approveWaitingStep(ws.cascadeId, ws.trajectoryId, ws.stepIndex);
                    });
                }
            }

            logToFile(`[Shadow] Stream ended for session: ${id}`);
            activeShadowStreams.delete(id);
        }).catch((err) => {
            if (err.name === 'AbortError') return;
            logToFile(`[Shadow] Stream error for session ${id}: ${err.message}`);
            activeShadowStreams.delete(id);

            // Backoff retry after 6 seconds
            setTimeout(() => {
                if (discoveredConversations.has(id) && id !== activeForegroundConversationId) {
                    startShadowStream(id);
                }
            }, 6000);
        });
    }

    function manageShadowStreams() {
        for (const id of discoveredConversations) {
            if (id === activeForegroundConversationId) {
                stopShadowStream(id);
            } else {
                triggerShadowStreamIfNeeded(id);
            }
        }
    }

    let isReadingCoverage = false;
    function loadConversationsFromCoverageFile() {
        if (isReadingCoverage) return;
        isReadingCoverage = true;

        const coveragePath = 'd:\\AutoAG_CLI\\autosubmit_coverage.json';
        fs.readFile(coveragePath, 'utf8', (err, raw) => {
            isReadingCoverage = false;
            if (err) {
                if (err.code !== 'ENOENT') {
                    logToFile(`[Discovery] Error reading coverage file: ${err.message}`);
                }
                return;
            }
            try {
                const data = JSON.parse(raw);
                if (data) {
                    if (data.sharedCsrfToken && (!lastHeaders || lastHeaders['x-codeium-csrf-token'] !== data.sharedCsrfToken)) {
                        lastHeaders = {
                            ...defaultHeaders,
                            'x-codeium-csrf-token': data.sharedCsrfToken
                        };
                        logToFile(`[Sync] Loaded shared CSRF Token from coverage file: ${data.sharedCsrfToken}`);
                    }
                    if (data.sharedBaseUrl && lastBaseUrl !== data.sharedBaseUrl) {
                        lastBaseUrl = data.sharedBaseUrl;
                        logToFile(`[Sync] Loaded shared Base URL from coverage file: ${lastBaseUrl}`);
                    }
                }
                // TUYỆT ĐỐI KHÔNG cập nhật activeForegroundConversationId của cửa sổ này từ tệp dùng chung
                // Điều này chặn hoàn toàn vòng lặp ping-pong giữa các session!
                if (data && Array.isArray(data.sessions)) {
                    let changed = false;
                    for (const session of data.sessions) {
                        if (session && session.conversationId) {
                            if (!discoveredConversations.has(session.conversationId)) {
                                discoveredConversations.add(session.conversationId);
                                logToFile(`[Discovery] Loaded background session from coverage file: ${session.conversationId}`);
                                changed = true;
                            }
                        }
                    }
                    if (changed) {
                        manageShadowStreams();
                    }
                }
            } catch (err) {
                logToFile(`[Discovery] Error parsing coverage file: ${err.message}`);
            }
        });
    }

    function watchCoverageFile() {
        // Use setInterval polling instead of fs.watch to prevent Electron renderer native crashes
        setInterval(() => {
            loadConversationsFromCoverageFile();
        }, 100); // Tăng tần suất đọc file lên 100ms để bắt thay đổi tức thì
    }

    function captureStreamDetails(url, headers, bodyText) {
        try {
            if (url.includes('/HandleCascadeUserInteraction')) {
                return;
            }
            if (bodyText && bodyText.includes('autoag_shadow_')) {
                return;
            }
            const parsedUrl = new URL(url, window.location.href);
            const baseUrl = parsedUrl.origin;
            if (baseUrl !== lastBaseUrl) {
                lastBaseUrl = baseUrl;
                logToFile(`[Capture] Captured Base URL: ${lastBaseUrl}`);
            }

            if (headers) {
                const captured = {};
                if (typeof headers.forEach === 'function') {
                    headers.forEach((val, key) => {
                        captured[key.toLowerCase()] = val;
                    });
                } else if (typeof headers === 'object') {
                    for (const key in headers) {
                        captured[key.toLowerCase()] = headers[key];
                    }
                }

                if (captured['x-codeium-csrf-token']) {
                    lastHeaders = captured;
                    logToFile(`[Capture] Captured authenticated headers with CSRF Token!`);
                }
            }

            if (bodyText) {
                const m = bodyText.match(/"conversationId"\s*:\s*"([^"]+)"/);
                if (m && m[1]) {
                    const conversationId = m[1];
                    setActiveForegroundConversation(conversationId);
                    registerConversation(conversationId);
                }
            }

            manageShadowStreams();
        } catch (err) {
            logToFile(`[Capture] Error: ${err.message}`);
        }
    }

    function hookResponseStream(response) {
        if (!response || !response.body) return response;

        try {
            const originalGetReader = response.body.getReader;
            response.body.getReader = function () {
                const reader = originalGetReader.apply(this, arguments);
                const originalRead = reader.read;

                let buffer = new Uint8Array(0);

                reader.read = async function () {
                    const result = await originalRead.apply(this, arguments);
                    if (result && result.value) {
                        const value = result.value;

                        const newBuf = new Uint8Array(buffer.length + value.length);
                        newBuf.set(buffer, 0);
                        newBuf.set(value, buffer.length);
                        buffer = newBuf;

                        try {
                            const parseResult = parseGrpcWebFrames(buffer);
                            buffer = parseResult.remaining;
                            for (const frame of parseResult.frames) {
                                scanStateUpdateForWaitingSteps(frame.data, (ws) => {
                                    approveWaitingStep(ws.cascadeId, ws.trajectoryId, ws.stepIndex);
                                });
                            }
                        } catch (err) {
                            logToFile(`[Sniffer] Frame error: ${err.message}`);
                        }
                    }
                    return result;
                };

                return reader;
            };
        } catch (err) {
            logToFile(`[Sniffer] Failed to hook reader: ${err.message}`);
        }

        return response;
    }

    function hookWindowContext(win) {
        try {
            if (!win || win.hasBeenHookedByAutoAG) return;
            win.hasBeenHookedByAutoAG = true;

            logToFile(`[Hook] Hooking window/iframe context: ${win.location.href}`);

            if (win.fetch && !win.fetch.isHookedByAutoAG) {
                const originalFetch = win.fetch;
                win.fetch = async function (resource, init) {
                    const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
                    if (url.includes('autoag_shadow=true') || url.includes('autoag_approve=true') || url.includes('/HandleCascadeUserInteraction')) {
                        return originalFetch.apply(this, arguments);
                    }

                    if (url.includes('/exa.language_server_pb.LanguageServerService/')) {
                        let bodyText = '';
                        const bodySource = (init && init.body) || (resource && resource.body);
                        if (bodySource) {
                            if (typeof bodySource === 'string') {
                                bodyText = bodySource;
                            } else {
                                try {
                                    bodyText = new TextDecoder('utf-8').decode(bodySource);
                                } catch (_) { }
                            }
                        }

                        if (bodyText && bodyText.includes('autoag_shadow_')) {
                            return originalFetch.apply(this, arguments);
                        }

                        if (init && (init.isShadowStream || init.isAutoAG)) {
                            return originalFetch.apply(this, arguments);
                        }

                        const capturedHeaders = {};
                        const processHeaderObj = (h) => {
                            if (!h) return;
                            if (typeof h.forEach === 'function') {
                                h.forEach((val, key) => {
                                    capturedHeaders[key.toLowerCase()] = val;
                                });
                            } else if (typeof h === 'object') {
                                for (const key in h) {
                                    capturedHeaders[key.toLowerCase()] = h[key];
                                }
                            }
                        };

                        if (resource && resource.headers) {
                            processHeaderObj(resource.headers);
                        }
                        if (init && init.headers) {
                            processHeaderObj(init.headers);
                        }

                        captureStreamDetails(url, capturedHeaders, bodyText);

                        if (url.includes('/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates')) {
                            const response = await originalFetch.apply(this, arguments);
                            return hookResponseStream(response);
                        }
                    }

                    return originalFetch.apply(this, arguments);
                };
                win.fetch.isHookedByAutoAG = true;
            }

            if (win.XMLHttpRequest && !win.XMLHttpRequest.isHookedByAutoAG) {
                const originalOpen = win.XMLHttpRequest.prototype.open;
                const originalSend = win.XMLHttpRequest.prototype.send;
                const originalSetRequestHeader = win.XMLHttpRequest.prototype.setRequestHeader;

                win.XMLHttpRequest.prototype.open = function (method, url) {
                    this._url = url;
                    this._method = method;
                    this._headers = {};
                    return originalOpen.apply(this, arguments);
                };

                win.XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
                    if (this._headers) {
                        this._headers[header.toLowerCase()] = value;
                    }
                    return originalSetRequestHeader.apply(this, arguments);
                };

                win.XMLHttpRequest.prototype.send = function (body) {
                    const url = this._url || '';
                    if (url.includes('/exa.language_server_pb.LanguageServerService/')) {
                        let bodyText = '';
                        if (body) {
                            if (typeof body === 'string') {
                                bodyText = body;
                            } else {
                                try {
                                    bodyText = new TextDecoder('utf-8').decode(body);
                                } catch (_) { }
                            }
                        }
                        captureStreamDetails(url, this._headers, bodyText);
                    }
                    return originalSend.apply(this, arguments);
                };
                win.XMLHttpRequest.isHookedByAutoAG = true;
            }
        } catch (_) { }
    }

    function scanAndHookIframes() {
        try {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                if (iframe.contentDocument) {
                    injectMainWorldScript(iframe.contentDocument);
                }
                if (iframe.contentWindow) {
                    hookWindowContext(iframe.contentWindow);
                }
                if (!iframe.hasAutoAGLoadListener) {
                    iframe.hasAutoAGLoadListener = true;
                    iframe.addEventListener('load', () => {
                        if (iframe.contentDocument) {
                            injectMainWorldScript(iframe.contentDocument);
                        }
                        if (iframe.contentWindow) {
                            hookWindowContext(iframe.contentWindow);
                        }
                    });
                }
            });
        } catch (_) { }
    }

    // Hook top-level window and inject script immediately
    injectMainWorldScript(document);
    hookWindowContext(window);

    // Dynamic iframe element creation hook
    try {
        const originalCreateElement = document.createElement;
        document.createElement = function (tagName) {
            const el = originalCreateElement.apply(this, arguments);
            if (tagName && tagName.toLowerCase() === 'iframe') {
                setTimeout(() => {
                    if (el.contentDocument) {
                        injectMainWorldScript(el.contentDocument);
                    }
                    if (el.contentWindow) {
                        hookWindowContext(el.contentWindow);
                    }
                }, 80);
            }
            return el;
        };
    } catch (_) { }


    // =========================================================================
    // SECTION 2: DOM-based Backup Auto-Submit Engine (Foreground Fallback)
    // =========================================================================

    function getSafeParent(node) {
        if (!node) return null;
        if (node.parentElement) return node.parentElement;
        if (node.parentNode) {
            if (node.parentNode.host) return node.parentNode.host;
            return node.parentNode;
        }
        return null;
    }

    function querySelectorAllDeep(selectors, root = document) {
        const results = [];
        function walk(node) {
            if (!node) return;
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(selectors)) {
                    results.push(node);
                }
                if (node.shadowRoot) {
                    walk(node.shadowRoot);
                }
            }
            let child = node.firstChild;
            while (child) {
                walk(child);
                child = child.nextSibling;
            }
        }
        walk(root);
        return results;
    }

    function querySelectorDeep(selectors, root = document) {
        return querySelectorAllDeep(selectors, root)[0] || null;
    }

    function isCandidateVisibleSimple(el) {
        if (!el || !el.isConnected) return false;
        try {
            const win = el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window;
            const style = win.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        } catch (_) {
            return true;
        }
    }

    function resolveInteractiveTarget(node, scope) {
        if (!node) return null;
        let curr = node;
        while (curr && curr !== scope) {
            if (curr.nodeType === Node.ELEMENT_NODE) {
                const role = curr.getAttribute && curr.getAttribute('role');
                const tagName = curr.tagName ? curr.tagName.toLowerCase() : '';
                if (role === 'radio' || role === 'checkbox' || role === 'button' || tagName === 'button' || tagName === 'label' || tagName === 'li') {
                    return curr;
                }
                const className = curr.className || '';
                if (typeof className === 'string' && (className.includes('option') || className.includes('item') || className.includes('button'))) {
                    return curr;
                }
            }
            curr = getSafeParent(curr);
        }
        return node;
    }

    function textOf(node) {
        return ((node && node.textContent) || '').trim().toLowerCase();
    }

    function ownTextOf(node) {
        if (!node) return '';
        let text = '';
        for (const child of node.childNodes || []) {
            if (child.nodeType === Node.TEXT_NODE) {
                text += child.textContent || '';
            }
        }
        return text.trim().toLowerCase();
    }

    function clickElement(node) {
        if (!node) return false;
        try {
            let rect = node.getBoundingClientRect();
            const isHidden = rect.width === 0 || rect.height === 0;
            let originalGetRect = null;
            if (isHidden) {
                originalGetRect = node.getBoundingClientRect;
                node.getBoundingClientRect = function () {
                    return {
                        x: 100, y: 100, top: 100, left: 100,
                        width: 150, height: 40, right: 250, bottom: 140
                    };
                };
                rect = node.getBoundingClientRect();
            }

            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const baseEvent = {
                bubbles: true, cancelable: true, view: window,
                clientX: x, clientY: y, screenX: x, screenY: y,
                buttons: 1, button: 0
            };
            const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
            for (const name of events) {
                if (name.startsWith('pointer')) {
                    node.dispatchEvent(new PointerEvent(name, Object.assign({}, baseEvent, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
                } else {
                    node.dispatchEvent(new MouseEvent(name, baseEvent));
                }
            }
            if (typeof node.click === 'function') {
                node.click();
            }

            if (originalGetRect) {
                node.getBoundingClientRect = originalGetRect;
            }
            return true;
        } catch (err) {
            logToFile(`[DOM] Click failed: ${err.message}`);
            return false;
        }
    }

    function isLocallyVisible(node, stopAtNode) {
        if (!node || !node.isConnected) return false;
        try {
            const win = node.ownerDocument && node.ownerDocument.defaultView ? node.ownerDocument.defaultView : window;
            let curr = node;
            let depth = 0;
            while (curr && depth < 3) {
                if (curr === stopAtNode) {
                    break;
                }
                if (curr.nodeType === Node.ELEMENT_NODE) {
                    const style = win.getComputedStyle(curr);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return false;
                    }
                }
                curr = getSafeParent(curr);
                depth++;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    function isPromptScopeActive(node) {
        if (!node || !node.isConnected) return false;

        if (node.getAttribute('aria-hidden') === 'true') return false;
        if (node.getAttribute('data-state') === 'closed') return false;

        let curr = node;
        let depth = 0;
        while (curr && depth < 3) {
            if (curr.nodeType === Node.ELEMENT_NODE) {
                const style = window.getComputedStyle(curr);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return false;
                }
            }
            curr = getSafeParent(curr);
            depth++;
        }

        return true;
    }

    function isDisabledControl(node) {
        if (!node) return true;
        if (node.disabled) return true;
        const ariaDisabled = node.getAttribute && node.getAttribute('aria-disabled');
        if (ariaDisabled === 'true') return true;
        const dataDisabled = node.getAttribute && node.getAttribute('data-disabled');
        if (dataDisabled === 'true') return true;
        return false;
    }

    function findPromptScopes() {
        const selectors = [
            'div[role="dialog"]',
            '[data-radix-popper-content-wrapper]',
            'div[class*="modal"]',
            'div[class*="dialog"]',
            'div[class*="Overlay"]',
            'div[class*="Backdrop"]',
            'div[class*="card"]',
            'div[class*="message"]',
            'div[class*="step"]',
            '[role="region"]',
            '[role="alert"]',
            '[role="status"]',
            'div[class*="toast"]',
            'div[class*="notification"]',
            'div[class*="banner"]',
            'div[class*="alert"]',
            'div[class*="popup"]'
        ];

        const promptHints = [
            'allow running this command',
            'allow read access to this path',
            'allow write access to this path',
            'allow read/write access to this path',
            'allow filesystem access',
            'allow using this mcp',
            'allow using this mcp tool',
            'allow using this mcp server',
            'permission request',
            'running this command',
            'access to this path',
            'yêu cầu cấp quyền',
            'cho phép',
            'đồng ý'
        ];

        const nodes = Array.from(querySelectorAllDeep(selectors.join(','), document));
        return nodes.filter((node) => {
            if (!isPromptScopeActive(node)) return false;
            const text = textOf(node);
            if (!promptHints.some((hint) => text.includes(hint))) return false;

            const controls = querySelectorAllDeep('button, input[type="submit"], input[type="button"], input[type="radio"], input[type="checkbox"], [role="button"], [role="radio"], [role="checkbox"]', node);
            if (controls.length === 0) return false;

            return true;
        });
    }

    function findPositiveOption(scope) {
        const positiveHints = [
            'always allow',
            'allow always',
            'allow for this session',
            'allow this time',
            'yes, allow this time',
            'yes, allow',
            'allow',
            'luôn cho phép',
            'đồng ý cho phiên',
            'cho phép cho phiên',
            'đồng ý lần này',
            'cho phép lần này',
            'cho phép',
            'đồng ý'
        ];

        const negativeHints = ['deny', 'block', 'cancel', "don't", 'do not', 'không', 'hủy', 'cấm'];
        // Extended candidates inside Shadow DOM
        const candidates = Array.from(querySelectorAllDeep('button, label, div, span, li, a, [role="button"], [role="radio"], [role="checkbox"], [role="menuitem"]', scope));

        let bestCandidate = null;
        let bestScore = -1;

        for (const candidate of candidates) {
            if (!isCandidateVisibleSimple(candidate)) continue;
            const ownText = ownTextOf(candidate);
            const text = ownText || textOf(candidate);
            if (!text || text.length > 100) continue;
            if (negativeHints.some((hint) => text.includes(hint))) continue;

            const matchedHint = positiveHints.find((hint) => text.includes(hint));
            if (matchedHint) {
                let score = matchedHint.length;
                const interactiveRole = candidate.getAttribute && candidate.getAttribute('role');
                if (interactiveRole === 'button' || interactiveRole === 'radio' || interactiveRole === 'checkbox') score += 10;
                if (candidate.matches('button, label')) score += 5;

                // Prefer leaf nodes
                const children = Array.from(candidate.children);
                const hasMatchingChild = children.some(child => {
                    const childText = textOf(child);
                    return positiveHints.some(h => childText.includes(h));
                });
                if (!hasMatchingChild) score += 5;

                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = candidate;
                }
            }
        }

        return bestCandidate;
    }

    function isElementVisibleRobust(el) {
        if (!el || !el.isConnected) return false;
        try {
            const win = el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window;
            let curr = el;
            let depth = 0;
            while (curr && depth < 3) {
                if (curr.nodeType === Node.ELEMENT_NODE) {
                    const style = win.getComputedStyle(curr);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return false;
                    }
                }
                curr = getSafeParent(curr);
                depth++;
            }
            return true;
        } catch (_) {
            return false;
        }
    }

    function findPromptScopesRobust(doc = document) {
        const promptHints = [
            'allow running this command',
            'allow read access',
            'allow write access',
            'allow read/write access',
            'allow filesystem access',
            'allow using this mcp',
            'allow using this mcp tool',
            'allow using this mcp server',
            'permission request',
            'running this command',
            'access to this path',
            'yêu cầu cấp quyền',
            'cho phép',
            'đồng ý',
            'run command',
            'execute command',
            'chạy lệnh'
        ];

        const candidateSelectors = [
            'div[role="dialog"]',
            '[data-radix-popper-content-wrapper]',
            'div[class*="modal"]',
            'div[class*="dialog"]',
            'div[class*="Overlay"]',
            'div[class*="Backdrop"]',
            'div[class*="card"]',
            'div[class*="step"]',
            '[role="alert"]',
            'div[class*="toast"]',
            'div[class*="notification"]',
            'div[class*="banner"]',
            'div[class*="alert"]',
            'div[class*="popup"]',
            'form'
        ];

        const candidates = querySelectorAllDeep(candidateSelectors.join(','), doc);
        const validScopes = [];

        for (const el of candidates) {
            if (!isElementVisibleRobust(el)) continue;

            const text = ((el && el.textContent) || '').trim().toLowerCase();
            if (!promptHints.some(hint => text.includes(hint))) continue;

            const controls = querySelectorAllDeep('button, input[type="submit"], input[type="button"], input[type="radio"], input[type="checkbox"], [role="button"], [role="radio"], [role="checkbox"]', el);
            if (controls.length === 0) continue;

            // Make sure the controls text actually contains positive or negative choices
            const controlsText = Array.from(controls).map(c => textOf(c)).join(' ');
            const hasOption = ['allow', 'deny', 'block', 'cancel', 'approve', 'confirm', 'cho phép', 'đồng ý', 'hủy', 'cấm', 'submit', 'skip', 'yes', 'no', 'agree', 'always', 'xác nhận', 'chấp nhận'].some(opt => controlsText.includes(opt));
            if (!hasOption) continue;

            validScopes.push(el);
        }

        const rootScopes = validScopes.filter(scope => {
            return !validScopes.some(otherScope => {
                return otherScope !== scope && otherScope.contains(scope);
            });
        });

        return rootScopes;
    }

    // Attempt to search all documents (including iframes) for prompt scopes as a fallback
    function findPromptScopesDeep() {
        let scopes = findPromptScopesRobust(document);
        try {
            const iframes = querySelectorAllDeep('iframe', document);
            iframes.forEach(iframe => {
                if (iframe.contentDocument) {
                    scopes = scopes.concat(findPromptScopesRobust(iframe.contentDocument));
                }
            });
        } catch (_) { }
        return scopes;
    }

    function findSubmitButton(scope) {
        const submitHints = ['submit', 'approve', 'confirm', 'continue', 'allow', 'gửi', 'chấp nhận', 'xác nhận', 'đồng ý', 'tiếp tục'];
        // Extended candidates inside Shadow DOM
        const buttons = Array.from(querySelectorAllDeep('button, div, span, a, [role="button"], input[type="submit"], input[type="button"]', scope));

        let bestButton = null;
        let bestScore = -1;

        for (const button of buttons) {
            if (!isCandidateVisibleSimple(button)) continue;
            const text = textOf(button);
            if (!text || text.length > 30) continue;

            const matchedHint = submitHints.find((hint) => text.includes(hint));
            if (matchedHint) {
                let score = matchedHint.length;
                if (button.getAttribute && button.getAttribute('role') === 'button') score += 10;
                if (button.matches('button, input')) score += 5;

                // Prefer leaf nodes
                const children = Array.from(button.children);
                const hasMatchingChild = children.some(child => {
                    const childText = textOf(child);
                    return submitHints.some(h => childText.includes(h));
                });
                if (!hasMatchingChild) score += 5;

                if (score > bestScore) {
                    bestScore = score;
                    bestButton = button;
                }
            }
        }

        return bestButton;
    }

    function submitFallback(scope) {
        const form = scope.closest && scope.closest('form') || (querySelectorAllDeep('form', scope)[0]);
        if (form) {
            try {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                }
                logToFile('[DOM] Fallback submitted enclosing form.');
                return true;
            } catch (err) {
                logToFile(`[DOM] Form fallback failed: ${err.message}`);
            }
        }

        const checkedInput = querySelectorDeep('input[type="radio"]:checked, input[type="checkbox"]:checked', scope);
        if (checkedInput) {
            const keyboardTarget = checkedInput.closest && checkedInput.closest('label, [role="radio"], [role="checkbox"], div, button') || checkedInput;
            try {
                keyboardTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                keyboardTarget.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
                logToFile('[DOM] Fallback sent Enter key after selecting option.');
                return true;
            } catch (err) {
                logToFile(`[DOM] Keyboard fallback failed: ${err.message}`);
            }
        }

        return false;
    }

    // Identifies distinct prompt states uniquely to prevent duplicated auto-submits
    function getPromptFingerprint(scope) {
        const text = textOf(scope).replace(/\s+/g, ' ').slice(0, 300);
        const selected = Array.from(querySelectorAllDeep('input[type="radio"], input[type="checkbox"]', scope))
            .map((input, index) => `${index}:${input.checked ? '1' : '0'}`)
            .join('|');
        return `${text}::${selected}`;
    }

    function hasRegisteredSelection(scope) {
        const inputs = querySelectorAllDeep('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]', scope);
        if (inputs.length === 0) {
            return true;
        }

        const checked = querySelectorDeep('input[type="radio"]:checked, input[type="checkbox"]:checked', scope);
        if (checked) return true;

        const selectedRole = querySelectorDeep('[role="radio"][aria-checked="true"], [role="checkbox"][aria-checked="true"]', scope);
        if (selectedRole) return true;

        return false;
    }

    function attemptSubmit(scope, fingerprint, attempt = 0) {
        if (!scope || !scope.isConnected) return;
        const latestFingerprint = getPromptFingerprint(scope);
        if (scope.getAttribute('data-autoag-completed-fingerprint') === latestFingerprint) {
            return;
        }

        const submit = findSubmitButton(scope);
        const selectionReady = hasRegisteredSelection(scope);

        if (submit && !isDisabledControl(submit) && selectionReady) {
            clickElement(submit);
            const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true };
            const targets = [submit, document, window, document.activeElement];
            for (const target of targets) {
                if (target) {
                    try {
                        target.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
                        target.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
                    } catch (_) { }
                }
            }

            scope.setAttribute('data-autoag-completed-fingerprint', fingerprint);
            logToFile(`[DOM] Clicked submit: ${textOf(submit).slice(0, 60)}`);
            return;
        }

        if (attempt < 6) {
            setTimeout(() => attemptSubmit(scope, fingerprint, attempt + 1), 15);
            return;
        }

        if (selectionReady && submitFallback(scope)) {
            scope.setAttribute('data-autoag-completed-fingerprint', fingerprint);
            return;
        }

        if (selectionReady && (submit || attempt === 6)) {
            logToFile('[DOM] Prompt scope found but submit was not ready after retries.');
        }
    }

    function tryAutoSubmitForScope(scope) {
        const now = Date.now();
        const lastRun = Number(scope.getAttribute('data-autoag-last-run') || '0');
        if (now - lastRun < 50) return;
        const fingerprint = getPromptFingerprint(scope);
        const completedFingerprint = scope.getAttribute('data-autoag-completed-fingerprint') || '';
        if (completedFingerprint === fingerprint) {
            return;
        }
        scope.setAttribute('data-autoag-last-run', String(now));

        const option = resolveInteractiveTarget(findPositiveOption(scope), scope);
        let waitTime = 50;
        if (option) {
            clickElement(option);
            const txt = textOf(option);
            const match = txt.match(/^\s*(\d)/);
            if (match) {
                const numKey = match[1];
                const keyOpts = { key: numKey, code: 'Digit' + numKey, keyCode: 48 + parseInt(numKey), bubbles: true, cancelable: true };
                const targets = [document, window, document.activeElement, option];
                for (const target of targets) {
                    if (target) {
                        try {
                            target.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
                            target.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
                        } catch (_) { }
                    }
                }
            }
            const input = querySelectorDeep('input[type="radio"], input[type="checkbox"]', option);
            if (input) {
                input.checked = true;
                clickElement(input);
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            }
            const radioRole = (option.getAttribute && option.getAttribute('role') === 'radio') ? option : querySelectorDeep('[role="radio"], [role="checkbox"]', option);
            if (radioRole) {
                radioRole.setAttribute('aria-checked', 'true');
                clickElement(radioRole);
                radioRole.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
                radioRole.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            }
            logToFile(`[DOM] Selected positive option: ${(ownTextOf(option) || textOf(option)).slice(0, 60)}`);
            waitTime = 20;
        } else {
            waitTime = 0;
        }

        setTimeout(() => attemptSubmit(scope, fingerprint, 0), waitTime);
    }

    function tryAutoSubmit() {
        if (!isEnabled()) return;

        const scopes = findPromptScopesDeep();
        if (scopes.length === 0) return;

        for (const scope of scopes) {
            tryAutoSubmitForScope(scope);
        }
    }

    function init() {
        logToFile(`[Init] Dual-Layer autosubmit started at ${window.location.href}`);

        injectMainWorldScript(document);

        tryInitCsrfToken();

        // Scan initially and hook any existing iframes
        scanAndHookIframes();

        // Initialize Direct Network Approver (fully async)
        loadConversationsFromCoverageFile();
        watchCoverageFile();
        manageShadowStreams();

        if (!document.documentElement) return;

        // HIGHLY OPTIMIZED MUTATION OBSERVER
        let observerDebounceTimer = null;
        const observer = new MutationObserver(() => {
            if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
            observerDebounceTimer = setTimeout(() => {
                scanAndHookIframes();
                tryAutoSubmit();
            }, 10);
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        setInterval(tryAutoSubmit, 100); // Quét dự phòng nhanh hơn mỗi 100ms
        setInterval(scanAndHookIframes, 500); // Quét dự phòng iframe mỗi 500ms
        setInterval(loadSettingsAsync, 5000); // Async settings refresh

        // Periodic check to capture CSRF token if it wasn't ready at startup
        setInterval(() => {
            if (tryInitCsrfToken()) {
                manageShadowStreams();
            }
        }, 300); // Quét lại token nhanh hơn mỗi 300ms

        setTimeout(tryAutoSubmit, 500);
        tryAutoSubmit();
        isStartupPhase = false;
    }

    function startInitialization() {
        if (!isStartupPhase) return;
        logToFile("[Startup] DOM is ready, beginning initialization...");
        try {
            init();
        } catch (err) {
            logToFile(`[Startup] Initialization failed: ${err.message}`);
        }
    }

    if (document.readyState === 'loading') {
        logToFile("[Startup] DOM is loading, waiting for DOMContentLoaded event...");
        document.addEventListener('DOMContentLoaded', startInitialization);
        // Fallback safety timeout
        setTimeout(() => {
            if (isStartupPhase) {
                logToFile("[Startup] DOMContentLoaded fallback timeout reached, forcing initialization.");
                startInitialization();
            }
        }, 3000);
    } else {
        logToFile("[Startup] DOM is already ready, initializing immediately.");
        startInitialization();
    }
})();
