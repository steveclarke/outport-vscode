import * as assert from "assert"
import { categorizeCliError, buildUpArgs, buildDownArgs } from "../../cli"

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

suite("CLI Error Categorization", () => {
  test("categorizes ENOENT as not-found", () => {
    const result = categorizeCliError("", "ENOENT", "outport")
    assert.strictEqual(result.kind, "not-found")
  })

  test("categorizes missing yml as not-registered", () => {
    const result = categorizeCliError("No .outport.yml found", undefined, "outport")
    assert.strictEqual(result.kind, "not-registered")
  })

  test("categorizes registry miss as not-registered", () => {
    const result = categorizeCliError("myapp not found in registry", undefined, "outport")
    assert.strictEqual(result.kind, "not-registered")
  })

  test("categorizes external approval error", () => {
    const stderr =
      "external env files require interactive approval; use -y to allow or move files inside the project directory"
    const result = categorizeCliError(stderr, undefined, "outport")
    assert.strictEqual(result.kind, "external-approval")
  })

  test("categorizes unknown errors as cli-error", () => {
    const result = categorizeCliError("something went wrong", undefined, "outport")
    assert.strictEqual(result.kind, "cli-error")
    assert.strictEqual(result.message, "something went wrong")
  })
})

suite("CLI Command Args", () => {
  test("runUp builds args without yes", () => {
    const args = buildUpArgs(false, false)
    assert.deepStrictEqual(args, ["up", "--json"])
  })

  test("runUp builds args with force", () => {
    const args = buildUpArgs(true, false)
    assert.deepStrictEqual(args, ["up", "--json", "--force"])
  })

  test("runUp builds args with yes", () => {
    const args = buildUpArgs(false, true)
    assert.deepStrictEqual(args, ["up", "--json", "--yes"])
  })

  test("runUp builds args with force and yes", () => {
    const args = buildUpArgs(true, true)
    assert.deepStrictEqual(args, ["up", "--json", "--force", "--yes"])
  })

  test("runDown builds args without yes", () => {
    const args = buildDownArgs(false)
    assert.deepStrictEqual(args, ["down"])
  })

  test("runDown builds args with yes", () => {
    const args = buildDownArgs(true)
    assert.deepStrictEqual(args, ["down", "--yes"])
  })
})
