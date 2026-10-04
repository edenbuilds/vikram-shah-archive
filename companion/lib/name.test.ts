import assert from "node:assert/strict";
import { test } from "node:test";
import { firstName } from "./name.ts";

test("the greeting uses the name on the account before anything from the email", () => {
  assert.equal(firstName({ email: "x@y.in", user_metadata: { full_name: "arya  Kulkarni" } }), "Arya");
  assert.equal(firstName({ email: "x@y.in", user_metadata: { name: "RAVI" } }), "Ravi");
});
test("with no name on the account, the first word of the email is used and digits end it", () => {
  assert.equal(firstName({ email: "arya.k@chambers.in" }), "Arya");
  assert.equal(firstName({ email: "omkar1sonawane@gmail.com", user_metadata: { email_verified: true } }), "Omkar");
});
test("an email that gives no word leaves the greeting without a name", () => {
  assert.equal(firstName({ email: "123@x.in" }), "");
  assert.equal(firstName({}), "");
});
