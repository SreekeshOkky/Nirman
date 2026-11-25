// Local OCR server for Docker / development: same handler as api/ocr.js.
//   INTERNAL_API_SECRET=... node scripts/ocr-server.mjs   (listens on :3001)
import http from "node:http";
import { handleOcrRequest } from "../server/ocr.js";

const port = Number(process.env.PORT || 3001);
http.createServer(handleOcrRequest).listen(port, () => {
  console.log(`OCR server listening on http://localhost:${port}`);
});
