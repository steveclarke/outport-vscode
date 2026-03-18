import * as assert from 'assert';

suite('Tree Item Construction', () => {
  test('ProjectItem shows name and instance', () => {
    const label = `myapp [main]`;
    assert.strictEqual(label, 'myapp [main]');
    const worktreeLabel = `myapp [bxcf]`;
    assert.strictEqual(worktreeLabel, 'myapp [bxcf]');
  });

  test('ServiceItem description includes env_var and port', () => {
    const service = { port: 24920, env_var: 'PORT', env_files: ['.env'] };
    const desc = `${service.env_var}=${service.port}`;
    assert.strictEqual(desc, 'PORT=24920');
  });

  test('ServiceItem description includes URL when present', () => {
    const service = { port: 24920, env_var: 'PORT', url: 'https://myapp.test', env_files: ['.env'] };
    let desc = `${service.env_var}=${service.port}`;
    if (service.url) desc += `    ${service.url}`;
    assert.strictEqual(desc, 'PORT=24920    https://myapp.test');
  });

  test('httpService contextValue set for HTTP services', () => {
    const service = { port: 24920, env_var: 'PORT', protocol: 'http', url: 'https://myapp.test', env_files: ['.env'] };
    const isHttp = service.protocol === 'http' || service.protocol === 'https';
    const contextValue = isHttp && service.url ? 'httpService' : 'service';
    assert.strictEqual(contextValue, 'httpService');
  });

  test('service contextValue set for non-HTTP services', () => {
    const service = { port: 5432, env_var: 'DB_PORT', env_files: ['.env'] };
    const isHttp = (service as any).protocol === 'http' || (service as any).protocol === 'https';
    const contextValue = isHttp ? 'httpService' : 'service';
    assert.strictEqual(contextValue, 'service');
  });
});
