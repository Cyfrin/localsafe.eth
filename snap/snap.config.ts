import { resolve } from "path";
import type { SnapConfig } from "@metamask/snaps-cli";

const config: SnapConfig = {
  input: resolve(__dirname, "src/index.ts"),
  server: { port: 8088 },
  polyfills: {
    buffer: true,
  },
};

export default config;
