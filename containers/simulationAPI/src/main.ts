import { buildApp } from "./app.js";

// 0.0.0.0 so the port is reachable from outside the container; the compose
// file maps it to 127.0.0.1:3003 on the box, and nginx is the only public
// path in (ADR-002).
const PORT = Number(process.env["PORT"] ?? 3003);

const app = await buildApp();

try {
  await app.listen({ host: "0.0.0.0", port: PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
