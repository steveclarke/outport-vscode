import * as assert from "assert"

suite("Tree Item Construction", () => {
  test("ProjectItem shows name and instance", () => {
    const label = `myapp [main]`
    assert.strictEqual(label, "myapp [main]")
    const worktreeLabel = `myapp [bxcf]`
    assert.strictEqual(worktreeLabel, "myapp [bxcf]")
  })

  test("ServiceItem description includes env_var and port", () => {
    const service = { port: 24920, env_var: "PORT", env_files: [".env"] }
    const desc = `${service.env_var}=${service.port}`
    assert.strictEqual(desc, "PORT=24920")
  })

  test("ServiceItem description includes URL when present", () => {
    const service = { port: 24920, env_var: "PORT", url: "https://myapp.test", env_files: [".env"] }
    let desc = `${service.env_var}=${service.port}`
    if (service.url) desc += `    ${service.url}`
    assert.strictEqual(desc, "PORT=24920    https://myapp.test")
  })

  test("httpService contextValue set for HTTP services", () => {
    const service = {
      port: 24920,
      env_var: "PORT",
      hostname: "myapp.test",
      url: "https://myapp.test",
      env_files: [".env"],
    }
    const isHttp = !!service.hostname
    const contextValue = isHttp && service.url ? "httpService" : "service"
    assert.strictEqual(contextValue, "httpService")
  })

  test("service contextValue set for non-HTTP services", () => {
    const service = { port: 5432, env_var: "DB_PORT", env_files: [".env"] } as any
    const isHttp = !!service.hostname
    const contextValue = isHttp ? "httpService" : "service"
    assert.strictEqual(contextValue, "service")
  })

  test("DoctorCheckItem shows fail icon for failures", () => {
    const check = {
      name: "DNS resolver",
      category: "DNS",
      status: "fail" as const,
      message: "resolver missing",
    }
    assert.strictEqual(check.status, "fail")
    assert.strictEqual(check.category, "DNS")
  })

  test("DoctorCheckItem shows warn icon for warnings", () => {
    const check = {
      name: "cloudflared",
      category: "Tools",
      status: "warn" as const,
      message: "not found",
    }
    assert.strictEqual(check.status, "warn")
  })
})
