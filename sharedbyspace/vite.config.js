import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "firebase-app": [
            "firebase/app",
            "firebase/analytics"
          ],
          "firebase-auth": [
            "firebase/auth",
          ],
          "firebase-data": [
            "firebase/firestore",
          ],
          "firebase-functions": [
            "firebase/functions",
          ],
          "firebase-storage": [
            "firebase/storage"
          ],
          react: ["react", "react-dom", "react-dom/client"],
          icons: ["lucide-react"]
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
