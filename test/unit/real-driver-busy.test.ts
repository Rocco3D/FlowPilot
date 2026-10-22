import { beforeEach, describe, expect, it } from "vitest";
import { RealFlowDriver } from "../../src/flow/real-driver.js";
import { setLocale } from "../../src/i18n/index.js";

describe("RealFlowDriver while a job uses the page", () => {
  beforeEach(() => setLocale("en"));

  // The first page() call never resolves, so the media list keeps the page busy for the whole test.
  const busyDriver = async () => {
    const page = { url: () => "https://flow.google.com/project/25b7a0e8?hl=en" };
    let calls = 0;
    const session = {
      page: () => (calls++ === 0 ? new Promise(() => undefined) : Promise.resolve(page)),
      status: async () => ({ chromeRunning: true, connected: true, message: "Connected." }),
    };
    const driver = new RealFlowDriver(session as never);
    void driver.listMedia("p1");
    // Let the list take the page first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return driver;
  };

  it("answers doctor without touching the page and without the model check", async () => {
    const status = await (await busyDriver()).doctor();
    expect(status.signedIn).toBe(true);
    expect(status.configuredModels).toBeUndefined();
    expect(status.message).toContain("checked once it ends");
  });

  it("refuses the self-test and a model list it has not read yet", async () => {
    const driver = await busyDriver();
    await expect(driver.selftest()).rejects.toMatchObject({ code: "job_running" });
    await expect(driver.listModels()).rejects.toMatchObject({ code: "job_running" });
  });
});
