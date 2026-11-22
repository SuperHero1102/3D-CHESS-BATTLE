# Thư mục Mô hình 3D La Mã (.glb)

Đặt tối đa 6 file `.glb` tải miễn phí từ Sketchfab (lọc **Downloadable + Free**) vào thư mục `/models` này (cùng cấp với `index.html`):

| Quân cờ | Tên file bắt buộc | Từ khóa gợi ý trên Sketchfab |
|---|---|---|
| Tốt (Pawn) | `roman_legionary.glb` | `Roman Legionary` |
| Xe (Rook) | `roman_tower.glb` | `Roman Tower` hoặc `Heavy Roman Warrior` |
| Mã (Knight) | `roman_cavalry.glb` | `Roman Cavalry` hoặc `Knight Horse` |
| Tượng (Bishop) | `roman_priest.glb` | `Roman Priest` hoặc `Mage Staff` |
| Hậu (Queen) | `roman_queen.glb` | `Athena Warrior` hoặc `Valkyrie` |
| Vua (King) | `roman_emperor.glb` | `Roman Emperor` hoặc `Julius Caesar` |

- Nếu chưa có file `.glb`, game tự động dùng bộ tượng chiến binh La Mã 3D tích hợp sẵn.
- Có thể tinh chỉnh tỷ lệ `scale` từng quân cờ trong `src/three/modelLoader.ts` (`MODEL_CONFIG`).
