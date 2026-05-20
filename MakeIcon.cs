using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Xml;
using System.Globalization;

namespace AutoAG_IconGenerator
{
    public class MakeIcon
    {
        public static void Main()
        {
            string svgPath = "logo.svg";
            string activeOut = "logo.ico";
            string disabledOut = "logo_disabled.ico";

            if (!File.Exists(svgPath))
            {
                Console.WriteLine("Error: logo.svg not found in directory!");
                return;
            }

            Console.WriteLine("Reading and parsing logo.svg...");
            try
            {
                // Load XML Document
                XmlDocument doc = new XmlDocument();
                doc.Load(svgPath);

                int[] sizes = { 16, 32, 48, 256 };

                // Generate active and disabled icon files
                GenerateIconFile(doc, sizes, activeOut, false);
                GenerateIconFile(doc, sizes, disabledOut, true);

                Console.WriteLine("Success: Dynamic multi-resolution icons generated successfully!");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error generating icon from SVG: " + ex.Message + "\n" + ex.StackTrace);
            }
        }

        private static void GenerateIconFile(XmlDocument doc, int[] sizes, string outputPath, bool isGrayscale)
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

                // Render each size to PNG bytes
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

                            // The SVG viewBox is 0 0 800 800. Scale factor to target size:
                            float scale = size / 800.0f;

                            // Draw SVG elements
                            RenderSvg(doc, g, scale, isGrayscale);
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

        private static void RenderSvg(XmlDocument doc, Graphics g, float scale, bool isGrayscale)
        {
            // Set up a custom XML Namespace Manager if needed (logo.svg doesn't have default ns prefixes, so standard XPath is fine)
            XmlNode svgNode = doc.DocumentElement;

            foreach (XmlNode node in svgNode.ChildNodes)
            {
                if (node.NodeType != XmlNodeType.Element) continue;

                string name = node.Name;
                if (name == "rect")
                {
                    float width = GetFloatAttr(node, "width");
                    float height = GetFloatAttr(node, "height");
                    float rx = GetFloatAttr(node, "rx");
                    string fill = GetStrAttr(node, "fill");

                    using (Brush brush = GetBrush(fill, isGrayscale, 0, 0, width * scale, height * scale))
                    {
                        if (rx > 0)
                        {
                            // Draw rounded rect
                            using (GraphicsPath path = GetRoundedRectPath(0, 0, width * scale, height * scale, rx * scale))
                            {
                                g.FillPath(brush, path);
                            }
                        }
                        else
                        {
                            g.FillRectangle(brush, 0, 0, width * scale, height * scale);
                        }
                    }
                }
                else if (name == "circle")
                {
                    float cx = GetFloatAttr(node, "cx");
                    float cy = GetFloatAttr(node, "cy");
                    float r = GetFloatAttr(node, "r");
                    string fill = GetStrAttr(node, "fill");
                    float opacity = GetFloatAttr(node, "opacity", 1.0f);

                    if (opacity > 0)
                    {
                        using (Brush brush = GetBrush(fill, isGrayscale, (cx - r) * scale, (cy - r) * scale, (cx + r) * scale, (cy + r) * scale, opacity))
                        {
                            g.FillEllipse(brush, (cx - r) * scale, (cy - r) * scale, 2 * r * scale, 2 * r * scale);
                        }
                    }
                }
                else if (name == "ellipse")
                {
                    float cx = GetFloatAttr(node, "cx");
                    float cy = GetFloatAttr(node, "cy");
                    float rx = GetFloatAttr(node, "rx");
                    float ry = GetFloatAttr(node, "ry");
                    string fill = GetStrAttr(node, "fill");
                    string stroke = GetStrAttr(node, "stroke");
                    float strokeWidth = GetFloatAttr(node, "stroke-width", 1.0f);
                    string transform = GetStrAttr(node, "transform");
                    float opacity = GetFloatAttr(node, "opacity", 1.0f);

                    // Setup transformation
                    GraphicsState state = g.Save();
                    g.TranslateTransform(cx * scale, cy * scale);

                    if (!string.IsNullOrEmpty(transform) && transform.Contains("rotate"))
                    {
                        // Parse rotate(-30, 400, 400) or rotate(45, 400, 400) -> we just rotate around center
                        int start = transform.IndexOf("rotate(") + 7;
                        int end = transform.IndexOf(")", start);
                        string rotVal = transform.Substring(start, end - start).Split(',')[0].Trim();
                        float angle = float.Parse(rotVal, CultureInfo.InvariantCulture);
                        g.RotateTransform(angle);
                    }

                    if (fill != "none" && !string.IsNullOrEmpty(fill))
                    {
                        using (Brush brush = GetBrush(fill, isGrayscale, -rx * scale, -ry * scale, rx * scale, ry * scale, opacity))
                        {
                            g.FillEllipse(brush, -rx * scale, -ry * scale, 2 * rx * scale, 2 * ry * scale);
                        }
                    }

                    if (stroke != "none" && !string.IsNullOrEmpty(stroke))
                    {
                        using (Brush brush = GetBrush(stroke, isGrayscale, -rx * scale, -ry * scale, rx * scale, ry * scale, opacity))
                        using (Pen pen = new Pen(brush, strokeWidth * scale))
                        {
                            g.DrawEllipse(pen, -rx * scale, -ry * scale, 2 * rx * scale, 2 * ry * scale);
                        }
                    }

                    g.Restore(state);
                }
                else if (name == "g")
                {
                    // For groups, parse child elements recursively
                    RenderGroup(node, g, scale, isGrayscale);
                }
            }
        }

