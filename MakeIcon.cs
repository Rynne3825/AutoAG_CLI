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
            int[] sizes = { 16, 32, 48, 256 };
            string outputPath = "logo.ico";

            Console.WriteLine("Start generating logo.ico with multi-resolutions...");

            try
            {
                using (FileStream fs = new FileStream(outputPath, FileMode.Create))
                using (BinaryWriter bw = new BinaryWriter(fs))
                {
                    // 1. Write standard ICO header (6 bytes)
                    bw.Write((short)0); // Reserved (always 0)
                    bw.Write((short)1); // Type (1 = Icon, 2 = Cursor)
                    bw.Write((short)sizes.Length); // Number of images in file

                    byte[][] pngBytes = new byte[sizes.Length][];
                    long dataOffset = 6 + (sizes.Length * 16); // Data starts after Header + Directory Entries

                    // 2. Generate PNG images and cache their bytes
                    for (int i = 0; i < sizes.Length; i++)
                    {
                        int size = sizes[i];
                        using (Bitmap bmp = new Bitmap(size, size))
                        {
                            using (Graphics g = Graphics.FromImage(bmp))
                            {
                                g.SmoothingMode = SmoothingMode.HighQuality;
                                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                                g.Clear(Color.Transparent);

                                // Dynamic scale variables
                                float strokeWidth = size * 0.08f;
                                if (strokeWidth < 1.5f) strokeWidth = 1.5f;

                                float pad = size * 0.05f;
                                float w = size - (pad * 2);

                                // Obsidian dark background for the icon circle
                                using (Brush bgBrush = new SolidBrush(Color.FromArgb(15, 23, 42))) // #0f172a
                                {
                                    g.FillEllipse(bgBrush, pad, pad, w, w);
                                }

                                // Outer orbital glowing ring with premium linear gradient
                                Color startColor = Color.FromArgb(0, 242, 254); // Neon Cyan
                                Color endColor = Color.FromArgb(161, 140, 209);   // Violet/Purple
                                
                                using (var ringBrush = new LinearGradientBrush(
                                    new RectangleF(pad, pad, w, w), startColor, endColor, 45f))
                                using (Pen ringPen = new Pen(ringBrush, strokeWidth))
                                {
                                    g.DrawEllipse(ringPen, pad, pad, w, w);
                                }

                                // Draw stylized high-end letter "A" in the center with mathematical alignment
                                float fontSize = size * 0.48f;
                                using (Font font = new Font("Segoe UI", fontSize, FontStyle.Bold))
                                using (Brush textBrush = new SolidBrush(Color.White))
                                using (StringFormat sf = new StringFormat())
                                {
                                    sf.Alignment = StringAlignment.Center;
                                    sf.LineAlignment = StringAlignment.Center;
                                    g.DrawString("A", font, textBrush, new RectangleF(pad, pad, w, w), sf);
                                }
                            }

                            // Save Bitmap as PNG bytes in memory
                            using (MemoryStream ms = new MemoryStream())
                            {
                                bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                                pngBytes[i] = ms.ToArray();
                            }
                        }
                    }

                    // 3. Write Directory Entries (16 bytes per entry)
                    for (int i = 0; i < sizes.Length; i++)
                    {
                        int size = sizes[i];
                        bw.Write((byte)(size >= 256 ? 0 : size)); // Width (0 means 256)
                        bw.Write((byte)(size >= 256 ? 0 : size)); // Height (0 means 256)
                        bw.Write((byte)0); // Color Palette (0 for PNG/TrueColor)
                        bw.Write((byte)0); // Reserved
                        bw.Write((short)1); // Color Planes (1)
                        bw.Write((short)32); // Bits per Pixel (32-bit depth)
                        bw.Write((int)pngBytes[i].Length); // Size of the raw image data in bytes
                        bw.Write((int)dataOffset); // Offset of raw image data from beginning of file

                        dataOffset += pngBytes[i].Length; // Advance offset pointer
                    }

                    // 4. Write Raw Image Data
                    for (int i = 0; i < sizes.Length; i++)
                    {
                        bw.Write(pngBytes[i]);
                    }
                }

                Console.WriteLine("Success: logo.ico created successfully!");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error generating icon: " + ex.Message);
            }
        }
    }
}
