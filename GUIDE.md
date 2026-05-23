# 📖 AutoAG CLI - User Guide ⚡

Welcome to **AutoAG CLI** - The ultimate high-performance, completely silent background permission auto-approver for **Antigravity IDE** on Windows.

This guide provides comprehensive documentation on system architecture, installation, daily usage tips, taskbar tray administration, and troubleshooting.

---

## 💡 1. How It Works

The system operates on an advanced, ultra-reliable **Dual-Layer Auto-Submit Engine**:

1. **Silent Background Mode (gRPC Web Stream)**:
   * When you are working on other project sessions or windows (background tabs), AutoAG activates its network-level gRPC-Web stream sniffer.
   * As soon as the agent requests command execution or file/MCP access, AutoAG intercepts and approves it directly via a mock gRPC POST request in **< 1 millisecond**.
   * **Result:** Background sessions run 100% silently with zero screen flashing, zero tab switching, and zero active window disruption.

2. **Glow Foreground Fallback (DOM Automation)**:
   * When you are actively focused on the primary session, the IDE displays the permission prompt cards.
   * AutoAG's real-time DOM scanner detects the card in **10ms**, dispatches the custom Radix UI selection click to checked-option wrappers in **20ms**, and automatically clicks the `"Submit"` button instantly.
   * **Result:** Permission prompts vanish automatically and approve themselves in the blink of an eye.

---

## 🚀 2. Installation

### 📋 Prerequisites:
* A machine running Windows.
* **Antigravity IDE** installed (launched at least once).
* **Node.js** and **npx** installed (to extract and pack ASAR packages).

### 🛠 Installation Steps:
1. Download this **AutoAG_CLI** repository to your local drive.
2. Double-click the **`install.bat`** file located in the root of the project.
3. The automatic install script will:
   * Auto-locate your Antigravity installation resources folder.
   * Back up your original Electron file (`app.asar` -> `app.asar.bak`).
   * Extract, patch the preload files to bypass Sandbox limits, and hook the global fetches.
   * Pack it back securely and print a successful confirmation status.

---

## 🎮 3. Daily Usage

Once installed, **no manual intervention is required!** AutoAG runs completely in the background side-by-side with your IDE:

* **Terminal Command Approvals**: Run system commands (like `ping`, `ipconfig`, `systeminfo`...) and watch them auto-approve instantly.
* **MCP Tool Access**: Trigger third-party plugins or servers (like Chrome DevTools), and their permission prompts are selected and confirmed automatically.
* **Filesystem Access**: Read/Write file permission dialogs are auto-submitted immediately.

> [!TIP]
> **Pro Tip:** If after an update or compile you notice prompt cards hanging on the screen without auto-submitting, press **`Ctrl + R`** inside the Antigravity IDE window to instantly reload the UI and load the latest patch.

---

## 🎛️ 4. Taskbar System Tray Administration

You can monitor and manage AutoAG's status via the taskbar tray app: **`AutoAG_Tray.exe`**:

Double-click `AutoAG_Tray.exe` to open the lightning bolt icon in your Windows Taskbar corner. Right-click the icon to:

* **Toggle Auto-Submit State**:
  * Green Icon 🟢: Auto-Submit active and approving prompts in `<1ms`!
  * Red/Gray Icon 🔴: Paused. Reverts to default IDE behavior (prompts require manual clicking).
* **View Real-Time Logs**: Opens `autosubmit.log` to audit recent command approvals.
* **Exit Tray**: Closes the tray administrative interface.

---

## 🛠 5. Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **IDE hangs on a dark loading screen** | ASAR packaging error or file corruption | Double-click **`uninstall.bat`** at the root of the project to restore the IDE to its 100% original state, then reinstall. |
| **Prompts appear but don't disappear** | Electron renderer context is out of sync | Press **`Ctrl + R`** inside the Antigravity IDE window to reload the frame, or restart the IDE. |
| **Background streams do not auto-approve** | Autopilot paused in Taskbar Tray | Right-click the tray icon and make sure the icon status is Green (Enabled). |

---

<p align="center">
  Wishing you a lightning-fast and highly productive development experience with AutoAG CLI! ⚡🚀
</p>
