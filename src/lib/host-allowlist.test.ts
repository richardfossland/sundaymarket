// Pure unit tests for the OPTIONAL Sunday Account host allowlist — the single
// authorization spot. Run with: npm test  (tsx --test).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isEmailAllowed, parseAdminEmails } from '@/lib/host-allowlist'

test('parseAdminEmails splits on comma/space/newline and lowercases', () => {
  assert.deepEqual(parseAdminEmails('A@x.com, b@x.com\nc@x.com  d@x.com'), [
    'a@x.com',
    'b@x.com',
    'c@x.com',
    'd@x.com',
  ])
})

test('parseAdminEmails is empty for null/empty/whitespace', () => {
  assert.deepEqual(parseAdminEmails(null), [])
  assert.deepEqual(parseAdminEmails(''), [])
  assert.deepEqual(parseAdminEmails('   \n  '), [])
})

test('isEmailAllowed: allowlisted email passes (case-insensitive) -> 200 path', () => {
  assert.equal(isEmailAllowed('Host@Church.org', 'host@church.org'), true)
  assert.equal(isEmailAllowed('host@church.org', 'a@x.com, host@church.org'), true)
})

test('isEmailAllowed: signed-in but NOT allowlisted is rejected -> 403 path', () => {
  assert.equal(isEmailAllowed('stranger@evil.com', 'host@church.org'), false)
})

test('isEmailAllowed: FAIL-CLOSED when allowlist is empty/unset', () => {
  // Even a real-looking email must be denied when nobody is allowlisted.
  assert.equal(isEmailAllowed('host@church.org', ''), false)
  assert.equal(isEmailAllowed('host@church.org', null), false)
  assert.equal(isEmailAllowed('host@church.org', undefined), false)
})

test('isEmailAllowed: missing email is rejected -> not-signed-in (401) path', () => {
  assert.equal(isEmailAllowed(null, 'host@church.org'), false)
  assert.equal(isEmailAllowed(undefined, 'host@church.org'), false)
  assert.equal(isEmailAllowed('', 'host@church.org'), false)
})
