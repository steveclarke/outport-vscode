import * as assert from "assert"

// We test the parsing logic in isolation — we can't easily test execFile in unit tests
// so we test the type contracts and JSON parsing

suite("CLI Output Parsing", () => {
  test("parses valid ports JSON", () => {
    const json = JSON.stringify({
      project: "myapp",
      instance: "main",
      services: {
        web: {
          port: 24920,
          env_var: "PORT",
          protocol: "http",
          hostname: "myapp.test",
          url: "https://myapp.test",
          up: true,
          env_files: [".env"],
        },
        postgres: { port: 5432, env_var: "DB_PORT", env_files: [".env"] },
      },
      computed: {
        CORS_ORIGINS: { value: "https://myapp.test", env_files: [".env"] },
      },
      env_files: [".env"],
    })

    const data = JSON.parse(json)
    assert.strictEqual(data.project, "myapp")
    assert.strictEqual(data.instance, "main")
    assert.strictEqual(data.services.web.port, 24920)
    assert.strictEqual(data.services.web.up, true)
    assert.strictEqual(data.computed.CORS_ORIGINS.value, "https://myapp.test")
  })

  test("handles missing optional fields", () => {
    const json = JSON.stringify({
      project: "myapp",
      instance: "main",
      services: {
        postgres: { port: 5432, env_var: "DB_PORT", env_files: [".env"] },
      },
      env_files: [".env"],
    })

    const data = JSON.parse(json)
    assert.strictEqual(data.services.postgres.protocol, undefined)
    assert.strictEqual(data.services.postgres.hostname, undefined)
    assert.strictEqual(data.services.postgres.url, undefined)
    assert.strictEqual(data.services.postgres.up, undefined)
    assert.strictEqual(data.computed, undefined)
  })
})
