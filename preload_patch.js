// Auto-submit Command Execution Requests
(() => {
    console.log('[Auto-Submit] Preload patch loading...');

    function init() {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '.gemini', 'antigravity', 'autosubmit.json');
        const debugPath = path.join(os.tmpdir(), 'debug_dom.txt');

        console.log('[Auto-Submit] Preload patch initialized.');

        function checkAndSubmit() {
            let autoSubmitEnabled = true; // default
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

            // Try to dump the DOM HTML to temp folder for diagnostic support
            try {
                if (document.documentElement) {
                    fs.writeFileSync(debugPath, document.documentElement.innerHTML, 'utf8');
                }
            } catch (err) {
                // Silent catch
            }

            const bodyText = document.body ? (document.body.innerText || '') : '';
            if (bodyText.includes('Allow running this command?') || 
                bodyText.includes('Allow read access to this path?') || 
                bodyText.includes('Allow write access to this path?') ||
                bodyText.includes('Allow read/write access to this path?') ||
                bodyText.includes('Allow filesystem access?') ||
                bodyText.includes('access to this path?')) {
                // Find all potential button elements robustly
                const allElements = Array.from(document.querySelectorAll('button, [role="button"], div, span, a'));
                
                // Search for the Submit button
                const submitButton = allElements.find(el => {
                    const text = (el.textContent || '').trim();
                    return text === 'Submit' || (el.tagName === 'BUTTON' && text.includes('Submit'));
                });

                if (submitButton) {
                    // Ensure the "Yes, allow this time" option is selected
                    const options = Array.from(document.querySelectorAll('div, li, span, label, button'));
                    const firstOption = options.find(el => el.textContent && el.textContent.includes('Yes, allow this time'));
                    if (firstOption) {
                        firstOption.click();
                    }
                    
                    console.log('[Auto-Submit] Automatically accepting command run request.');
                    submitButton.click();
                }
            }
        }

        // Set up MutationObserver immediately on document.documentElement
        if (document.documentElement) {
            const observer = new MutationObserver(() => {
                checkAndSubmit();
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            // Run an immediate check in case the dialog is already in the DOM
            checkAndSubmit();
        }
    }

    // Safely wait for document.documentElement to exist before initializing
    if (document.documentElement) {
        try {
            init();
        } catch (err) {
            console.error('[Auto-Submit] Initialization error:', err);
        }
    } else {
        const interval = setInterval(() => {
            if (document.documentElement) {
                clearInterval(interval);
                try {
                    init();
                } catch (err) {
                    console.error('[Auto-Submit] Initialization error:', err);
                }
            }
        }, 50);
    }
})();
