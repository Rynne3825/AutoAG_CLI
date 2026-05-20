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
        private const string CurrentVersion = "v1.1.0";

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
            notifyIcon.BalloonTipClicked += OnBalloonTipClicked;

            // Update Icon and Tooltip
            UpdateIconAndTooltip();

            // Run the automated patcher silently on startup
            RunPatcherSilently();

            // Check for updates asynchronously in background thread
            CheckForUpdates();
        }

        private void CheckForUpdates()
        {
            System.Threading.ThreadPool.QueueUserWorkItem(state =>
            {
                try
                {
                    // Delay check by 3 seconds for smooth startup
                    System.Threading.Thread.Sleep(3000);

                    using (System.Net.WebClient client = new System.Net.WebClient())
                    {
                        // Supply user agent header as required by GitHub
                        client.Headers.Add("User-Agent", "AutoAG_Tray_Updater");

                        // Fetch latest version string from raw GitHub CDN
                        string rawVersion = client.DownloadString("https://raw.githubusercontent.com/Rynne3825/AutoAG_CLI/main/version.txt");

                        if (!string.IsNullOrEmpty(rawVersion))
                        {
                            string latestVersion = rawVersion.Trim();

                            // Trigger notification if version mismatch detected
                            if (latestVersion != CurrentVersion)
                            {
                                notifyIcon.ShowBalloonTip(
                                    5000,
                                    "✨ AutoAG CLI - Có cập nhật mới! / New Update!",
                                    string.Format("Đã có phiên bản {0} (Hiện tại: {1}). Nhấn vào đây để tải về! / Version {0} is available. Click here to download!", latestVersion, CurrentVersion),
                                    ToolTipIcon.Info
                                );
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Error checking for updates: " + ex.Message);
                }
            });
        }

        private void OnBalloonTipClicked(object sender, EventArgs e)
        {
            try
            {
                System.Diagnostics.Process.Start("https://github.com/Rynne3825/AutoAG_CLI");
            }
            catch (Exception ex)
            {
                MessageBox.Show("Failed to open update URL: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void RunPatcherSilently()
        {
            try
            {
                string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"scripts\patcher.ps1");
                if (!File.Exists(scriptPath))
                {
                    scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "patcher.ps1"); // Fallback
                }
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

        private Icon GetEmbeddedIcon(string resourceName)
        {
            try
            {
                using (Stream stream = System.Reflection.Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
                {
                    if (stream != null)
                    {
                        return new Icon(stream);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error loading embedded icon: " + ex.Message);
            }
            return null;
        }

        private void UpdateIconAndTooltip()
        {
            // Dispose old icon if it exists to avoid memory leak
            if (notifyIcon.Icon != null)
            {
                notifyIcon.Icon.Dispose();
            }

            // Load the perfect, high-resolution embedded resource icon (built directly from logo.svg!)
            string resourceName = isEnabled ? "AutoAG_CLI.logo.ico" : "AutoAG_CLI.logo_disabled.ico";
            Icon icon = GetEmbeddedIcon(resourceName);

            if (icon != null)
            {
                notifyIcon.Icon = icon;
            }
            else
            {
                // Fallback: simple default draw if resource is missing
                using (Bitmap bitmap = new Bitmap(16, 16))
                {
                    using (Graphics g = Graphics.FromImage(bitmap))
                    {
                        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                        using (Brush bgBrush = new SolidBrush(Color.FromArgb(15, 23, 42)))
                        {
                            g.FillEllipse(bgBrush, 0, 0, 15, 15);
                        }
                    }
                    IntPtr hIcon = bitmap.GetHicon();
                    notifyIcon.Icon = Icon.FromHandle(hIcon);
                }
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
