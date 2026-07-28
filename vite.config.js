import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Android builds and release APKs live inside the project directory, but
    // they are not web source files. Watching them can crash the Windows dev
    // server with EBUSY while Gradle or Explorer has an APK open.
    watch: {
      ignored: ["**/android/**", "**/release/**", "**/dist/**"]
    }
  }
});
