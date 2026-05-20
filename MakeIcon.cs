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
            string pngPath = "logo.png";
            string activeOut = "logo.ico";
            string disabledOut = "logo_disabled.ico";

            if (!File.Exists(pngPath))
            {
                Console.WriteLine("Error: logo.png not found!");
                return;
            }

            Console.WriteLine("Loading pixel-perfect logo.png...");
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
                Console.WriteLine("Success: Dynamic multi-resolution icons generated perfectly from logo.png!");
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
                            
                            g.DrawImage(srcBmp, 0, 0, size, size);
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
    }
}
