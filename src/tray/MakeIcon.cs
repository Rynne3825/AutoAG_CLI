using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;

namespace AutoAG_IconGenerator
{
    public class MakeIcon
    {
        public static void Main()
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string pngPath = Path.Combine(exeDir, @"..\..\assets\LogoAG.png");
            if (!File.Exists(pngPath)) pngPath = Path.Combine(exeDir, @"..\assets\LogoAG.png"); // Fallback
            if (!File.Exists(pngPath)) pngPath = Path.Combine(exeDir, "LogoAG.png"); // Fallback 2
            if (!File.Exists(pngPath)) pngPath = "LogoAG.png"; // Fallback 3

            string resourcesDir = Path.Combine(exeDir, "Resources");
            if (!Directory.Exists(resourcesDir))
            {
                Directory.CreateDirectory(resourcesDir);
            }

            string activeOut = Path.Combine(resourcesDir, "logo.ico");
            string disabledOut = Path.Combine(resourcesDir, "logo_disabled.ico");

            if (!File.Exists(pngPath))
            {
                Console.WriteLine("Error: LogoAG.png not found at: " + Path.GetFullPath(pngPath));
                return;
            }

            Console.WriteLine("Loading premium LogoAG.png...");
            try
            {
                using (Bitmap srcBmp = new Bitmap(pngPath))
                {
                    int[] sizes = { 16, 32, 48, 256 };

                    // 1. Generate active icon
                    GenerateIconFromPng(srcBmp, sizes, activeOut);

                    // 2. Generate professional grayscale disabled icon
                    using (Bitmap grayBmp = CreateGrayscale(srcBmp))
                    {
                        GenerateIconFromPng(grayBmp, sizes, disabledOut);
                    }
                }
                Console.WriteLine("Success: Dynamic multi-resolution icons generated perfectly from LogoAG.png!");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error generating icon from PNG: " + ex.Message + "\n" + ex.StackTrace);
            }
        }

        private static Bitmap CreateGrayscale(Bitmap original)
        {
            Bitmap newBitmap = new Bitmap(original.Width, original.Height);
            using (Graphics g = Graphics.FromImage(newBitmap))
            {
                // Professional luminance-preserving color matrix
                System.Drawing.Imaging.ColorMatrix colorMatrix = new System.Drawing.Imaging.ColorMatrix(
                    new float[][]
                    {
                        new float[] {.299f, .299f, .299f, 0, 0},
                        new float[] {.587f, .587f, .587f, 0, 0},
                        new float[] {.114f, .114f, .114f, 0, 0},
                        new float[] {0,      0,      0,      1, 0},
                        new float[] {0,      0,      0,      0, 1}
                    });

                using (System.Drawing.Imaging.ImageAttributes attributes = new System.Drawing.Imaging.ImageAttributes())
                {
                    attributes.SetColorMatrix(colorMatrix);
                    g.DrawImage(original, new Rectangle(0, 0, original.Width, original.Height),
                                0, 0, original.Width, original.Height, GraphicsUnit.Pixel, attributes);
                }
            }
            return newBitmap;
        }

        private static void GenerateIconFromPng(Bitmap srcBmp, int[] sizes, string outputPath)
        {
            using (FileStream fs = new FileStream(outputPath, FileMode.Create))
            using (BinaryWriter bw = new BinaryWriter(fs))
            {
                // Write standard ICO header (6 bytes)
                bw.Write((short)0); // Reserved
                bw.Write((short)1); // Type: Icon
                bw.Write((short)sizes.Length); // Number of resolutions

                byte[][] pngBytes = new byte[sizes.Length][];
                long dataOffset = 6 + (sizes.Length * 16); // Data starts after header and entries

                // Render each size to PNG bytes using HighQualityBicubic scaling
                for (int i = 0; i < sizes.Length; i++)
                {
                    int size = sizes[i];
                    using (Bitmap bmp = new Bitmap(size, size))
                    {
                        using (Graphics g = Graphics.FromImage(bmp))
                        {
                            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                            g.SmoothingMode = SmoothingMode.HighQuality;
                            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                            g.CompositingQuality = CompositingQuality.HighQuality;
                            g.Clear(Color.Transparent);
                            
                            // Apply rounded rectangle clipping mask to perfectly remove white corners
                            float radius = 160f * (size / 800f);
                            using (GraphicsPath clipPath = GetRoundedRectPath(0, 0, size, size, radius))
                            {
                                g.SetClip(clipPath);
                            }
                            
                            // Crop/zoom the center of LogoAG.png for small icons to make it look much larger in the system tray!
                            int srcWidth = srcBmp.Width;
                            int srcHeight = srcBmp.Height;
                            RectangleF srcRect;

                            if (size <= 48)
                            {
                                // Zoom in on the central 70% of the logo to discard the wide dark border and make it huge and clear!
                                float zoomFactor = 0.70f;
                                float cropWidth = srcWidth * zoomFactor;
                                float cropHeight = srcHeight * zoomFactor;
                                float x = (srcWidth - cropWidth) / 2f;
                                float y = (srcHeight - cropHeight) / 2f;
                                srcRect = new RectangleF(x, y, cropWidth, cropHeight);
                            }
                            else
                            {
                                // Keep the full view for the high-res 256x256 icon
                                srcRect = new RectangleF(0, 0, srcWidth, srcHeight);
                            }

                            g.DrawImage(srcBmp, new RectangleF(0, 0, size, size), srcRect, GraphicsUnit.Pixel);
                        }

                        using (MemoryStream ms = new MemoryStream())
                        {
                            bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                            pngBytes[i] = ms.ToArray();
                        }
                    }
                }

                // Write Directory Entries (16 bytes per entry)
                for (int i = 0; i < sizes.Length; i++)
                {
                    int size = sizes[i];
                    bw.Write((byte)(size >= 256 ? 0 : size)); // Width
                    bw.Write((byte)(size >= 256 ? 0 : size)); // Height
                    bw.Write((byte)0); // Colors
                    bw.Write((byte)0); // Reserved
                    bw.Write((short)1); // Planes
                    bw.Write((short)32); // Bits per pixel
                    bw.Write((int)pngBytes[i].Length); // Data size
                    bw.Write((int)dataOffset); // Data offset

                    dataOffset += pngBytes[i].Length;
                }

                // Write PNG image bytes
                for (int i = 0; i < sizes.Length; i++)
                {
                    bw.Write(pngBytes[i]);
                }
            }
            Console.WriteLine("Generated standard Windows Icon: " + outputPath);
        }

        private static GraphicsPath GetRoundedRectPath(float x, float y, float width, float height, float radius)
        {
            GraphicsPath path = new GraphicsPath();
            float diameter = radius * 2;
            path.StartFigure();
            path.AddArc(x, y, diameter, diameter, 180, 90);
            path.AddArc(x + width - diameter, y, diameter, diameter, 270, 90);
            path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0, 90);
            path.AddArc(x, y + height - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
