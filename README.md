<p align="center">
  <a href="README.md"><b>🇺🇸 English Version</b></a> | 
  <a href="README.vi.md"><b>🇻🇳 Tiếng Việt</b></a>
</p>

<p align="center">
  <img src="assets/LogoAG.png" alt="AutoAG Logo" width="120" style="border-radius: 20px; box-shadow: 0 8px 16px rgba(0,0,0,0.2);" />
</p>

<h1 align="center">⚡ AutoAG CLI ⚡</h1>

<p align="center">
  <strong>Ultra-Fast Background Permission Auto-Approver for Antigravity IDE</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge&logo=windows" alt="Platform Windows" />
  <img src="https://img.shields.io/badge/Speed-%3C1ms-brightgreen?style=for-the-badge" alt="Speed" />
  <img src="https://img.shields.io/badge/Status-Stable-success?style=for-the-badge" alt="Status" />
</p>

---

## 🌟 Core Features

| Feature | Legacy Solution (DOM Rotator) | New Solution (AutoAG gRPC-Web) |
| :--- | :---: | :---: |
| **Response Speed** | 🐢 5 ~ 10 seconds (Delay & Tab Switching) | ⚡ **< 1 millisecond** (Instantaneous!) |
| **UI Interference** | ⚠️ Screen flickering, active tab switching | 🍃 **100% Silent**, no tab switching, zero UI impact |
| **Background execution** | ❌ Paused when minimized or unfocused |  **Runs continuously in background** even if minimized |
| **Reliability** | 🔄 Prone to errors if the DOM structure changes | 🛡️ **Dual-Layer**: Network interception + DOM fallback |

---

## 🗺️ System Architecture

```mermaid
graph TD
    A[Antigravity IDE FrontEnd] -->|1. Request Permission| B(Language Server backend)
    B -->|2. Stream Updates /StreamAgentStateUpdates| A
    
    subgraph AutoAG CLI Engine
        C[Global fetch/XMLHttpRequest Hooks] <-->|3. Intercept gRPC-Web Stream| A
        D[Direct Network Approver Engine] <-->|4. Dispatch Approval JSON| C
    end
    
    D -->|5. Instant Approve /HandleCascadeUserInteraction| B
    style AutoAG CLI Engine fill:#1a1a2e,stroke:#3a3a5e,stroke-width:2px,color:#ffffff
    style D fill:#00ADB5,stroke:#00f2fe,stroke-width:2px,color:#ffffff
```

---

## 📂 Repository Structure

```text
AutoAG_CLI/
├── assets/                  # Image assets (LogoAG.png)
├── scripts/                 # Compilation, patching and installation scripts
├── src/                     # Source code
│   ├── patch/               # Network preloader patch (Javascript)
│   └── tray/                # Windows System Tray App (C#)
│       └── Resources/       # Built resolution icons (logo.ico, logo_disabled.ico)
├── install.bat              # One-click installer shortcut (Root)
├── uninstall.bat            # One-click uninstaller shortcut
└── AutoAG_Tray.exe          # Compiled Windows System Tray binary
```

---

## ⚡ Quick Start

### 1. Installation

> [!IMPORTANT]
> Make sure you have launched Antigravity IDE at least once before installing.

Run the shortcut script directly from the root folder:
* Double-click **`install.bat`** to automatically patch and activate AutoAG.

---

### 2. Control via Windows System Tray

Double-click **`AutoAG_Tray.exe`** to launch the administration icon in your Windows Taskbar corner:

| System Icon | Action Status | Description |
| :---: | :--- | :--- |
| <img src="src/tray/Resources/logo.ico" width="20"/> | **Active** | AutoAG is actively intercepting and auto-approving in `<1ms`! |
| <img src="src/tray/Resources/logo_disabled.ico" width="20"/> | **Disabled** | Autopilot paused. Reverts to default user prompt behavior. |

---

### 3. Uninstallation

Double-click **`uninstall.bat`** at the root of the project to completely restore the Antigravity IDE to its original, unpatched state.

---

<p align="center">
  Found a bug or want to suggest updates? Feel free to open an Issue or submit a Pull Request! ❤️
</p>
