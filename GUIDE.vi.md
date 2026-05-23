# 📖 Hướng Dẫn Sử Dụng AutoAG CLI ⚡

Chào mừng bạn đến với **AutoAG CLI** - Giải pháp phê duyệt quyền tự động siêu tốc và ẩn danh hoàn hảo dành cho **Antigravity IDE** trên hệ điều hành Windows.

Tài liệu này sẽ hướng dẫn bạn chi tiết từ cách thức hoạt động, cách cài đặt, sử dụng và quản trị hệ thống để đạt hiệu quả tối ưu nhất.

---

## 💡 1. Nguyên Lý Hoạt Động (How It Works)

Hệ thống hoạt động dựa trên cơ chế **Phê Duyệt Kép (Dual-Layer Auto-Submit)** cực kỳ mạnh mẽ:

1. **Chế Độ Chạy Ngầm Hoàn Toàn (Silent Background - gRPC Stream)**:
   * Khi bạn chuyển sang làm việc ở dự án khác hoặc cửa sổ khác (background sessions), AutoAG sẽ kích hoạt công nghệ đánh chặn gói tin mạng gRPC-Web qua cổng kết nối của Antigravity.
   * Ngay khi tác tử gửi yêu cầu chạy lệnh hoặc truy cập file, AutoAG sẽ phê duyệt trực tiếp trên tầng mạng trong **<1 mili-giây**. 
   * **Kết quả:** Các lệnh chạy nền được phê duyệt ẩn 100%, không cần mở tab, không nhấp nháy màn hình, hoàn toàn vô hình đối với mắt người dùng.

2. **Chế Độ Hoạt Động Trên Giao Diện (Foreground Fallback - DOM Automation)**:
   * Khi bạn đang ở tab chính (foreground session), giao diện hiển thị thẻ phê duyệt của IDE sẽ xuất hiện.
   * Lúc này, bộ quét DOM siêu tốc của AutoAG sẽ phát hiện thẻ cấp quyền trong vòng **10ms**, tự động tích chọn phương án đồng ý đầu tiên (*Yes, allow this time*) thông qua Radix UI Engine và tự động nhấn nút *Submit* trong vòng **20ms**.
   * **Kết quả:** Hộp thoại vừa xuất hiện sẽ tự động biến mất và phê duyệt tức thì trước khi bạn kịp nhận ra.

---

## 🚀 2. Hướng Dẫn Cài Đặt (Installation)

### 📋 Yêu cầu hệ thống:
* Máy tính chạy hệ điều hành Windows.
* Đã cài đặt **Antigravity IDE** (và khởi động nó ít nhất 1 lần để tạo cấu trúc).
* Đã cài đặt **Node.js** và **npx** (để thực hiện giải nén/đóng gói tệp tin hệ thống).

### 🛠 Các bước cài đặt:
1. Tải repository **AutoAG_CLI** về máy tính.
2. Nhấp đúp (Double-click) vào tệp **`install.bat`** nằm ở thư mục gốc của dự án.
3. Kịch bản cài đặt tự động sẽ thực hiện:
   * Tìm kiếm thư mục cài đặt gốc của Antigravity IDE trong hệ thống.
   * Tạo bản sao lưu dự phòng an toàn cho tệp gốc (`app.asar.bak`).
   * Tự động giải nén, tiêm mã bản vá siêu tốc vào `preload.js` và vô hiệu hóa chế độ Sandbox hạn chế của Electron.
   * Tự động đóng gói lại cấu trúc tệp hệ thống an toàn và thông báo thành công.

---

## 🎮 3. Cách Sử Dụng Hàng Ngày (Daily Usage)

Sau khi cài đặt thành công, bạn **không cần phải thực hiện bất kỳ thao tác thủ công nào nữa!** AutoAG sẽ tự động chạy song hành cùng IDE:

* **Chạy lệnh Terminal**: Khi bạn chạy các lệnh hệ thống (như `ping`, `ipconfig`, `systeminfo`...), hộp thoại cấp quyền xuất hiện và sẽ tự động được phê duyệt ngay tức khắc.
* **Gọi công cụ MCP (MCP Tools)**: Khi gọi các công cụ kết nối ngoài như Chrome DevTools, các hộp thoại cấp quyền MCP cũng sẽ được tự động chọn và gửi đi.
* **Truy cập tệp tin (File Access)**: Tự động phê duyệt các quyền đọc/ghi file trên bộ nhớ.

> [!TIP]
> **Mẹo nhỏ:** Nếu sau khi cập nhật mã nguồn hoặc cài đặt, bạn thấy hộp thoại không tự động biến mất, hãy nhấn tổ hợp phím **`Ctrl + R`** trên ứng dụng Antigravity để tải lại giao diện (Reload Window) nhằm nạp lại bản vá mới nhất.

---

## 🎛️ 4. Quản Trị Qua Khay Hệ Thống (System Tray Administration)

Bạn có thể quản lý trạng thái hoạt động của AutoAG một cách chuyên nghiệp bằng cách nhấp đúp vào tệp **`AutoAG_Tray.exe`**:

Biểu tượng logo sấm sét màu xanh của AutoAG sẽ xuất hiện ở góc dưới bên phải màn hình (khay hệ thống Windows Taskbar). Bạn có thể nhấp chuột phải vào biểu tượng để:

* **Bật/Tắt Phê Duyệt Tự Động (Toggle Enabled/Disabled)**:
  * Biểu tượng màu xanh lá 🟢: Hệ thống đang kích hoạt tự động phê duyệt siêu tốc.
  * Biểu tượng màu đỏ/xám 🔴: Đang tạm dừng. IDE sẽ quay về hỏi quyền thủ công như bình thường.
* **Xem Nhật Ký Hoạt Động (View Logs)**: Mở nhanh tệp `autosubmit.log` để kiểm tra lịch sử các lệnh đã được phê duyệt tự động.
* **Thoát Khay Hệ Thống (Exit)**: Đóng bảng điều khiển ở khay hệ thống.

---

## 🛠 5. Khắc Phục Sự Cố (Troubleshooting)

| Sự cố | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **IDE bị màn hình tối/không tải được** | Lỗi trong quá trình đóng gói asar | Nhấp đúp vào tệp **`uninstall.bat`** ở thư mục gốc để khôi phục IDE về trạng thái nguyên bản 100%, sau đó cài đặt lại. |
| **Hộp thoại xuất hiện mà không tự biến mất** | Giao diện Electron chưa nạp bản vá | Nhấn tổ hợp phím **`Ctrl + R`** trên Antigravity để tải lại giao diện, hoặc khởi động lại IDE. |
| **Lệnh chạy nền không tự phê duyệt** | Chưa bật chế độ cho phép trong khay hệ thống | Mở khay hệ thống, chuột phải vào logo AutoAG và đảm bảo trạng thái hiển thị màu xanh (Active). |

---

<p align="center">
  Chúc bạn có những trải nghiệm lập trình siêu tốc và năng suất vượt trội cùng AutoAG CLI! ⚡🚀
</p>
