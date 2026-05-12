import './globals.css';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AuthProvider }  from '../contexts/AuthContext';

export const metadata = {
  title: 'Dashboard | Hệ Thống Đặt Bàn',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      {/* Script chạy đồng bộ trước khi render để tránh flash khi dark mode đã lưu */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();` }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
