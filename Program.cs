using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AutoAG_CLI
{
    static class Program
    {
        private static System.Threading.Mutex mutex = null;

        [STAThread]
        static void Main()
        {
            bool createdNew;
            // Use a unique name for the Mutex to ensure uniqueness across the system
            mutex = new System.Threading.Mutex(true, "AutoAG_Tray_SingleInstance_Mutex_Unique_123", out createdNew);

            if (!createdNew)
            {
                // Another instance is already running, exit silently to prevent duplicate tray icons
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayApplicationContext());

            // Keep the Mutex alive until the application exits
            GC.KeepAlive(mutex);
        }
    }

    public class TrayApplicationContext : ApplicationContext
    {
        private NotifyIcon notifyIcon;
        private ContextMenu contextMenu;
        private MenuItem toggleItem;
        private MenuItem startupItem;
        private MenuItem exitItem;

        private readonly string settingsDir;
        private readonly string settingsPath;
        private bool isEnabled = true;

        public TrayApplicationContext()
        {
            // Resolve paths
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            settingsDir = Path.Combine(userProfile, ".gemini", "antigravity");
            settingsPath = Path.Combine(settingsDir, "autosubmit.json");

            // Load initial state
            LoadSettings();

            // Initialize Context Menu
            contextMenu = new ContextMenu();

            toggleItem = new MenuItem("Auto-Submit Enabled", ToggleAutoSubmit);
            toggleItem.Checked = isEnabled;

            startupItem = new MenuItem("Run on Windows Startup", ToggleStartup);
            startupItem.Checked = IsStartupEnabled();

            exitItem = new MenuItem("Exit", Exit);

            contextMenu.MenuItems.Add(toggleItem);
            contextMenu.MenuItems.Add(startupItem);
            contextMenu.MenuItems.Add("-"); // Separator
            contextMenu.MenuItems.Add(exitItem);

            // Initialize Notify Icon
            notifyIcon = new NotifyIcon();
            notifyIcon.ContextMenu = contextMenu;
            notifyIcon.Visible = true;
            notifyIcon.DoubleClick += ToggleAutoSubmit;

            // Update Icon and Tooltip
            UpdateIconAndTooltip();

            // Run the automated patcher silently on startup
            RunPatcherSilently();
        }

        private void RunPatcherSilently()
        {
            try
            {
                string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "patcher.ps1");
                if (File.Exists(scriptPath))
                {
                    System.Diagnostics.ProcessStartInfo psi = new System.Diagnostics.ProcessStartInfo();
                    psi.FileName = "powershell.exe";
                    psi.Arguments = string.Format("-NoProfile -ExecutionPolicy Bypass -File \"{0}\"", scriptPath);
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = true;
                    System.Diagnostics.Process.Start(psi);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error running patcher: " + ex.Message);
            }
        }

        private void LoadSettings()

        {
            try
            {
                if (File.Exists(settingsPath))
                {
                    string content = File.ReadAllText(settingsPath);
                    if (content.Contains("\"enabled\": false"))
                    {
                        isEnabled = false;
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error reading settings: " + ex.Message);
            }
            isEnabled = true;
        }

        private void SaveSettings()
        {
            try
            {
                if (!Directory.Exists(settingsDir))
                {
                    Directory.CreateDirectory(settingsDir);
                }
                string json = string.Format("{{\n  \"enabled\": {0}\n}}", isEnabled ? "true" : "false");
                File.WriteAllText(settingsPath, json);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to save settings: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ToggleAutoSubmit(object sender, EventArgs e)
        {
            isEnabled = !isEnabled;
            toggleItem.Checked = isEnabled;
            SaveSettings();
            UpdateIconAndTooltip();
        }

        private bool IsStartupEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", false))
                {
                    if (key != null)
                    {
                        object value = key.GetValue("AutoAG_Tray");
                        return value != null && value.ToString() == Application.ExecutablePath;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error reading startup registry key: " + ex.Message);
            }
            return false;
        }

        private void ToggleStartup(object sender, EventArgs e)
        {
            try
            {
                bool currentlyEnabled = IsStartupEnabled();
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                {
                    if (key != null)
                    {
                        if (currentlyEnabled)
                        {
                            key.DeleteValue("AutoAG_Tray", false);
                            startupItem.Checked = false;
                            notifyIcon.ShowBalloonTip(2000, "AutoAG CLI", "Đã tắt khởi động cùng Windows.", ToolTipIcon.Info);
                        }
                        else
                        {
                            key.SetValue("AutoAG_Tray", Application.ExecutablePath);
                            startupItem.Checked = true;
                            notifyIcon.ShowBalloonTip(2000, "AutoAG CLI", "Đã bật tự động khởi động cùng Windows!", ToolTipIcon.Info);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to modify startup registry key: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void UpdateIconAndTooltip()
        {
            // Dispose old icon if it exists to avoid memory leak
            if (notifyIcon.Icon != null)
            {
                notifyIcon.Icon.Dispose();
            }

            // Create a dynamic icon with premium neon gradient style matching the SVG logo
            using (Bitmap bitmap = new Bitmap(16, 16))
            {
                using (Graphics g = Graphics.FromImage(bitmap))
                {
                    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

                    // Obsidian dark background for the icon circle
                    using (Brush bgBrush = new SolidBrush(Color.FromArgb(15, 23, 42))) // #0f172a
                    {
                        g.FillEllipse(bgBrush, 0, 0, 15, 15);
                    }

                    // Outer orbital glowing ring with premium linear gradient
                    Color startColor = isEnabled ? Color.FromArgb(0, 242, 254) : Color.FromArgb(117, 117, 117); // Neon Cyan / Grey
                    Color endColor = isEnabled ? Color.FromArgb(161, 140, 209) : Color.FromArgb(64, 64, 64);   // Purple / Dark Grey
                    
                    using (var ringBrush = new System.Drawing.Drawing2D.LinearGradientBrush(
                        new Rectangle(0, 0, 15, 15), startColor, endColor, 45f))
                    {
                        using (Pen ringPen = new Pen(ringBrush, 1.5f))
                        {
                            g.DrawEllipse(ringPen, 0, 0, 15, 15);
                        }
                    }

                    // Draw stylized high-end letter "A" in the center (ClearType subpixel rendering)
                    using (Font font = new Font("Segoe UI", 8f, FontStyle.Bold))
                    using (Brush textBrush = new SolidBrush(Color.White))
                    {
                        // Center the letter A perfectly
                        g.DrawString("A", font, textBrush, 1.5f, 0.5f);
                    }
                }

                // Get Hicon from Bitmap
                IntPtr hIcon = bitmap.GetHicon();
                notifyIcon.Icon = Icon.FromHandle(hIcon);
            }

            // Update Tooltip
            notifyIcon.Text = string.Format("AutoAG: Auto-Submit is {0}", isEnabled ? "ENABLED" : "DISABLED");
        }

        private void Exit(object sender, EventArgs e)
        {
            // Clean up resources
            notifyIcon.Visible = false;
            if (notifyIcon.Icon != null)
            {
                notifyIcon.Icon.Dispose();
            }
            notifyIcon.Dispose();
            Application.Exit();
        }
    }
}