        private static void RenderGroup(XmlNode groupNode, Graphics g, float scale, bool isGrayscale)
        {
            float groupOpacity = GetFloatAttr(groupNode, "opacity", 1.0f);
            if (groupOpacity <= 0) return;

            string groupTransform = GetStrAttr(groupNode, "transform");
            GraphicsState state = g.Save();

            if (!string.IsNullOrEmpty(groupTransform) && groupTransform.Contains("translate"))
            {
                // Parse translate(400, 400)
                int start = groupTransform.IndexOf("translate(") + 10;
                int end = groupTransform.IndexOf(")", start);
                string[] parts = groupTransform.Substring(start, end - start).Split(new char[] { ',', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                float tx = float.Parse(parts[0].Trim(), CultureInfo.InvariantCulture);
                float ty = float.Parse(parts[1].Trim(), CultureInfo.InvariantCulture);
                g.TranslateTransform(tx * scale, ty * scale);
            }

            foreach (XmlNode node in groupNode.ChildNodes)
            {
                if (node.NodeType != XmlNodeType.Element) continue;

                string name = node.Name;
                if (name == "circle")
                {
                    float cx = GetFloatAttr(node, "cx");
                    float cy = GetFloatAttr(node, "cy");
                    float r = GetFloatAttr(node, "r");
                    string fill = GetStrAttr(node, "fill");
                    float opacity = GetFloatAttr(node, "opacity", 1.0f) * groupOpacity;

                    using (Brush brush = GetBrush(fill, isGrayscale, (cx - r) * scale, (cy - r) * scale, (cx + r) * scale, (cy + r) * scale, opacity))
                    {
                        g.FillEllipse(brush, (cx - r) * scale, (cy - r) * scale, 2 * r * scale, 2 * r * scale);
                    }
                }
                else if (name == "rect")
                {
                    float x = GetFloatAttr(node, "x");
                    float y = GetFloatAttr(node, "y");
                    float width = GetFloatAttr(node, "width");
                    float height = GetFloatAttr(node, "height");
                    float rx = GetFloatAttr(node, "rx");
                    string fill = GetStrAttr(node, "fill");
                    float opacity = GetFloatAttr(node, "opacity", 1.0f) * groupOpacity;

                    using (Brush brush = GetBrush(fill, isGrayscale, x * scale, y * scale, (x + width) * scale, (y + height) * scale, opacity))
                    {
                        if (rx > 0)
                        {
                            using (GraphicsPath path = GetRoundedRectPath(x * scale, y * scale, width * scale, height * scale, rx * scale))
                            {
                                g.FillPath(brush, path);
                            }
                        }
                        else
                        {
                            g.FillRectangle(brush, x * scale, y * scale, width * scale, height * scale);
                        }
                    }
                }
                else if (name == "path")
                {
                    string d = GetStrAttr(node, "d");
                    string fill = GetStrAttr(node, "fill");
                    string stroke = GetStrAttr(node, "stroke");
                    float strokeWidth = GetFloatAttr(node, "stroke-width", 1.0f);
                    float opacity = GetFloatAttr(node, "opacity", 1.0f) * groupOpacity;

                    using (GraphicsPath path = ParseSvgPath(d, scale, 0, 0))
                    {
                        if (fill != "none" && !string.IsNullOrEmpty(fill))
                        {
                            RectangleF bounds = path.GetBounds();
                            using (Brush brush = GetBrush(fill, isGrayscale, bounds.Left, bounds.Top, bounds.Right, bounds.Bottom, opacity))
                            {
                                g.FillPath(brush, path);
                            }
                        }

                        if (stroke != "none" && !string.IsNullOrEmpty(stroke))
                        {
                            RectangleF bounds = path.GetBounds();
                            using (Brush brush = GetBrush(stroke, isGrayscale, bounds.Left, bounds.Top, bounds.Right, bounds.Bottom, opacity))
                            using (Pen pen = new Pen(brush, strokeWidth * scale))
                            {
                                pen.LineJoin = LineJoin.Round;
                                pen.StartCap = LineCap.Round;
                                pen.EndCap = LineCap.Round;
                                g.DrawPath(pen, path);
                            }
                        }
                    }
                }
            }

            g.Restore(state);
        }

        private static Brush GetBrush(string fillVal, bool isGrayscale, float x1, float y1, float x2, float y2, float opacity = 1.0f)
        {
            int alpha = (int)(opacity * 255);
            if (alpha < 0) alpha = 0;
            if (alpha > 255) alpha = 255;

            // Handle URL gradients
            if (fillVal.StartsWith("url(#"))
            {
                string id = fillVal.Substring(5, fillVal.Length - 6);
                if (id == "bgGrad")
                {
                    // radialGradient simulation
                    Color c1 = ApplyGrayscale(Color.FromArgb(alpha, 20, 25, 35), isGrayscale); // #141923
                    Color c2 = ApplyGrayscale(Color.FromArgb(alpha, 3, 4, 6), isGrayscale);   // #030406
                    
                    // Simple radial gradient approximation via path gradient
                    GraphicsPath path = new GraphicsPath();
                    path.AddRectangle(new RectangleF(x1, y1, x2 - x1, y2 - y1));
                    PathGradientBrush pgb = new PathGradientBrush(path);
                    pgb.CenterColor = c1;
                    pgb.SurroundColors = new Color[] { c2 };
                    return pgb;
                }
                else if (id == "cyanGlow")
                {
                    Color c1 = ApplyGrayscale(Color.FromArgb(alpha, 0, 242, 254), isGrayscale); // #00f2fe
                    Color c2 = ApplyGrayscale(Color.FromArgb(alpha, 0, 102, 255), isGrayscale); // #0066ff
                    return new LinearGradientBrush(new RectangleF(x1, y1, x2 - x1, y2 - y1), c1, c2, 45f);
                }
                else if (id == "purpleGlow")
                {
                    Color c1 = ApplyGrayscale(Color.FromArgb(alpha, 248, 87, 166), isGrayscale); // #f857a6
                    Color c2 = ApplyGrayscale(Color.FromArgb(alpha, 161, 140, 209), isGrayscale); // #a18cd1
                    return new LinearGradientBrush(new RectangleF(x1, y1, x2 - x1, y2 - y1), c1, c2, 45f);
                }
                else if (id == "letterAGrad")
                {
                    Color c1 = ApplyGrayscale(Color.FromArgb(alpha, 255, 255, 255), isGrayscale);
                    Color c2 = ApplyGrayscale(Color.FromArgb((int)(alpha * 0.6f), 0, 229, 255), isGrayscale); // #00e5ff
                    return new LinearGradientBrush(new RectangleF(x1, y1, x2 - x1, y2 - y1), c1, c2, 90f);
                }
            }

            // Parse hex color values
            Color color = Color.White;
            if (fillVal.StartsWith("#"))
            {
                string hex = fillVal.Substring(1);
                if (hex.Length == 6)
                {
                    int r = int.Parse(hex.Substring(0, 2), NumberStyles.HexNumber);
                    int g = int.Parse(hex.Substring(2, 2), NumberStyles.HexNumber);
                    int b = int.Parse(hex.Substring(4, 2), NumberStyles.HexNumber);
                    color = Color.FromArgb(alpha, r, g, b);
                }
            }
            else if (fillVal == "none")
            {
                color = Color.Transparent;
            }

            return new SolidBrush(ApplyGrayscale(color, isGrayscale));
        }

        private static Color ApplyGrayscale(Color c, bool isGrayscale)
        {
            if (!isGrayscale) return c;
            int luminance = (int)(0.299f * c.R + 0.587f * c.G + 0.114f * c.B);
            return Color.FromArgb(c.A, luminance, luminance, luminance);
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

        private static GraphicsPath ParseSvgPath(string pathData, float scale, float offsetX, float offsetY)
        {
            GraphicsPath path = new GraphicsPath();
            string normalized = pathData.Replace(",", " ").Replace("M", " M ").Replace("L", " L ").Replace("C", " C ").Replace("Z", " Z ");
            string[] tokens = normalized.Split(new char[] { ' ', '\r', '\n', '\t' }, StringSplitOptions.RemoveEmptyEntries);

            int i = 0;
            PointF currentPoint = new PointF(0, 0);

            while (i < tokens.Length)
            {
                string cmd = tokens[i++];
                if (cmd == "M")
                {
                    float x = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetX;
                    float y = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetY;
                    path.StartFigure();
                    currentPoint = new PointF(x, y);
                }
                else if (cmd == "L")
                {
                    float x = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetX;
                    float y = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetY;
                    path.AddLine(currentPoint, new PointF(x, y));
                    currentPoint = new PointF(x, y);
                }
                else if (cmd == "C")
                {
                    float x1 = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetX;
                    float y1 = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetY;
                    float x2 = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetX;
                    float y2 = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetY;
                    float x = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetX;
                    float y = float.Parse(tokens[i++], CultureInfo.InvariantCulture) * scale + offsetY;
                    path.AddBezier(currentPoint, new PointF(x1, y1), new PointF(x2, y2), new PointF(x, y));
                    currentPoint = new PointF(x, y);
                }
                else if (cmd == "Z")
                {
                    path.CloseFigure();
                }
            }
            return path;
        }

        private static float GetFloatAttr(XmlNode node, string attrName, float defaultVal = 0f)
        {
            XmlAttribute attr = node.Attributes[attrName];
            if (attr == null) return defaultVal;
            return float.Parse(attr.Value, CultureInfo.InvariantCulture);
        }

        private static string GetStrAttr(XmlNode node, string attrName, string defaultVal = "")
        {
            XmlAttribute attr = node.Attributes[attrName];
            if (attr == null) return defaultVal;
            return attr.Value;
        }
    }
}
