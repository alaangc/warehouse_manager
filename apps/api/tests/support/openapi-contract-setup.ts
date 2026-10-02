import supertest from 'supertest';
import { afterAll } from 'vitest';
import { loadContractValidator } from '../../../../packages/contracts/scripts/validate-runtime-contract.js';

const validator = await loadContractValidator();
const originalEnd = supertest.Test.prototype.end;
afterAll(() => {
  supertest.Test.prototype.end = originalEnd;
});
supertest.Test.prototype.end = function (callback) {
  this.expect((response: supertest.Response) => {
    const url = this.url;
    const method = this.method;
    validator.response(method, url, {
      status: response.status,
      headers: response.headers,
      body: response.status === 204 ? response.text : response.body,
    });
    // Rejected requests may intentionally violate the request schema (or fail
    // authorization before validation). Every successful request must conform.
    if (response.status < 400) {
      const input = this as unknown as { _data?: unknown; header: Record<string, string> };
      validator.request(method, url, { headers: input.header, body: input._data });
    }
  });
  return originalEnd.call(this, callback);
};
