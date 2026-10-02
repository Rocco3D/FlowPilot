import { startService } from "../core/service.js";
import { RealFlowDriver } from "../flow/real-driver.js";
import { t } from "../i18n/index.js";

try {
  const service = await startService({ driver: new RealFlowDriver() });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void service.stop().then(() => process.exit(0)));
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${t("flow.driver.fatal", { reason })}\n`);
  process.exit(1);
}
