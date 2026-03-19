import * as assert from "assert"
import { findPosition, validateConfig } from "../../diagnostics"

suite("Diagnostics", () => {
  suite("findPosition", () => {
    const text = [
      "name: myapp",
      "",
      "services:",
      "  web:",
      "    env_var: PORT",
      "    hostname: myapp.test",
    ].join("\n")

    test("finds key on correct line", () => {
      const pos = findPosition(text, "hostname", "web")
      assert.strictEqual(pos.line, 5)
    })

    test("returns line 0 when not found", () => {
      const pos = findPosition(text, "nonexistent", "web")
      assert.strictEqual(pos.line, 0)
    })
  })

  suite("validateConfig", () => {
    // Hostname requires protocol
    test("errors when hostname set without protocol", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT", hostname: "myapp.test" } },
      })
      assert.ok(
        errors.some((e) => e.message.includes("hostname") && e.message.includes("protocol")),
      )
    })

    test("no error when hostname has protocol", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT", hostname: "myapp.test", protocol: "http" } },
      })
      assert.ok(!errors.some((e) => e.message.includes("protocol")))
    })

    // Hostname must contain project name
    test("warns when hostname does not contain project name", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT", hostname: "other.test", protocol: "http" } },
      })
      assert.ok(
        errors.some(
          (e) => e.message.includes("must contain project name") && e.severity === "warning",
        ),
      )
    })

    test("no warning when hostname contains project name", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT", hostname: "myapp.test", protocol: "http" } },
      })
      assert.ok(!errors.some((e) => e.message.includes("must contain project name")))
    })

    // Duplicate env_var per file
    test("errors on duplicate env_var in same file", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" }, api: { env_var: "PORT" } },
      })
      assert.ok(errors.some((e) => e.message.includes("both write")))
    })

    test("no error when env_vars are unique", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" }, postgres: { env_var: "DB_PORT" } },
      })
      assert.ok(!errors.some((e) => e.message.includes("both write")))
    })

    test("no error when same env_var is in different files", () => {
      const errors = validateConfig({
        name: "myapp",
        services: {
          web: { env_var: "PORT", env_file: "frontend/.env" },
          api: { env_var: "PORT", env_file: "backend/.env" },
        },
      })
      assert.ok(!errors.some((e) => e.message.includes("both write")))
    })

    // Computed: unknown service reference
    test("errors when computed references unknown service", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { API_URL: { value: "${nosuch.url}", env_file: ".env" } },
      })
      assert.ok(errors.some((e) => e.message.includes("unknown service")))
    })

    // Computed: name collision
    test("errors when computed name collides with service env_var", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { PORT: { value: "${web.port}", env_file: ".env" } },
      })
      assert.ok(errors.some((e) => e.message.includes("conflicts")))
    })

    // Computed: missing value
    test("errors when computed missing value and no per-file override", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { API_URL: { env_file: ".env" } },
      })
      assert.ok(errors.some((e) => e.message.includes("missing") && e.message.includes("value")))
    })

    test("no error when per-file overrides cover all entries", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: {
          API_URL: { env_file: [{ file: "frontend/.env", value: "${web.url}" }] },
        },
      })
      assert.ok(!errors.some((e) => e.message.includes("missing") && e.message.includes("value")))
    })

    // Template: unknown field
    test("errors on unknown template field", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { URL: { value: "${web.bogus}", env_file: ".env" } },
      })
      assert.ok(errors.some((e) => e.message.includes("unknown field")))
    })

    // Template: invalid modifier
    test("errors on invalid modifier", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { URL: { value: "${web.url:bogus}", env_file: ".env" } },
      })
      assert.ok(errors.some((e) => e.message.includes("unknown modifier")))
    })

    test("allows valid modifier url:direct", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { URL: { value: "${web.url:direct}", env_file: ".env" } },
      })
      assert.ok(!errors.some((e) => e.message.includes("modifier")))
    })

    // Template: standalone variables
    test("errors on unknown standalone variable", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { LABEL: { value: "${bogus}", env_file: ".env" } },
      })
      assert.ok(errors.some((e) => e.message.includes("unknown variable")))
    })

    test("allows ${instance} standalone variable", () => {
      const errors = validateConfig({
        name: "myapp",
        services: { web: { env_var: "PORT" } },
        computed: { LABEL: { value: "myapp-${instance}", env_file: ".env" } },
      })
      assert.ok(!errors.some((e) => e.message.includes("unknown variable")))
    })
  })
})
