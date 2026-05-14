// Không còn auth — component này chỉ giữ lại để tránh sửa từng trang,
// nhưng thực ra chỉ render children thẳng.
export default function ProtectedPage({ children }) {
  return children;
}
