// Auto-submit Command Execution Requests (Optimized Performance Version)
(() => {
    console.log('[Auto-Submit] Preload patch loading...');

    function init() {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity', 'autosubmit.json');

        console.log('[Auto-Submit] Preload patch initialized.');

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

            // Using textContent instead of innerText to avoid Layout Thrashing (forces no reflow)
            const bodyText = document.body ? (document.body.textContent || '') : '';

            // 1. Check for Permission Approval Dialogs (including MCP tool/server authorizations)
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
                    
                    console.log('[Auto-Submit] Automatically accepting permission request.');
                    submitButton.click();
                }
            }

            // 2. Check for Agent Error and Auto-Retry
            if (bodyText.includes('Agent terminated due to error')) {
                const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span, a'));
                const retryButton = allElements.find(el => {
                    const text = (el.textContent || '').trim();
                    return text === 'Retry' || (el.tagName === 'BUTTON' && text.includes('Retry'));
                });
                if (retryButton) {
                    console.log('[Auto-Submit] Automatically retrying terminated agent.');
                    retryButton.click();
                }
            }
        }

        // Apply MutationObserver with 100ms Debouncing to keep CPU at 0%
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
                subtree: true
            });

            // Initial check
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
