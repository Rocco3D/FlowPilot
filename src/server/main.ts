import { loadConfig } from "../core/config.js";
import { startService } from "../core/service.js";
import { checkForUpdate } from "../core/update.js";
import { RealFlowDriver } from "../flow/real-driver.js";
import { setLocale, t } from "../i18n/index.js";

try {
  // The configured language has to be fixed before the service exists: errors translate themselves as they are built.
  setLocale(loadConfig().locale);
  const service = await startService({
    driver: new RealFlowDriver(),
    checkUpdate: checkForUpdate,
    onExit: () => process.exit(0),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => service.shutdown());
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${t("flow.driver.fatal", { reason })}\n`);
  process.exit(1);
}
